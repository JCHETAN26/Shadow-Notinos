import { heading, paragraph, bullet, code, callout } from "../../integrations/notion.js";

export interface SampleService {
  name: string;
  repo: string;
  criticality: "Low" | "Medium" | "High";
}

export interface SampleDoc {
  title: string;
  serviceName: string;
  docStatus: "Fresh" | "Needs Review" | "Outdated" | "Unknown";
  sourceRepo: string;
  agentNotes: string;
  blocks: Array<Record<string, unknown>>;
}

export const SAMPLE_SERVICES: SampleService[] = [
  { name: "Search Service", repo: "https://github.com/acme/search-service", criticality: "High" },
  { name: "Auth Service", repo: "https://github.com/acme/auth-service", criticality: "High" },
  { name: "Ranking Service", repo: "https://github.com/acme/ranking-service", criticality: "Medium" },
];

export const SAMPLE_DOCS: SampleDoc[] = [
  {
    title: "Search Service API Reference",
    serviceName: "Search Service",
    docStatus: "Fresh",
    sourceRepo: "https://github.com/acme/search-service",
    agentNotes: "",
    blocks: [
      heading(1, "Search Service API Reference"),
      paragraph(
        "The Search Service exposes the public search API and the internal reindex endpoint. It is the primary entry point for query traffic.",
      ),
      heading(2, "Endpoints"),
      paragraph("GET /search — run a query and return ranked results."),
      code(
        "http",
        "GET /search?q=laptops&limit=20\n\n200 OK\n{\n  \"results\": [ ... ],\n  \"total\": 128\n}",
      ),
      paragraph("POST /search/reindex — rebuild the search index. Internal only."),
      code("http", "POST /search/reindex\n\n202 Accepted\n{ \"job_id\": \"reindex_8f21\" }"),
      heading(2, "Configuration"),
      bullet("SEARCH_INDEX_NAME — active index alias."),
      bullet("SEARCH_PAGE_SIZE — default result page size (20)."),
      heading(2, "Failure Modes"),
      paragraph(
        "If the primary search provider is slow or unavailable, requests currently fail with a 503. Callers are expected to retry.",
      ),
    ],
  },
  {
    title: "Auth Service Architecture",
    serviceName: "Auth Service",
    docStatus: "Fresh",
    sourceRepo: "https://github.com/acme/auth-service",
    agentNotes: "",
    blocks: [
      heading(1, "Auth Service Architecture"),
      paragraph(
        "The Auth Service issues and verifies session tokens and brokers OAuth logins. It sits in front of every authenticated request.",
      ),
      heading(2, "Components"),
      bullet("Token issuer — signs short-lived JWT access tokens."),
      bullet("Session store — Redis-backed refresh token registry."),
      bullet("OAuth broker — exchanges provider codes for identities."),
      heading(2, "Token Lifecycle"),
      paragraph("Access tokens live for 15 minutes; refresh tokens for 30 days."),
      callout(
        "Rotating the signing key requires a coordinated deploy across the Auth and Search services.",
        "🔑",
      ),
    ],
  },
  {
    title: "Ranking Pipeline Overview",
    serviceName: "Ranking Service",
    docStatus: "Needs Review",
    sourceRepo: "https://github.com/acme/ranking-service",
    agentNotes: "",
    blocks: [
      heading(1, "Ranking Pipeline Overview"),
      paragraph(
        "The Ranking Pipeline re-orders candidate search results using a learned model and a set of business rules.",
      ),
      heading(2, "Stages"),
      bullet("Candidate retrieval — pull top-N from the search index."),
      bullet("Feature hydration — attach popularity and freshness signals."),
      bullet("Model scoring — apply the ranking model."),
      heading(2, "Signals"),
      paragraph("The model consumes click-through rate, recency, and inventory availability."),
    ],
  },
];
