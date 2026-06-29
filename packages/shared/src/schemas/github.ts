import { z } from "zod";

/**
 * Minimal shape of the GitHub `pull_request` webhook payload we care about.
 * We intentionally keep this loose (passthrough) because GitHub sends a large
 * payload; we only validate the fields that drive our flow.
 */
export const GitHubMergedPREventSchema = z.object({
  action: z.string(),
  pull_request: z
    .object({
      number: z.number(),
      title: z.string(),
      body: z.string().nullable().optional(),
      html_url: z.string(),
      merged: z.boolean().optional(),
      merged_at: z.string().nullable().optional(),
      user: z.object({ login: z.string() }).partial().optional(),
      labels: z
        .array(z.object({ name: z.string() }).partial())
        .optional()
        .default([]),
    })
    .passthrough(),
  repository: z
    .object({
      full_name: z.string(),
      html_url: z.string().optional(),
    })
    .passthrough(),
});
export type GitHubMergedPREvent = z.infer<typeof GitHubMergedPREventSchema>;

/** A changed file, summarized down from the raw GitHub files payload. */
export const ChangedFileSchema = z.object({
  filename: z.string(),
  status: z.string(),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  /** A trimmed patch hunk — never the full diff. */
  patchExcerpt: z.string().optional(),
});
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

/**
 * Compact, LLM-ready representation of a merged PR.
 * Built by the PR context fetcher (Phase 4) so we never hand the raw diff to the model.
 */
export const PullRequestContextSchema = z.object({
  repo: z.string(),
  prNumber: z.number(),
  title: z.string(),
  body: z.string().default(""),
  author: z.string().default("unknown"),
  url: z.string(),
  mergedAt: z.string().nullable().optional(),
  labels: z.array(z.string()).default([]),
  commits: z.array(z.string()).default([]),
  filesChanged: z.array(ChangedFileSchema).default([]),
  diffSummary: z.string().default(""),
});
export type PullRequestContext = z.infer<typeof PullRequestContextSchema>;
