# Shadow Notino — SaaS / Publishable-Connector Plan

> Turning the single-tenant, self-hosted tool into a **multi-tenant OAuth SaaS**
> that could be published as a Notion connector. This is a company-grade build,
> not a bug-fix pass. Each phase lists **what the code does** and **what needs
> you** (things I cannot do: register OAuth apps under your accounts, choose a
> host, submit to Notion's review).
>
> Status: PLANNING. Phase 0 (real-GitHub hardening) is in progress.

---

## Reality check: what "a Notion connector" requires

The connectors in Notion's gallery are **multi-tenant OAuth apps** Notion reviews
and lists. Today Shadow Notino is single-tenant: one Notion workspace, one set of
repos, credentials in `.env`. To publish, it needs OAuth on both sides, per-tenant
isolation, encrypted token storage, always-on hosting, and Notion's approval.

The current design's non-goals (`PRODUCTION_READINESS.md` §Non-goals) — multi-tenant
isolation and token encryption — are exactly the work below.

---

## Phase 0 — Bulletproof the single-tenant core (IN PROGRESS)

Harden what exists against real GitHub before multi-tenanting it.

- [x] Real demo repo (`JCHETAN26/shadow-notino-demo`) + real merged PR
- [x] Signed webhook → live Octokit diff fetch → multi-page plan (verified: caught a removed endpoint, raised a review task)
- [ ] Full scenario matrix: PR→`dev` (pending toggle), empty PR, binary-only PR, injection PR, path-filter miss, multi-file, permission-revoke (403), rate-limit burst
- [ ] Genuine end-to-end delivery: cloudflared tunnel + a repo webhook (needs **you** to add the webhook in repo settings, since your token can't create one)
- [ ] Fix every bug found

**Needs you:** add one webhook in the demo repo's Settings → Webhooks once I have a tunnel URL (30 sec).

## Phase 1 — Multi-tenant data model

- New tables: `Tenant`, `User`, `Installation` (a GitHub App install ↔ tenant), `NotionConnection` (a Notion workspace ↔ tenant), `RepoDocMap`.
- Add `tenantId` to every domain row (`AgentRun`, `PatchPlan`, `NotionDoc`, `NotionBlock`, …) and to every query.
- Migrations + backfill for existing single-tenant data (assign to a default tenant).

**Needs you:** nothing — pure code.

## Phase 2 — GitHub OAuth (public GitHub App)

- Replace the static `GITHUB_TOKEN` with a **GitHub App**: per-installation tokens minted on demand, one webhook delivered per install, `X-Hub-Signature-256` verified with the App's secret.
- Installation callback stores `Installation → tenant`.

**Needs you:** register the GitHub App (name, callback URL, webhook URL, permissions: PRs read, contents read), and give me the App ID + private key + client id/secret.

## Phase 3 — Notion OAuth (public integration)

- Replace the static `NOTION_API_KEY` with Notion's **public OAuth** flow: users authorize, we store a per-workspace bot token.
- Workspace-scoped page/database selection during onboarding.

**Needs you:** create a **public** Notion integration (OAuth), set redirect URI, give me client id/secret.

## Phase 4 — Encrypted token storage at rest

- Encrypt all GitHub/Notion tokens with **AES-256-GCM**; key from a secrets manager / KMS (not in code).
- Envelope encryption; per-record IV; auth tag stored alongside.

**Needs you:** decide the key source (env-injected master key for MVP, or a cloud KMS).

## Phase 5 — Auth, sessions, tenant isolation enforcement

- User auth (sign in with GitHub), session cookies, CSRF.
- A hard isolation layer: every request resolves a `tenantId`, and every query is filtered by it (defense-in-depth: repository helpers that refuse an unscoped query).
- The multi-tenant isolation test from the readiness audit becomes real and gets an automated test.

**Needs you:** nothing — pure code.

## Phase 6 — Hosting / deployment

- Public HTTPS endpoint for webhooks + the web app, a persistent worker, managed Postgres (pgvector) + Redis.
- Config/secrets management, health checks, logging, backups.

**Needs you:** pick a host (Fly.io / Render / Railway / a cloud VM) and provision it; provide deploy credentials or run the deploy steps.

## Phase 7 — Notion listing / review

- Meet Notion's public-integration requirements (branding, privacy policy, security review), submit for the gallery.

**Needs you:** business/legal bits (privacy policy, support contact) and the submission itself.

---

## Sequencing & risk

Order: 0 → 1 → (2, 3 in parallel) → 4 → 5 → 6 → 7. Phases 1, 4, 5 are pure code
I can drive fully. Phases 2, 3, 6, 7 are gated on your account/registration/hosting
actions. Biggest risks: OAuth callback correctness, tenant-isolation leaks (Phase 5
is where a bug = a data breach, so it gets the automated isolation test), and
Notion's review timeline (external, unpredictable).

**Honest recommendation:** finish Phase 0 (cheap, high-value, de-risks everything),
then decide Phase 1+ deliberately — it's a real product commitment, and worth
a gut-check that shipping a SaaS (vs. a bulletproof portfolio piece) is the goal.
