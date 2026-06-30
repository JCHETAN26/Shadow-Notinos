import type { AgentRunStatus, DocPatchPlan, PatchAction } from "@shadow/shared";

export type { AgentRunStatus, DocPatchPlan, PatchAction };

export interface RunListItem {
  id: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  author: string | null;
  status: AgentRunStatus;
  createdAt: string;
  _count?: { patchPlans: number };
}

export interface RunEvent {
  id: string;
  type: string;
  message: string | null;
  createdAt: string;
}

export interface PatchPlanRecord {
  id: string;
  status: string;
  patchJson: DocPatchPlan;
  createdAt: string;
  approvedAt: string | null;
  appliedAt: string | null;
}

export interface PullRequestContextView {
  title: string;
  body: string;
  author: string;
  labels: string[];
  commits: string[];
  filesChanged: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patchExcerpt?: string;
  }>;
  diffSummary: string;
}

export interface RelatedDocView {
  pageId: string;
  title: string;
  score: number;
}

export interface RunDetail extends RunListItem {
  diffSummary: string | null;
  impactSummary: string | null;
  prContext: PullRequestContextView | null;
  relatedDocs: RelatedDocView[] | null;
  events: RunEvent[];
  patchPlans: PatchPlanRecord[];
}

/** UI label + Tailwind classes for each run status. */
export const STATUS_META: Record<AgentRunStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-muted text-muted-foreground" },
  fetching_pr: { label: "Fetching PR", cls: "bg-blue-50 text-blue-700" },
  indexing: { label: "Indexing", cls: "bg-blue-50 text-blue-700" },
  searching: { label: "Searching", cls: "bg-blue-50 text-blue-700" },
  planning: { label: "Planning", cls: "bg-violet-50 text-violet-700" },
  waiting_approval: { label: "Waiting approval", cls: "bg-amber-50 text-amber-700" },
  applying: { label: "Applying", cls: "bg-blue-50 text-blue-700" },
  applied: { label: "Applied", cls: "bg-green-50 text-green-700" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-700" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
};
