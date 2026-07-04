/**
 * Path gating for runs: only PRs that touch configured paths are worth planning
 * against. Keeps the agent from proposing (or even running) on merges that can't
 * affect any documentation — e.g. CI config, lockfiles, unrelated services.
 *
 * Patterns are a small glob subset: `*` (anything but `/`), `**` (anything,
 * across `/`), and literals. Empty allowlist = allow everything (the default,
 * so gating is opt-in and adds no behavior until configured).
 */

/** Parse a comma/newline-separated allowlist into trimmed patterns. */
export function parseTriggerPaths(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Convert a simple glob to an anchored RegExp. */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*"; // ** — cross path separators
        i++;
        if (glob[i + 1] === "/") i++; // swallow the slash in `a/**/b` and `a/**`
      } else {
        re += "[^/]*"; // * — within a path segment
      }
    } else if ("\\^$.|?+()[]{}".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

/** True if any changed file matches any pattern. Empty patterns → allow all. */
export function matchesAnyPath(filenames: string[], patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  const regexes = patterns.map(globToRegExp);
  return filenames.some((f) => regexes.some((r) => r.test(f)));
}
