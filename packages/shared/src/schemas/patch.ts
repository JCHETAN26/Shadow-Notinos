import { z } from "zod";

/**
 * The single most important contract in the system.
 *
 * The LLM only ever PROPOSES one of these objects. It never writes to Notion.
 * The backend validates the plan with Zod, the user approves it, and only then
 * does the Notion writer apply the actions. See SYSTEM_PROMPT.md rule #3.
 */

export const DocStatusSchema = z.enum([
  "Fresh",
  "Needs Review",
  "Outdated",
  "Unknown",
]);
export type DocStatus = z.infer<typeof DocStatusSchema>;

export const ReviewPrioritySchema = z.enum(["Low", "Medium", "High"]);
export type ReviewPriority = z.infer<typeof ReviewPrioritySchema>;

export const PatchActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("append_callout"),
    targetHeading: z.string(),
    icon: z.string().optional(),
    text: z.string(),
  }),
  z.object({
    type: z.literal("append_code_block"),
    targetHeading: z.string(),
    language: z.string(),
    code: z.string(),
  }),
  z.object({
    type: z.literal("append_todo"),
    targetHeading: z.string(),
    text: z.string(),
    checked: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("append_bullets"),
    targetHeading: z.string(),
    bullets: z.array(z.string()),
  }),
  z.object({
    type: z.literal("create_review_task"),
    title: z.string(),
    reason: z.string(),
    priority: ReviewPrioritySchema,
  }),
  z.object({
    type: z.literal("update_doc_status"),
    status: DocStatusSchema,
    reason: z.string(),
  }),
]);
export type PatchAction = z.infer<typeof PatchActionSchema>;
export type PatchActionType = PatchAction["type"];

export const DocPatchPlanSchema = z.object({
  runId: z.string(),
  targetPageId: z.string(),
  targetPageTitle: z.string(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  risks: z.array(z.string()),
  actions: z.array(PatchActionSchema),
});
export type DocPatchPlan = z.infer<typeof DocPatchPlanSchema>;
