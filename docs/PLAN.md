# Phase 0 plan: clientkit

- **Written:** 2026-11-16. Vendor limits, terms and package versions were checked on 2026-11-15; each is re-checked when the phase that depends on it starts.
- **Status:** approved by the owner in chat on 2026-11-17. No code exists. The owner's answers are in section 10a; three answers are still open there. Phase 1 starts on the owner's go-ahead.
- **Name:** the kit is **AK Client Kit** (package name `akclientkit`). "clientkit" in this file means the same thing.
- **Number labels:** [M] measured (source given), [R] range, [P] estimate, [U] unverified.
- Findings and the aksitekit reuse table are in `docs/ANALYSIS.md`.

## 1. What is being built

Three products that share one set of schemas and gates:

| Part | What it is | Where it runs | Who uses it |
|---|---|---|---|
| **Kit** | Pipeline, gates, neutral agent files, section library, motion system, keyword tools, estimator logic | The owner's machine and CI | Owner, through any coding agent |
| **Site** | One static website per client, in its own repository | Static hosting (free plan) | The public |
| **Desk** | Estimator (path 1) and quote requests (path 2) | A small private web app | Admin, invited clients |
| **CMS** | Optional. Drafts, roles, review, publish by pull request. One instance, many sites | A separate private web app | Admin and the four other roles |

Out of scope: AdSense and any ad logic; a page builder that accepts raw HTML; hosting on paid plans.

## 2. Architecture

### 2.1 Flow
```text
client ──► Desk: estimator (indicative) ──► quote request ──► Admin approves by hash ──► client accepts
                                                                                              │
owner + coding agent ◄──────────────── business description becomes the brief input ◄─────────┘
   │  intake: purpose · brief · CMS yes/no
   │  stages write files ──► gates (plain scripts) pass or fail ──► ledger
   ▼
site repository (content JSON + design files + kit manifest) ──► CI gates ──► owner GO <sha> ──► static deploy
   ▲
   └── CMS (only if yes): draft ► gates + AI review ► human approval ► pull request with content JSON
```

### 2.2 Repository layout (this repository)
```text
agents/            neutral agent files (one source of truth)
skills/            neutral skills (start, gate, keyword-pipeline, deploy, search-loop)
adapters/          generators for Claude Code, Codex, Gemini CLI, Qwen
pipeline/          stages.json, gate runner
packages/schema/   content, design, manifest, config schemas (zod)
packages/gates/    every gate as a plain Node script
packages/sections/ section library and motion system
packages/research/ keyword ingest, KD, selection, clustering, search loop
packages/estimate/ estimator and quote logic (pure functions)
apps/desk/         estimator and quotes web app
apps/cms/          CMS web app
template/          what a new client site repository starts from
vendor/skills/     reviewed, hashed third-party skills
docs/  tests/  ledger/
```
One repository with npm workspaces. `.npmrc` keeps aksitekit's supply-chain rules.

### 2.3 How a client site uses the kit without forking it (B4)
A site repository holds only what is the client's: `content/`, `design/`, `assets/`, `kit.config.json`, `kit.manifest.json` and CI files. The section library, schemas and gates come from the kit as a pinned dependency at an exact version, with an integrity hash in the lockfile. A gate fails if kit code was edited inside a site repository. Per-client difference is data: the brief, the design files and the content. How the pinned package is delivered (GitHub release tarball, GitHub Packages, or public npm) depends on Q9 and is settled in Phase 1.

### 2.4 Site framework: Astro recommended (owner decides, Q8)
| | Astro | Next.js static export (as aksitekit) |
|---|---|---|
| JavaScript sent by default | None; only interactive islands ship code | The React runtime on every page |
| Fit with motion tiers | "none" and "subtle" can be CSS only; heavier tiers load as islands | Possible, tighter budgets |
| Reuse from aksitekit | Gates (they read the built `out/` folder); starter app is dropped either way (F1) | Gates plus the metadata and OG code |
| Installed size | 3.0 MB unpacked [M: npm, `astro` 7.4.12] | 192 MB unpacked [M: npm, `next` 16.4.6] |
| React-only libraries (for example a 3D React wrapper) | Used inside a React island | Native |

Recommendation: Astro, because the starter app is not carried over in either case and the performance budgets per motion tier are easier to hold when static sections ship no script. Its current features are confirmed from its docs in Phase 1 before any code depends on them [U]. If the owner prefers Next.js, the plan is unchanged apart from Phase 4's components.

### 2.5 Provider layer (B1)
- **One source:** `agents/*.md` and `skills/*.md` with neutral front matter: name, purpose, inputs, outputs, gate, and capabilities such as `web-search`, `browser`, `shell`, never a vendor's tool name.
- **Adapters are generated:** `npm run agents:sync` writes each vendor's files (instruction file, agent or command definitions, tool mapping). `npm run agents:check` fails if a generated file differs from its source.
- **Gates are plain scripts** (`node pipeline/gate.mjs <stage>`), identical under every agent.
- **Guards live below the agent:** a git pre-commit secret scan and a pre-push block on the production branch, plus the same checks in CI. Where a vendor has hooks or deny rules, the adapter adds them as an extra layer.
- **A capability a vendor lacks** (for example no sub-agents) is recorded in the adapter; the orchestrator then runs that stage in the main session.
- Each vendor's current file formats are read from its own documentation in Phase 1 [U until then].

### 2.6 Desk (estimator and quotes)
- `packages/estimate` holds the arithmetic as pure functions, so the command line, Desk and the CMS give the same numbers.
- **Path 1, estimator:** no approval, no commitment. It reads only the client-facing price table the Admin published (ranges with margin already applied). Raw token costs and the margin never reach the browser. Every result says "indicative estimate, not a quote" and shows the price table's date.
- **Path 2, quote request:** separate routes, separate code module. A request with missing answers is not drafted; the form lists what is missing. Draft, Admin edit, approval by hash, client accept or change request are states in the database, and every version is kept.
- Access: Cloudflare Access by invited email. No IP allowlist here, because clients must reach it.

### 2.7 CMS
- **Runtime:** one Cloudflare Worker (API plus a small single-page interface as static assets) and one D1 database. Proposed libraries: Hono, zod, jose (versions in section 9).
- **Identity:** Cloudflare Access in front. The Worker verifies the Access token on every request, then looks up the person's role for the site in D1. Deny by default. No passwords are stored or hashed in the app, which also keeps requests inside the 10 ms CPU limit.
- **Also in the app:** CSRF protection (origin check plus token on every write), schema validation on every input, rate limits, an append-only audit log.
- **IP allowlist:** stored in D1, readable and writable by Admin only. Enforced twice: at the edge (an Access policy or a WAF custom rule) and in the Worker against the connecting IP. Changing the edge rule is a write to the owner's Cloudflare account, so the Admin confirms it each time.
- **Changing IPs:** the Admin picks a mode per instance: "allowlist and identity" or "identity with a second factor" for people whose address rotates.
- **Lockout recovery:** a local break-glass command, run by someone who holds the Cloudflare account, resets the allowlist and writes an audit entry. Tested with a planted lockout.
- **Publish:** a GitHub App installed on the site's repository writes validated content JSON on a branch and opens a pull request. CI runs the gates. Who may merge is Q1.
- **Multi-site:** connecting a site reads `kit.manifest.json` from its repository (kit version, schema version, site ID) and refuses anything else.
- **AI review:** three modes, chosen in the AI setup screen (section 9.2). Keys are encrypted at rest and never shown again.

### 2.8 The ledger
Append-only JSON Lines, one entry per gate run, approval, estimate and quote version, each entry carrying the hash of the one before it. Kit and site ledgers are committed to their repositories (aksitekit's was git-ignored); Desk and CMS entries are rows in D1. No secrets or personal data in ledger files.

## 3. Data model

### 3.1 Files in a site repository
| File | Holds |
|---|---|
| `kit.manifest.json` | `kitVersion`, `schemaVersion`, `siteId` |
| `kit.config.json` | Purpose, domain, languages, motion tier, CMS yes or no, research thresholds, budgets |
| `intake/client-words.md` | The client's answers exactly as given |
| `docs/BRIEF.md` | The groomed brief, approved by hash |
| `docs/DESIGN.md` + `design/*.json` | Tokens, layout archetype, section plan, motion tokens; approved by one hash over all of them |
| `content/site.json`, `content/pages/*.json` | Site settings and pages as typed sections |
| `research/` | Keyword inputs and the keyword map with KD, source, date and label per row |
| `reports/estimate.md`, `ledger/*.jsonl` | Estimate with actual usage; the ledger |

**Typed sections.** A page is a list of sections. Each section is `{ type, variant, id, props }`, where `type` is one of hero, feature-grid, story, gallery, testimonials, pricing, team, faq, contact, rich-text, footer (the list grows), `variant` names a layout, and `props` is a strict object for that type. Text fields allow the same safe inline links as aksitekit and nothing else. Unknown keys are rejected. A testimonial must carry a source field naming who supplied it.

### 3.2 Database tables (D1)
| App | Tables |
|---|---|
| Desk | `price_tables`, `estimator_settings`, `estimates`, `quote_requests`, `quote_versions`, `quote_approvals`, `ledger` |
| CMS | `sites`, `users`, `memberships` (user, site, role), `allowlist`, `drafts`, `submissions`, `findings`, `fp_claims`, `approvals`, `publishes`, `ai_config`, `ai_usage`, `audit_log`, `learnings`, `learning_approvals`, `search_tasks` |

## 4. Design and motion

- **Three directions (C1):** each is a real rendered preview (a home page with at least three sections) built from the section library, differing in layout archetype, type pairing, colour, imagery style and motion character. A script checks that the three differ from each other before the client sees them.
- **Section library (C2):** every section type has at least three layout variants. Each variant has a schema, a test page and a reduced-motion version.
- **Motion tokens (C3):** durations, easings, stagger, scroll behaviour. If the DESIGN.md format's linter rejects extra keys, they live in `design/motion.json` and the approval hash covers both files [U: checked in Phase 4].
- **Native first:** CSS transitions and CSS scroll-driven animations (Baseline "Newly available" since October 2026 [M: MDN], so every use needs a fallback for older browsers). A library is added only where a tier needs it.

Proposed budgets per tier, all [P], for the owner to set:

| Tier | Motion script (compressed) | Lighthouse performance, mobile | CLS | Notes |
|---|---|---|---|---|
| none | 0 KB | ≥ 95 | ≤ 0.05 | |
| subtle | ≤ 10 KB | ≥ 95 | ≤ 0.05 | CSS first |
| rich | ≤ 60 KB | ≥ 90 | ≤ 0.1 | Loaded after first paint |
| immersive | ≤ 200 KB, lazy | ≥ 80 | ≤ 0.1 | Static poster image is the LCP element; 3D starts after it |

LCP ≤ 2.5 s and INP ≤ 200 ms apply to every tier. Accessibility, best practices and SEO stay at 100.

**Design gates (C4):**
| Gate | Decided by |
|---|---|
| Distinctness | A fingerprint (font families, palette compared by colour distance, layout archetype, section-variant order, motion character) compared with the kit defaults and with the owner's earlier sites. Similarity above the threshold fails. Starting threshold 0.6 [P] |
| Visual review | Screenshots at 320, 768 and 1280 px. A design-critic agent, never the agent that designed the page, scores a written rubric with evidence per line. The script checks the scores against the bar and that the screenshots belong to the current build. Median of three runs |
| Motion | With reduced motion on: no running animations and all content visible. Otherwise: CLS, interaction delay and dropped frames under CPU throttling, per tier |
| Existing | Contrast, accessibility, performance, SEO |

## 5. Keyword research and the search loop

- **KD sources, in order:** the owner's export (Semrush, Ahrefs, Moz CSV); a connected keyword tool if the owner allows it and its cost (Q3); the free SERP estimate.
- **SERP estimate:** runs for every candidate above the volume floor, in batches, with the agent's own search tool. No scraping of Google. The agent records what ranks; a script turns that record into a number with a fixed rubric, so the same record always gives the same KD.
- **Every row** carries KD, source, date and label ([M] from a tool, [P] from the estimate). A map with a missing or unlabelled KD fails. Reports and screens state that Keyword Planner has no difficulty metric and that "Competition" is advertiser bidding.
- **Scales differ between tools**, so the threshold is stored per source.

Proposed defaults for new, low-authority client sites, all [P], owner decides:

| Purpose | `minVolume` | `maxKd` | Reason |
|---|---|---|---|
| brand-first | none for brand, service and local terms | reported, not a filter | These pages exist because the business offers the service, not because of volume |
| search-first | 100 | 20 for the first six months, then reviewed against Search Console | aksitekit's 1,000 floor removes most local and service terms; a new domain rarely holds harder terms |
| both | 100 for content pages; none for service pages | 20 for content pages | Combines the two |

- **Monthly search loop (A5):** reads queries, pages, indexing and rising queries; writes an action list of pages losing impressions, queries with impressions and no clicks, and rising queries with no page. With a CMS, each becomes a draft task. Data comes from Google's Search Console API or CSV exports, not a metered connector.
- **First use:** the F4 diagnosis on an existing site, following the order in `ANALYSIS.md` §1.4.

## 6. Estimates and budgets (B3)

- `reports/estimate.md` lists each stage with input and output tokens as a range [R], the model, and cost from a dated price table the Admin can edit. Drivers: pages, sections per page, motion tier, CMS yes or no, languages.
- The first table is [P]. After each build, actual usage is written beside the estimate and the ranges are recalibrated.
- **Budget:** a gate runs between stages. At 80% it warns. At 100% it refuses the next stage until the Admin raises the budget, and records who did.
- **Limit of this design:** under a subscription, a coding agent cannot be stopped in the middle of a stage, and some agents report little usage data. Where usage is not reported the row is [U] and the Admin is told.

## 7. Phases and acceptance tests

Every phase also delivers: tests with one planted failing case per new gate, updated docs, a ledger entry, a passing `npm run verify`, and the owner's approval. One labelled sample site is kept as a fixture from Phase 4 on, so gates are tested on something real before Phase 10.

| Phase | Delivers | Accepted when |
|---|---|---|
| **1. Skeleton and provider layer** | Workspace, `.npmrc` rules, gate runner, committed ledger, hash approvals, git-hook guards, CI, neutral agent format, four adapters | A planted secret is blocked at commit. A push to the production branch is blocked. A wrong `APPROVE` hash is refused. Editing a generated adapter fails `agents:check`. The same gate gives the same result when started from two different agents. Breaking the ledger's hash chain fails verification |
| **2. Intake, purpose, estimate** | Purpose, brief and CMS questions; `BRIEF.md` approval; conditional stages; estimator; Desk with both paths | Each purpose answer yields its own stage list. The client's words are stored unchanged (hash matches). "No CMS" leaves no CMS file or config in the site. A quote request with missing answers is not drafted and lists them. The estimator's response contains no margin and no token cost. A client cannot see an unapproved quote. A scope change forces a new approval. Generation refuses to start without an accepted quote. Budget: warning at 80%, refusal at 100% |
| **3. Keyword difficulty and search loop** | KD parsers, batched SERP estimate, strict map gate, per-purpose thresholds, monthly loop, F4 diagnosis | A map with one missing or unlabelled KD fails. A fixture export from each supported tool parses. "Competition" is never read as KD. The same SERP record always gives the same KD. The loop, run on fixture data, produces the three lists. The F4 report for one real site is delivered |
| **4. Design system, sections, motion** | Typed section schema, section library with variants, design files with motion tokens, four tiers, three-direction previews | Every section type has at least three variants, each passing schema, accessibility and reduced-motion tests. Raw HTML in content is rejected. A testimonial without a source is rejected. Each tier's sample page meets its budget. Three previews render for a sample brief and differ from each other |
| **5. Design gates** | Distinctness, visual review, motion gates | A site built with kit defaults fails distinctness. A site planted to match an earlier one fails. A page with a planted layout shift fails. An animation that ignores reduced motion fails. A score below the bar blocks the stage. Screenshots from an older build are refused |
| **6. CMS core, access, roles** | Worker and D1, Access identity, allowlist, roles, content list, schema forms with prefill | Every row of the role table has a passing server test in both directions (allowed, forbidden). A request without a valid identity is refused. An address off the allowlist is refused at both layers. A non-Admin cannot read the allowlist. The break-glass command recovers a planted lockout. A cross-site write without a token is refused. Content outside the schema is rejected. A large planted page stays inside the CPU limit |
| **7. Review flow and AI setup** | Gates on submit, AI review, Advisory and Blocked findings, false-positive claims, approval, publish by pull request, AI setup screen | A Blocked finding cannot be passed without a claim that has a comment. Only an Admin accepts or rejects a claim. Nothing is published without a human approval from an allowed role. A stored key can never be read back. Spend stops at the monthly budget. The pull request carries only content JSON that passed validation |
| **8. Multi-site** | Site connection wizard, manifest check, per-site roles and settings | A repository without a valid manifest is refused. A user with a role on site A cannot read or write site B. One person holds different roles on two sites and each is enforced |
| **9. Learning loop** | Inputs collected, proposals as diffs with evidence and a test, hash approval, versions, rollback | A proposal that weakens a protected rule is refused by the script. The learner cannot approve its own proposal. Nothing changes before an Admin approval. A rollback restores the earlier version. A site-level learning does not reach another site until promoted |
| **10. Sample client site, end to end** | One invented, labelled sample client from quote to live site, with CMS | Every stage has a PASS in the ledger. The site is deployed on free plans after the owner's `GO <sha>`. One content change travels from draft through review and approval to live through the CMS. Estimate and actual usage are shown side by side |

## 8. Free-plan limits

Checked 2026-11-15 from each vendor's own pages. Re-check before the phase that relies on them.

| Service | Limit on the free plan | Source | Design consequence |
|---|---|---|---|
| Cloudflare Workers | 100,000 requests a day; 10 ms CPU per request; 128 MB memory; 50 subrequests per request; 100 Workers per account; 5 Cron Triggers per account; static assets 20,000 files, 25 MiB each [M] | developers.cloudflare.com/workers/platform/limits (page dated 2026-11-13) | No password hashing; light in-app checks; one Worker per app; at most a few scheduled jobs |
| Cloudflare D1 | 10 databases; 500 MB each; 5 GB total; 5 million rows read and 100,000 rows written a day, queries fail past that until 00:00 UTC; 50 queries per invocation; 7 days of Time Travel [M] | developers.cloudflare.com/d1/platform/limits and /pricing | Indexed reads; autosave kept in the browser and written at most every 30 seconds; audit rows kept small |
| Cloudflare KV | 100,000 reads and 1,000 writes a day; 1 GB [M] | developers.cloudflare.com/kv/platform/limits | Not used for sessions or rate limits |
| Cloudflare Pages | 500 builds a month; 1 build at a time; 100 projects; 100 custom domains per project; 20,000 files [M] | developers.cloudflare.com/pages/platform/limits | Sites are built in CI and uploaded, so Pages builds are not spent |
| Cloudflare Access | 500 applications, 50 identity providers, 50 service tokens [M: account limits page]. Free for up to 50 users [M: cloudflare.com Access page, via search]. Whether a payment method must be on file to enable it is [U] | developers.cloudflare.com/cloudflare-one/account-limits | One Access seat per CMS or Desk user; 50 in total across all sites on one account |
| Cloudflare WAF | 5 custom rules; 1 rate limiting rule (by IP, 10 s period, 10 s block) [M] | developers.cloudflare.com/waf/custom-rules and /rate-limiting-rules | Edge allowlist uses one rule; finer rate limits are done in the app |
| Workers AI | 10,000 Neurons a day; calls fail past that [M] | developers.cloudflare.com/workers-ai/platform/pricing | A no-key option for CMS reviews, small in volume |
| GitHub Actions | Public repositories: standard runners free. GitHub Free: $12 of compute a month for private repositories, about 2,000 Linux minutes at $0.006 a minute [M, minutes calculated]; runs are blocked past it without a payment method [M] | docs.github.com billing page for Actions | A light content-only workflow. At about 6 minutes a run [P], roughly 300 runs a month across all private repositories on the account [P] |
| GitHub branch protection | Protected branches, required reviewers and code owners in private repositories are listed under GitHub Pro and Team, not Free [M] | docs.github.com "GitHub's plans" | On private repositories the deploy workflow enforces the gates itself (risk R3) |
| Google Search Console API | Search Analytics 1,200 queries a minute per site; URL Inspection 2,000 a day and 600 a minute per site [M]. The page does not state a price [U] | developers.google.com/webmaster-tools/limits | Far above the monthly loop's needs |

Not yet checked, each before its phase: Worker request duration while waiting on an AI provider; whether static asset requests count toward the daily request limit; a rate-limiting binding on the free plan; GitHub App API rate limits.

## 9. Terms, licences and versions

### 9.1 May a consumer AI subscription be used from a server app? (B2)
Checked 2026-11-15.

| Provider | What its documentation says | Source | For the CMS |
|---|---|---|---|
| Anthropic | Subscription sign-in is for "ordinary use of Claude Code and other native Anthropic applications". Developers building products or services "should use API key authentication". Routing requests through Free, Pro, Max or Ultra credentials on behalf of users is not permitted | code.claude.com/docs/en/legal-and-compliance | No. API key |
| Google (Gemini CLI) | Accessing the services behind Gemini CLI with third-party software through its sign-in is "a violation of applicable terms and policies" | Gemini CLI repository, `docs/resources/tos-privacy.md` | No. API key |
| OpenAI (Codex) | Two sign-ins: ChatGPT for subscription access, API key for usage-based access. "API keys are still the recommended default for automation" | learn.chatgpt.com/docs/auth | API key. Whether its terms forbid subscription use from a server was not confirmed on this page [U] |
| Qwen Code | Its sign-in needs a Plus or Pro subscription; for headless or scripted use "use an API-key-based authentication method instead" | qwenlm.github.io/qwen-code-docs (page dated 2026-11-09) | API key |

### 9.2 CMS review modes that follow from this
1. **Admin's API key** for a chosen provider, with a monthly budget.
2. **Local review queue:** submissions wait; the Admin runs their own coding agent locally, under their own subscription, which pulls the queue and posts findings. Each Admin uses their own account; the kit never pools, stores or resells subscription access. Whether one person may process several clients' queues this way under a consumer plan is [U] and should be confirmed with the provider before it is offered.
3. **Workers AI free allowance:** no key, small daily volume, open models.

Build time is separate: sites are generated locally through whichever coding agent the owner or client already pays for.

### 9.3 Candidate libraries
Versions and licences from the npm registry on 2026-11-15 [M]. Nothing is installed yet. Each is re-checked, and must be at least 7 days old, when added.

| Package | Version | Licence | For |
|---|---|---|---|
| `astro` | 7.4.12 | MIT | Site framework (if Q8 is yes) |
| `next` | 16.4.6 | MIT | Site framework (alternative) |
| `zod` | 4.6.7 | MIT | Schemas |
| `hono` | 4.13.18 | MIT | CMS and Desk API |
| `jose` | 6.2.17 | MIT | Verifying Access tokens |
| `wrangler` | 4.162.0 | MIT or Apache-2.0 | Local development and deploy |
| `motion` | 14.14.0 | MIT | Rich tier, if CSS is not enough |
| `lenis` | 1.3.27 | MIT | Smooth scroll, rich tier, optional |
| `three` | 0.187.0 | MIT | Immersive tier |
| `ogl` | 1.0.11 | Unlicense | Lighter alternative for shader backgrounds |
| `gsap` | 3.15.1 | "Standard 'no charge' license" (not an open-source licence) | Only if its terms are read and fit client work; the terms page could not be opened on 2026-11-15 [U] |
| `vitest` | 5.1.0 | MIT | Tests |
| `@playwright/test` | 1.65.1 | Apache-2.0 | End-to-end tests, screenshots, motion gate |
| `@axe-core/playwright` | 4.14.0 | MPL-2.0 | Accessibility gate |
| `pixelmatch` | 8.0.0 | ISC | Screenshot comparison |

`https://motionsites.ai/` is used only as the owner's bar for finish. I opened its home page once: it sells website prompts and groups examples by category. I took no text, prompt or asset from it and none will be used.

## 10. Open questions for the owner

Phase 1 waits for these. My recommendation is given where I have one.

**From the brief (section 12):**
1. **May a Manager publish after approving, or does publishing need the Admin?** Recommended: a Manager may publish a pull request that changes only content files and passes every gate; anything touching code, design or settings needs the Admin's GO.
2. **Is an API key per client acceptable for CMS reviews?** Section 9.1 shows a subscription cannot be used from a server. Recommended: yes, with the local queue and Workers AI as the no-cost options.
3. **May a keyword tool you already have be used for KD, and is its cost acceptable?** A Semrush connector is present in this workspace. I have not called it, because its calls spend API units.
4. **Default margin, currency and quote validity period?**
5. **Default motion tier when the client has no preference?** Recommended: subtle.
6. **Who owns each client site's repository and hosting account?** This sets the free-plan picture: on one owner account, all private repositories share the Actions allowance, and all CMS and Desk users share 50 Access seats.

**Added by this analysis:**
7. **F4:** which sites showed "impressions, then zero", and how should I get their Search Console data: wait for the connector's monthly reset, CSV exports from you, or Google's API set up by you?
8. **Site framework:** Astro (recommended) or Next.js?
9. **Is the kit repository public or private, and under what licence?** Public gives free Actions minutes and branch protection on GitHub Free; private keeps the kit closed.
10. **The kit's name** in place of `clientkit`.
11. **Design scores:** may the owner override a failed visual review with a recorded reason, or is the bar absolute?
12. **Estimator access:** by invited email only, or an open link you can share?

## 10a. Owner decisions (2026-11-17)

| Q | Decision | Effect on the plan |
|---|---|---|
| 1 | A Manager may publish content-only changes that pass every gate; code, design and settings need the Admin's GO | A gate checks that a publish pull request touches only content files |
| 2 | The CMS offers all three review modes: API key per client, local review queue, Workers AI free allowance | The AI setup screen lets the Admin pick one per site |
| 3 | KD from the owner's CSV exports only; agents never call a connected keyword tool | No connected-tool adapter is built. The free SERP estimate covers keywords with no export row |
| 5 | Default motion tier: subtle | |
| 6 | The owner owns every client repository and hosting account | One account's limits apply to everything: the shared Actions allowance and 50 Access seats (section 8) |
| 8 | Astro | `next`-only files in aksitekit are dropped |
| 9 | Kit repository is private, all rights reserved | No protected branches and a shared Actions allowance on GitHub Free; the deploy workflow enforces the gates (risk R3). The kit reaches site repositories as a pinned private package |
| 10 | Name: AK Client Kit | |
| 11 | The owner may override a failed visual review with a reason recorded in the ledger | Accessibility, contrast, performance and security gates can never be overridden |
| 12 | Estimator access by invited email only | Each invited person uses one Access seat |
| 4 (part) | Default quote currency: USD, changeable per quote | |
| 7 (part) | F4 data comes from CSV exports the owner supplies | The Phase 3 diagnosis reads Performance and Pages exports |

**Still open:**
- Q4: default margin (percent) and quote validity period (days).
- Q7: which sites showed "impressions, then zero".

## 11. Not verified in Phase 0

- Search Console data for F4 (connector limit reached).
- Each coding agent's current configuration format (Phase 1).
- Astro 7's current features against its docs (Phase 1).
- GSAP's licence terms; the View Transition API's browser support (the page's support table did not load).
- Whether Cloudflare Access on the free plan needs a payment method on file.
- The token ranges for the estimate table: none exist yet; the first set will be [P].
