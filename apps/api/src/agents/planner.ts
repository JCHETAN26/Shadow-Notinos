import {
  DocPatchPlanSchema,
  type DocPatchPlan,
  type PullRequestContext,
  type SearchResult,
} from "@shadow/shared";
import { callClaude } from "../integrations/anthropic.js";

export interface TargetPage {
  pageId: string;
  title: string;
  headings: string[];
}

export interface PlannerInput {
  runId: string;
  pr: PullRequestContext;
  relatedDocs: SearchResult[];
  targetPage: TargetPage;
}

/** A function that takes (system, user) prompts and returns the model's raw text. Injectable for tests. */
export type ModelCaller = (system: string, user: string) => Promise<string>;

const SYSTEM_PROMPT = `You are Shadow Notino, a careful technical documentation agent.

Your job is to help keep a Notion engineering workspace up to date after GitHub pull requests are merged.

You will receive:
1. Pull request context
2. Changed files and summarized diffs
3. Retrieved Notion documentation pages
4. The target page's current heading structure

Your task:
Generate a safe documentation patch plan.

Rules:
- Do not directly write to Notion.
- Do not invent pages or APIs.
- Only propose changes grounded in the PR context.
- Prefer small, precise edits over broad rewrites.
- If confidence is low, create a review task instead of editing technical docs.
- Always include human verification tasks for behavior that cannot be proven from the diff.
- Use Notion-native block types: callouts, bullets, code blocks, and to-do items.
- targetHeading values MUST be chosen from the provided heading list.
- Output JSON only. No prose, no markdown fences.`;

function jsonSchemaHint(): string {
  return `Return a single JSON object with this exact shape:
{
  "confidence": number (0..1),
  "summary": string,
  "risks": string[],
  "actions": Array of one or more of:
    { "type": "append_callout", "targetHeading": string, "icon"?: string, "text": string }
    { "type": "append_code_block", "targetHeading": string, "language": string, "code": string }
    { "type": "append_todo", "targetHeading": string, "text": string, "checked": boolean }
    { "type": "append_bullets", "targetHeading": string, "bullets": string[] }
    { "type": "create_review_task", "title": string, "reason": string, "priority": "Low"|"Medium"|"High" }
    { "type": "update_doc_status", "status": "Fresh"|"Needs Review"|"Outdated"|"Unknown", "reason": string }
}`;
}

function buildUserPrompt(input: PlannerInput): string {
  const { pr, relatedDocs, targetPage } = input;
  const files = pr.filesChanged
    .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n${f.patchExcerpt ?? ""}`)
    .join("\n");
  const docs = relatedDocs
    .map((d) => `- ${d.title} (score ${d.score.toFixed(2)}) — sections: ${d.matchingSections.map((s) => s.headingPath).filter(Boolean).join("; ")}`)
    .join("\n");

  return `PULL REQUEST
repo: ${pr.repo}  #${pr.prNumber}
title: ${pr.title}
author: ${pr.author}
labels: ${pr.labels.join(", ") || "(none)"}
body:
${pr.body || "(no description)"}

COMMITS
${pr.commits.map((c) => `- ${c}`).join("\n") || "(none)"}

CHANGED FILES
${files || "(none)"}

RELATED NOTION DOCS
${docs || "(none)"}

TARGET PAGE
title: ${targetPage.title}
available headings (use these exact strings for targetHeading):
${targetPage.headings.map((h) => `- ${h}`).join("\n") || "- (page has no headings)"}

${jsonSchemaHint()}`;
}

/** Extract the first complete top-level JSON object from a model response. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model response.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Assemble the full plan, forcing server-controlled identity fields (grounding). */
function assemble(input: PlannerInput, raw: unknown): unknown {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ...obj,
    runId: input.runId,
    targetPageId: input.targetPage.pageId,
    targetPageTitle: input.targetPage.title,
  };
}

/**
 * Generate a validated DocPatchPlan. Asks Claude for JSON, validates with Zod,
 * and retries once with the validation errors (SYSTEM_PROMPT rule #4). Throws a
 * descriptive error if the second attempt is still invalid.
 */
export async function generatePatchPlan(
  input: PlannerInput,
  callModel: ModelCaller = callClaude,
): Promise<DocPatchPlan> {
  const user = buildUserPrompt(input);

  const attempt = async (extra: string): Promise<DocPatchPlan> => {
    const text = await callModel(SYSTEM_PROMPT, user + extra);
    const candidate = assemble(input, extractJson(text));
    const result = DocPatchPlanSchema.safeParse(candidate);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(
        `Validation failed at ${issue?.path.join(".") || "(root)"}: ${issue?.message}`,
      );
    }
    return result.data;
  };

  try {
    return await attempt("");
  } catch (firstErr) {
    // One retry, feeding the error back to the model.
    return attempt(
      `\n\nYour previous response was invalid: ${(firstErr as Error).message}\nReturn corrected JSON only.`,
    );
  }
}
