import {
  type ChangedFile,
  type PullRequestContext,
  PullRequestContextSchema,
} from "@shadow/shared";
import { github } from "../../integrations/github/client.js";
import { SAMPLE_MERGED_PR } from "../../fixtures/sample-pr-merged.js";

const MAX_FILES = 25;
const MAX_PATCH_LINES = 30;

/** Trim a raw file patch to a compact excerpt so we never ship a huge diff to the LLM. */
function trimPatch(patch: string | undefined): string | undefined {
  if (!patch) return undefined;
  const lines = patch.split("\n");
  if (lines.length <= MAX_PATCH_LINES) return patch;
  return lines.slice(0, MAX_PATCH_LINES).join("\n") + `\n… (+${lines.length - MAX_PATCH_LINES} more lines)`;
}

/** Build a short, human-readable summary of the changed files. */
function buildDiffSummary(files: ChangedFile[]): string {
  if (files.length === 0) return "No files changed.";
  return files
    .map((f) => `${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
    .join("\n");
}

/** The run fields the fetcher needs (a subset of AgentRun). */
export interface RunRef {
  repo: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  author: string | null;
}

/** Fetch PR context from the live GitHub API. */
async function fetchLive(run: RunRef): Promise<PullRequestContext> {
  const [owner, repo] = run.repo.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo "${run.repo}" (expected owner/repo).`);
  const gh = github();
  const prNumber = run.prNumber;

  const { data: pr } = await gh.pulls.get({ owner, repo, pull_number: prNumber });
  const { data: files } = await gh.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 });
  const { data: commits } = await gh.pulls.listCommits({ owner, repo, pull_number: prNumber, per_page: 100 });

  const changedFiles: ChangedFile[] = files.slice(0, MAX_FILES).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patchExcerpt: trimPatch(f.patch),
  }));

  return PullRequestContextSchema.parse({
    repo: run.repo,
    prNumber,
    title: pr.title,
    body: pr.body ?? "",
    author: pr.user?.login ?? run.author ?? "unknown",
    url: pr.html_url,
    mergedAt: pr.merged_at,
    labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")).filter(Boolean),
    commits: commits.map((c) => c.commit.message.split("\n")[0]),
    filesChanged: changedFiles,
    diffSummary: buildDiffSummary(changedFiles),
  });
}

/** Build PR context from the bundled demo fixture (no network). */
function fetchDemo(run: RunRef): PullRequestContext {
  const fx = SAMPLE_MERGED_PR;
  const changedFiles: ChangedFile[] = fx._demoFiles.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patchExcerpt: f.patchExcerpt,
  }));

  return PullRequestContextSchema.parse({
    repo: run.repo,
    prNumber: run.prNumber,
    title: fx.pull_request.title,
    body: fx.pull_request.body,
    author: fx.pull_request.user.login,
    url: fx.pull_request.html_url,
    mergedAt: fx.pull_request.merged_at,
    labels: fx.pull_request.labels.map((l) => l.name),
    commits: [...fx._demoCommits],
    filesChanged: changedFiles,
    diffSummary: buildDiffSummary(changedFiles),
  });
}

/** True for the bundled demo repo, which isn't a real GitHub repository. */
function isDemoRepo(repo: string): boolean {
  return repo === SAMPLE_MERGED_PR.repository.full_name;
}

/**
 * Get PR context for a run. Uses the live GitHub API when possible and falls
 * back to the bundled demo fixture for the demo repo or when GitHub is unreachable.
 */
export async function getPRContext(run: RunRef): Promise<PullRequestContext> {
  if (isDemoRepo(run.repo)) return fetchDemo(run);
  try {
    return await fetchLive(run);
  } catch (err) {
    throw new Error(
      `Failed to fetch PR context for ${run.repo}#${run.prNumber}: ${(err as Error).message}`,
    );
  }
}
