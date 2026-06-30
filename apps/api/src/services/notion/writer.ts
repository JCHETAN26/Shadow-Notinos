import {
  type DocPatchPlan,
  type PatchAction,
  type NotionWriteResult,
} from "@shadow/shared";
import { notion, richTextToPlain, callout, code, todo, bullet } from "../../integrations/notion.js";
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

/** Apply a single action to Notion and return a result. */
async function applyAction(plan: DocPatchPlan, action: PatchAction): Promise<NotionWriteResult> {
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

  // append_* actions: insert after the matching heading, or at the end of the page.
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
  const results: NotionWriteResult[] = [];
  let applied = 0;
  let failed = 0;

  await logRunEvent(runId, "block_write_started", `Applying ${plan.actions.length} action(s)`);

  for (const row of plan.actions) {
    const action = row.notionPayload as unknown as PatchAction;
    try {
      const result = await applyAction(doc, action);
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
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: ok ? "applied" : "failed" },
  });
  await logRunEvent(
    runId,
    ok ? "block_write_completed" : "write_failed",
    `Applied ${applied}/${plan.actions.length} action(s)${failed ? `, ${failed} failed` : ""}`,
  );
  await logRunEvent(runId, "run_completed", ok ? "Run complete" : "Run completed with write failures");

  return { ok, applied, failed, results };
}
