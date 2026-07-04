import {
  type DocPatchPlan,
  type PatchAction,
  type NotionWriteResult,
} from "@shadow/shared";
import { notion, richTextToPlain, callout, code, todo, bullet, toggle, paragraph } from "../../integrations/notion.js";
import { env } from "../../env.js";
import { prisma } from "../../db/prisma.js";
import { logRunEvent } from "../audit.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry Notion calls on rate limits (429) and transient 5xx with linear backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status ?? 0;
      if (status === 429 || status >= 500) {
        await sleep(600 * (i + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const lastSegment = (heading: string) => heading.split(">").pop()?.trim() ?? heading;

/** Find a top-level heading block on the page whose text matches the target heading. */
async function findHeadingBlockId(pageId: string, targetHeading: string): Promise<string | null> {
  const want = lastSegment(targetHeading).toLowerCase();
  const res = await withRetry(() => notion().blocks.children.list({ block_id: pageId, page_size: 100 }));
  for (const block of res.results) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = block as any;
    if (typeof b.type === "string" && b.type.startsWith("heading_")) {
      const text = richTextToPlain(b[b.type]?.rich_text).trim().toLowerCase();
      if (text === want) return b.id as string;
    }
  }
  return null;
}

/** Title of the single grouped toggle that holds all not-yet-shipped deltas. */
const PENDING_TOGGLE_TITLE = "Pending changes";

/**
 * Find the page's "Pending changes" toggle, creating it once if absent. All
 * branch deltas that haven't reached the release branch are nested inside it, so
 * the doc body stays honest about production while nothing is lost.
 */
async function ensurePendingToggle(pageId: string): Promise<string> {
  const want = PENDING_TOGGLE_TITLE.toLowerCase();
  const res = await withRetry(() => notion().blocks.children.list({ block_id: pageId, page_size: 100 }));
  for (const block of res.results) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = block as any;
    if (b.type === "toggle" && richTextToPlain(b.toggle?.rich_text).trim().toLowerCase() === want) {
      return b.id as string;
    }
  }
  const created = await withRetry(() =>
    notion().blocks.children.append({
      block_id: pageId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      children: [toggle(PENDING_TOGGLE_TITLE)] as any,
    }),
  );
  return (created.results[0] as { id: string }).id;
}

/** Build the Notion block(s) for an append-style action. */
function blocksFor(action: PatchAction): Array<Record<string, unknown>> {
  switch (action.type) {
    case "append_callout":
      return [callout(action.text, action.icon ?? "💡")];
    case "append_code_block":
      return [code(action.language, action.code)];
    case "append_todo":
      return [todo(action.text, action.checked)];
    case "append_bullets":
      return action.bullets.map((b) => bullet(b));
    default:
      return [];
  }
}

interface ApplyOpts {
  /** When set, append_* deltas are nested here instead of the doc body. */
  pendingToggleId?: string;
  /** Label prepended to a pending delta so it's traceable to its branch/PR. */
  label?: string;
}

/** Apply a single action to Notion and return a result. */
async function applyAction(
  plan: DocPatchPlan,
  action: PatchAction,
  opts: ApplyOpts = {},
): Promise<NotionWriteResult> {
  const client = notion();

  if (action.type === "create_review_task") {
    const db = env.notionDbs.reviewTasks;
    if (!db) throw new Error("NOTION_REVIEW_TASKS_DATABASE_ID is not set.");
    const page = await withRetry(() =>
      client.pages.create({
        parent: { database_id: db },
        properties: {
          Name: { title: [{ type: "text", text: { content: action.title } }] },
          Status: { select: { name: "Todo" } },
          Priority: { select: { name: action.priority } },
          Reason: { rich_text: [{ type: "text", text: { content: action.reason } }] },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      }),
    );
    return { actionType: action.type, ok: true, notionId: page.id };
  }

  if (action.type === "update_doc_status") {
    await withRetry(() =>
      client.pages.update({
        page_id: plan.targetPageId,
        properties: {
          "Doc Status": { select: { name: action.status } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      }),
    );
    return { actionType: action.type, ok: true, notionId: plan.targetPageId };
  }

  // Pending placement: nest the delta (with a branch/PR label) inside the page's
  // "Pending changes" toggle instead of editing the live body.
  if (opts.pendingToggleId) {
    const children = [
      ...(opts.label ? [paragraph(opts.label)] : []),
      ...blocksFor(action),
    ];
    const res = await withRetry(() =>
      client.blocks.children.append({
        block_id: opts.pendingToggleId!,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        children: children as any,
      }),
    );
    const created = res.results[0] as { id?: string } | undefined;
    return { actionType: action.type, ok: true, notionId: created?.id };
  }

  // Body placement: insert after the matching heading, or at the end of the page.
  const headingId = await findHeadingBlockId(plan.targetPageId, action.targetHeading);
  const children = blocksFor(action);
  const res = await withRetry(() =>
    client.blocks.children.append({
      block_id: plan.targetPageId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      children: children as any,
      ...(headingId ? { after: headingId } : {}),
    }),
  );
  const created = res.results[0] as { id?: string } | undefined;
  return { actionType: action.type, ok: true, notionId: created?.id };
}

export interface ApplyResult {
  ok: boolean;
  applied: number;
  failed: number;
  results: NotionWriteResult[];
}

/**
 * Apply an approved patch plan to Notion. Runs actions sequentially (gentle on
 * rate limits), records each PatchAction's outcome, and logs every step.
 */
export async function applyPatchPlan(planId: string): Promise<ApplyResult> {
  const plan = await prisma.patchPlan.findUnique({
    where: { id: planId },
    include: { actions: true },
  });
  if (!plan) throw new Error(`Patch plan ${planId} not found.`);
  if (!env.notionApiKey) throw new Error("NOTION_API_KEY is not set — cannot write to Notion.");

  const runId = plan.agentRunId;
  const doc = plan.patchJson as unknown as DocPatchPlan;
  const placement = doc.placement ?? "body";
  const results: NotionWriteResult[] = [];
  let applied = 0;
  let failed = 0;
  let skipped = 0;

  // Pending deltas carry a branch/PR label and are grouped under one toggle.
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  const baseBranch = doc.baseBranch ?? run?.baseBranch ?? null;
  const prNumber = run?.prNumber;
  const pendingToggleId =
    placement === "pending" ? await ensurePendingToggle(doc.targetPageId) : undefined;

  await logRunEvent(
    runId,
    "block_write_started",
    placement === "pending"
      ? `Staging ${plan.actions.length} change(s) under "${PENDING_TOGGLE_TITLE}" (base: ${baseBranch ?? "?"})`
      : `Applying ${plan.actions.length} action(s)`,
  );

  for (const row of plan.actions) {
    const action = row.notionPayload as unknown as PatchAction;

    // Under pending placement, never restamp the live page's status — the
    // production doc isn't outdated just because an unreleased branch changed.
    if (placement === "pending" && action.type === "update_doc_status") {
      skipped += 1;
      results.push({ actionType: action.type, ok: true });
      await prisma.patchAction.update({ where: { id: row.id }, data: { status: "skipped" } });
      continue;
    }

    const label =
      placement === "pending" && "targetHeading" in action
        ? `${baseBranch ?? "branch"} · PR #${prNumber ?? "?"} → ${action.targetHeading}`
        : undefined;

    try {
      const result = await applyAction(doc, action, { pendingToggleId, label });
      results.push(result);
      applied += 1;
      await prisma.patchAction.update({
        where: { id: row.id },
        data: { status: "applied", notionId: result.notionId, appliedAt: new Date() },
      });
    } catch (err) {
      failed += 1;
      const message = (err as Error).message;
      results.push({ actionType: action.type, ok: false, error: message });
      await prisma.patchAction.update({
        where: { id: row.id },
        data: { status: "failed", errorMessage: message },
      });
      await logRunEvent(runId, "write_failed", `${action.type}: ${message}`);
    }
  }

  const ok = failed === 0;
  await prisma.patchPlan.update({
    where: { id: planId },
    data: { status: ok ? "applied" : "failed", appliedAt: new Date() },
  });
  // Run-level status is owned by the caller (a run may hold several plans).
  await logRunEvent(
    runId,
    ok ? "block_write_completed" : "write_failed",
    `Applied ${applied}/${plan.actions.length} action(s)` +
      `${skipped ? `, ${skipped} skipped` : ""}${failed ? `, ${failed} failed` : ""}`,
  );

  return { ok, applied, failed, results };
}
