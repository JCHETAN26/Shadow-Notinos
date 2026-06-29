/**
 * A replayable "pull_request closed + merged" webhook payload for the demo.
 * Mirrors PR #184 from docs/BUILD_PLAN.md §3. Lets the whole pipeline run locally
 * without a real GitHub delivery. Phase 4's PR fetcher falls back to the embedded
 * `_demoFiles`/`_demoCommits` when the repo isn't reachable on GitHub.
 */
export const SAMPLE_MERGED_PR = {
  action: "closed",
  pull_request: {
    number: 184,
    title: "Add ranking fallback for slow search provider",
    body:
      "When the primary search provider is slow, fall back to a cached ranking " +
      "so requests don't 503.\n\n- New `fallback_strategy` query parameter\n" +
      "- Timeout fallback path guarded by `SEARCH_FALLBACK_TIMEOUT_MS`\n" +
      "- New response field `ranking_source` (`primary` | `fallback`)",
    html_url: "https://github.com/acme/search-service/pull/184",
    merged: true,
    merged_at: "2026-06-20T17:42:00Z",
    user: { login: "priya-dev" },
    labels: [{ name: "api" }, { name: "reliability" }],
  },
  repository: {
    full_name: "acme/search-service",
    html_url: "https://github.com/acme/search-service",
  },

  // --- Demo-only context (not part of the real GitHub schema) ---
  _demoCommits: [
    "Add fallback_strategy param to GET /search",
    "Guard timeout fallback with SEARCH_FALLBACK_TIMEOUT_MS",
    "Return ranking_source in search response",
  ],
  _demoFiles: [
    {
      filename: "src/search/handler.ts",
      status: "modified",
      additions: 48,
      deletions: 6,
      changes: 54,
      patchExcerpt:
        "+ const strategy = req.query.fallback_strategy ?? 'cached';\n" +
        "+ if (elapsed > SEARCH_FALLBACK_TIMEOUT_MS) {\n" +
        "+   return cachedRanking(query, { ranking_source: 'fallback' });\n" +
        "+ }",
    },
    {
      filename: "src/config.ts",
      status: "modified",
      additions: 3,
      deletions: 0,
      changes: 3,
      patchExcerpt: "+ export const SEARCH_FALLBACK_TIMEOUT_MS = Number(process.env.SEARCH_FALLBACK_TIMEOUT_MS ?? 800);",
    },
    {
      filename: "src/search/types.ts",
      status: "modified",
      additions: 2,
      deletions: 0,
      changes: 2,
      patchExcerpt: "+ ranking_source: 'primary' | 'fallback';",
    },
  ],
} as const;
