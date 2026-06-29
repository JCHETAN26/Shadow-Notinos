/**
 * Notion workspace template — database property definitions and sample content.
 * Mirrors docs/BUILD_PLAN.md section 8.
 *
 * Relations are circular (Engineering Docs <-> Services <-> PR Updates, etc.),
 * so the seeder creates every database with its base properties first, then
 * patches in `relation` properties once all database IDs are known.
 */

export type DbKey =
  | "engineeringDocs"
  | "services"
  | "prUpdates"
  | "agentRuns"
  | "reviewTasks";

export const DB_TITLES: Record<DbKey, string> = {
  engineeringDocs: "Engineering Docs",
  services: "Services",
  prUpdates: "PR Updates",
  agentRuns: "Agent Runs",
  reviewTasks: "Doc Review Tasks",
};

/** Maps each database to the .env variable that stores its id. */
export const DB_ENV_VARS: Record<DbKey, string> = {
  engineeringDocs: "NOTION_ENGINEERING_DOCS_DATABASE_ID",
  services: "NOTION_SERVICES_DATABASE_ID",
  prUpdates: "NOTION_PR_UPDATES_DATABASE_ID",
  agentRuns: "NOTION_AGENT_RUNS_DATABASE_ID",
  reviewTasks: "NOTION_REVIEW_TASKS_DATABASE_ID",
};

type PropMap = Record<string, Record<string, unknown>>;

const sel = (...names: string[]) => ({
  select: { options: names.map((name) => ({ name })) },
});
const msel = (...names: string[]) => ({
  multi_select: { options: names.map((name) => ({ name })) },
});

/** Base (non-relation) properties for each database. */
export const BASE_PROPS: Record<DbKey, PropMap> = {
  engineeringDocs: {
    Name: { title: {} },
    Owner: { people: {} },
    "Doc Status": sel("Fresh", "Needs Review", "Outdated", "Unknown"),
    "Last Verified": { date: {} },
    "Source Repo": { url: {} },
    "Agent Notes": { rich_text: {} },
  },
  services: {
    Name: { title: {} },
    Repo: { url: {} },
    Owner: { people: {} },
    Criticality: sel("Low", "Medium", "High"),
  },
  prUpdates: {
    Name: { title: {} },
    Repo: { rich_text: {} },
    "PR Number": { number: {} },
    "PR URL": { url: {} },
    Author: { rich_text: {} },
    "Merged At": { date: {} },
    "Impact Type": msel("API", "Config", "Data Model", "Dependency", "UI", "Infra"),
  },
  agentRuns: {
    Name: { title: {} },
    Status: sel("Queued", "Analyzing", "Waiting Approval", "Applied", "Failed"),
    "Actions Proposed": { number: {} },
    "Actions Applied": { number: {} },
    "Run URL": { url: {} },
  },
  reviewTasks: {
    Name: { title: {} },
    Status: sel("Todo", "In Review", "Done"),
    Priority: sel("Low", "Medium", "High"),
    Owner: { people: {} },
    Reason: { rich_text: {} },
    "Due Date": { date: {} },
  },
};

const relation = (databaseId: string) => ({
  relation: { database_id: databaseId, single_property: {} },
});

/** Relation properties to add in pass 2, keyed by database. */
export function relationProps(ids: Record<DbKey, string>): Record<DbKey, PropMap> {
  return {
    engineeringDocs: {
      Service: relation(ids.services),
      "Related PRs": relation(ids.prUpdates),
    },
    services: {
      Docs: relation(ids.engineeringDocs),
    },
    prUpdates: {
      "Related Service": relation(ids.services),
    },
    agentRuns: {
      PR: relation(ids.prUpdates),
      "Target Docs": relation(ids.engineeringDocs),
    },
    reviewTasks: {
      "Related Doc": relation(ids.engineeringDocs),
      "Related PR": relation(ids.prUpdates),
    },
  };
}

/** Order matters only for readability; creation is order-independent in pass 1. */
export const DB_ORDER: DbKey[] = [
  "services",
  "engineeringDocs",
  "prUpdates",
  "agentRuns",
  "reviewTasks",
];
