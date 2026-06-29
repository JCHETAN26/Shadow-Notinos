import { Octokit } from "@octokit/rest";
import { env } from "../../env.js";

let octokit: Octokit | null = null;

/** Lazily construct an Octokit client. Works unauthenticated for public repos, but a token raises rate limits. */
export function github(): Octokit {
  if (!octokit) {
    octokit = new Octokit(env.githubToken ? { auth: env.githubToken } : {});
  }
  return octokit;
}
