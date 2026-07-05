import { Octokit } from "@octokit/rest";
import { env } from "../../env.js";

// One client per token (multi-tenant BYOK). Empty string = unauthenticated.
const clients = new Map<string, Octokit>();

/** Construct/reuse an Octokit client for a token (falls back to the env token).
 *  Works unauthenticated for public repos, but a token raises rate limits and
 *  is required for private repos. */
export function github(token?: string): Octokit {
  const key = token || env.githubToken || "";
  let client = clients.get(key);
  if (!client) {
    client = new Octokit(key ? { auth: key } : {});
    clients.set(key, client);
  }
  return client;
}
