# Phase 0 analysis: aksitekit as the reference for clientkit

- **Written:** 2026-11-16. Research and vendor checks were done on 2026-11-15.
- **Reference read:** `github.com/AhsanKhaan/aksitekit` at commit `d8b29a5` (2026-11-10), which is still its `main` HEAD. Read-only from a temporary copy; nothing was changed there and nothing was copied into this repository.
- **Working name:** `clientkit` stands in for `<KIT_NAME>` until the owner picks a name.
- **Number labels:** [M] measured (source given), [R] range, [P] estimate, [U] unverified.

**How deep the read went.** I read in full: `AGENTS.md`, `CLAUDE.md`, `factory.config.json`, `lib/content/schema.ts`, `components/Blocks.tsx`, `docs/templates/DESIGN.md`, the designer agent, the `/start` and `/keyword-pipeline` skills, `docs/MCP.md`, `.npmrc`, `.claude/settings.json` and the selection logic in `scripts/research/lib/select.mjs`. For the other scripts I read the header comment and the description in `AGENTS.md`, not every line. The reuse table in section 3 says which decisions rest on a full read. Any file marked "adapt" is read line by line when its phase starts.

## 1. Findings F1 to F6

| # | Verdict | Short reason |
|---|---|---|
| F1 | Confirmed | One skeleton, tokens only, no distinctness check |
| F2 | Confirmed | The only motion code is the reduced-motion reset |
| F3 | Confirmed, with one correction | Missing KD does not look "easy": the keyword silently drops out of the map |
| F4 | Still open | Search Console data could not be read (see 1.4) |
| F5 | Confirmed | No CMS, roles or review queue anywhere |
| F6 | Confirmed | Intake never asks the site's purpose; the stage order is fixed |

### 1.1 F1: every site looks the same (confirmed)
- `components/` has 16 top-level components plus one tool (`tools/LengthChecker.tsx`) [M: file list].
- `app/globals.css:58` sets `.wrap { max-width: var(--measure) }` with `--measure: 70ch` (line 30). The font is a system stack (line 29) and the accent is `--primary: #1d4ed8` (line 13).
- The CSS header comment tells the designer's output to "replace them; keep the names". The coder agent applies the `frontend-design` skill "**within** DESIGN.md's tokens" (`coder.md:16`).
- `docs/templates/DESIGN.md` front matter carries `colors`, `typography`, `rounded`, `spacing` and `components` only. Its Layout section fixes "Single column… content width capped near 70 characters".
- `lib/content/schema.ts` allows five block types: `p`, `ul`, `ol`, `table`, `note`. Page `kind` is `home | category | tool | guide | hub | instance`, which is a tool-and-guide site vocabulary. A client site's pages (services, case studies, team) have no place in it.
- The design stage runs three checks: file structure, the DESIGN.md linter and token contrast. None of them renders a page, and none compares a site with the template or with an earlier site.

### 1.2 F2: no motion (confirmed)
- A search of `app/`, `components/`, `lib/` and `scripts/` for animation, keyframes, transition and motion libraries finds only `app/globals.css:440-446`, the `prefers-reduced-motion` reset [M: grep].
- genjutsu was excluded on 2026-10-25: licence unclear (NOASSERTION), no skill of that name exists in it, and it ships a second `ui-ux-pro-max` (`skills.lock.json:908-920`). Nothing replaced it.

### 1.3 F3: Keyword Planner gives no KD (confirmed, one correction)
Confirmed:
- "Competition" is stored as `competitionAds` and never used as difficulty (`AGENTS.md` §1, `scripts/research/lib/kp.mjs`).
- The KD step is headed "kd (free SERP check, optional but recommended)" and ends "Keep it small: the top candidates, not every keyword" (`keyword-pipeline/SKILL.md`).

Correction: aksitekit never treats a keyword without KD as easy. `select.mjs:83-87` puts it in `pending` and writes it to `kd-todo.csv`; it is not selected. The real fault is quieter:
- The `keywords` stage runs `research:select` **without** `--strict` (`stages.json`, `package.json`). So the gate passes while `kd-todo.csv` still has rows, with only a warning line.
- The result is a keyword map that looks finished but is missing every keyword nobody estimated. The owner sees "Competition: Low" in Keyword Planner, no KD for most keywords, and a short map with no clear statement of why.

For clientkit this means: strict by default, KD on every candidate above the volume floor, and the UI and reports say plainly that Keyword Planner has no difficulty metric.

### 1.4 F4: "impressions at first, then zero" (still open)
I could not check Search Console. The Search Console connector in this session refused the first call: "You have used this month's 30 tool calls on the Free plan" [M: connector error, 2026-11-15]. No property was read, so nothing here is a diagnosis.

What the code shows that bears on it:
- aksitekit has no post-launch search loop. Search Console steps are manual: `docs/MCP.md` records "no official Search Console MCP server" (2026-10-25).
- Content changes only by editing JSON in the repository (F5), so launched pages tend to stay as they were.

Candidates, to test in this order once data is available (cheapest first):
1. **Indexing:** are the affected URLs indexed now? (URL Inspection: verdict, coverage state, last crawl, Google's chosen canonical.)
2. **Sitemap and crawl:** was the sitemap read, with errors? Is the last crawl date recent?
3. **Shape of the drop:** impressions by date and by page. A short burst after launch followed by a fall is a common pattern for new pages on a new domain [U: not confirmed for these sites], and it looks different from a sudden site-wide drop on one date.
4. **Query positions:** were early impressions at positions 30 to 80 for queries the site could not hold?
5. **Duplicate or thin pages:** canonical chosen by Google differs from the page's own; near-duplicate instance pages.
6. **Links:** no external links, weak internal links.
7. **Freshness:** nothing updated since launch.

Ways to get the data (owner's choice, see `PLAN.md` open question Q7): wait for the connector's monthly reset, export the Performance and Pages reports as CSV, or set up Google's own Search Console API (its quotas are far above this need [M: developers.google.com/webmaster-tools/limits, 2026-11-15]). I also need the list of affected sites.

### 1.5 F5: no way to update content after launch (confirmed)
A search of the whole repository (outside `vendor/`) for CMS, roles and review queues finds nothing [M: grep]. Content is `content/pages/*.json`, edited by an agent or by hand, shipped through a pull request.

### 1.6 F6: intake never asks what the site is for (confirmed)
`/start` §1 asks for domain and name, competitors with DR, markets and language, technology, and the idea. There is no purpose question. `stages.json` has one fixed order with `keywords` before `strategy`, `architecture` and `design`, and no branch. `lib/registry.ts` builds the site's URLs from the keyword map, so the keyword stage decides which pages exist. A brand site whose pages come from the client's brief has no path through this.

## 2. Other things the read turned up

| # | Finding | Why it matters for clientkit |
|---|---|---|
| X1 | The ledger is git-ignored (`reports/` in `.gitignore`; `AGENTS.md` §5 says it "stays on the machine that ran the stages") | Quotes, approvals and estimates must survive a lost laptop. clientkit needs a durable ledger |
| X2 | aksitekit's `harness` agent writes tests. Section 10 of the brief uses "harness" for the learning loop | Two different jobs with one name. clientkit calls them `tester` and `learner` |
| X3 | Guards are Claude Code hooks (`.claude/settings.json`, `.claude/hooks/guard.mjs`) | They do nothing under Codex, Gemini CLI or Qwen. The neutral place for guards is git hooks plus CI |
| X4 | Agents name Claude-only tools (`Agent`, `Skill`, `mcp__playwright__…`, "Claude's WebSearch") in their front matter and text | Agent files need a neutral format with capabilities ("web search", "browser"), mapped per vendor |
| X5 | 62 vendored skill folders, 443 files, from 49 reviewed sources [M: `skills.lock.json`, `vendor/skills/`] | Most are SEO and marketing skills for content sites. clientkit needs a smaller set, each licence re-checked at the time of use |
| X6 | aksitekit has no `LICENSE` file | Same owner, so reuse is fine. clientkit should state its own licence or "all rights reserved" (Q9) |
| X7 | `docs/MCP.md` lists Semrush as paid and off. This session has a Semrush connector | Bears on open question 3 (may an owned keyword tool be used for KD) |
| X8 | Deploy safety relies on `preprod.yml` plus the owner's `GO <sha>` | CMS publishing as a pull request fits this model, but GitHub Free has no protected branches on private repositories (see `PLAN.md` §8), so the deploy workflow itself must refuse a commit whose gates did not pass |
| X9 | The Search Console connector here is a metered third-party service (30 calls a month free) | The monthly search loop (A5) must not depend on it. Use Google's own API or CSV exports |

## 3. aksitekit files: reuse, adapt or drop

"Reuse" means the same design and logic, rewritten into clientkit's layout in the phase that needs it, with the owner's approval. Nothing is copied wholesale. "Adapt" means the idea is kept and the content changes. Basis: **F** = read in full, **H** = header comment and `AGENTS.md` description only.

### 3.1 Rules, pipeline and gate runner
| File | Decision | Reason | Basis |
|---|---|---|---|
| `AGENTS.md` | Adapt | Keep the rules table, agent map, gate table and ledger format; remove AdSense; add purpose branches; becomes the neutral source every adapter reads | F |
| `CLAUDE.md` | Adapt | Becomes a thin generated adapter that points to `AGENTS.md` | F |
| `README.md` | Drop | Describes aksitekit; clientkit gets its own | H |
| `SECURITY.md` | Adapt | Same reporting policy, new scope (kit, sites, CMS) | H |
| `docs/CONTRACT.md` | Adapt | Keep the idea of frozen script names, file ownership and data formats; new contents | H |
| `docs/BLUEPRINT.md`, `docs/PROPOSAL-v2.md`, `docs/TODO-step-c.md`, `docs/HANDBOOK.md` | Drop | aksitekit's own plan and history; `PLAN.md` replaces them | H |
| `.claude/skills/gate/gate.mjs` | Reuse | Deterministic runner, hash-pinned approvals, redaction, exit codes, ledger rows | F (first 45 lines), H |
| `.claude/skills/gate/stages.json` | Adapt | Keep the format; add conditional stages per purpose and CMS answer; remove `adsense` | F |
| `.claude/skills/gate/SKILL.md`, `start/SKILL.md`, `deploy-production/SKILL.md` | Adapt | Rewritten in the neutral skill format; `/start` gains the purpose, brief and CMS questions | F (`start`), H |
| `.claude/skills/keyword-pipeline/SKILL.md` | Adapt | KD becomes required and batched (F3) | F |
| `.claude/skills/today/SKILL.md`, `scripts/growth/today.mjs`, `growth/.gitkeep`, `docs/templates/GROWTH-90.md` | Drop | The 90-day growth plan is for the owner's own content sites; the monthly search loop (A5) replaces it for clients | H |
| `factory.config.json` | Adapt | Becomes `kit.config.json`: add purpose, motion tier, CMS, languages, budget; remove `monetization` and `bots.adsense`; new research defaults | F |

### 3.2 Guards and supply chain
| File | Decision | Reason | Basis |
|---|---|---|---|
| `.npmrc` | Reuse | `ignore-scripts`, `save-exact`, `min-release-age=7`, `engine-strict` | F |
| `.claude/hooks/guard.mjs`, `secret-patterns.mjs`, `post-edit.mjs` | Adapt | Same checks, moved to git hooks and CI so they work under any agent; the Claude hook stays as one adapter (X3) | F (40 lines), H |
| `.claude/settings.json` | Adapt | Becomes the generated Claude adapter; deny list kept | F |
| `.gitleaks.toml`, `.gitattributes`, `.gitignore` | Reuse | Secret scanning config and line-ending rules; `.gitignore` changes so the ledger is kept (X1) | H |
| `skills.lock.json`, `scripts/check-skills.mjs`, `docs/SKILLS.md` | Adapt | Keep pinning, per-file sha256 and the 7-day rule; the skill list shrinks (3.7) | H |
| `.mcp.json`, `docs/MCP.md` | Adapt | Keep the "official, free, pinned, owner connects" rule; the list is re-checked; MCP config is per vendor adapter | F (`MCP.md`) |
| `audit-exceptions.json`, `scripts/audit.mjs` | Reuse | Vulnerability gate with dated, owner-approved exceptions | H |
| `scripts/check-repo.mjs` | Reuse | No secrets, no placeholders, supply-chain settings | H |

### 3.3 Gates on the built site
| File | Decision | Reason | Basis |
|---|---|---|---|
| `scripts/audits/seo-checks.mjs`, `seo-checks.json`, `docs/SEO-GATE.md` | Adapt | The on-page SEO gate stays; remove AdSense bot and disclosure checks; word floors and trust-page rules become per purpose (a brand home page is not a 300-word hub) | H |
| `scripts/check-out.mjs` | Adapt | Titles, H1, canonical, link graph, sitemap stay; the "no ad code" check goes | H |
| `scripts/audits/a11y.mjs`, `scripts/audits/perf.mjs`, `lighthouserc.json` | Adapt | axe and lab speed stay; budgets become per motion tier | H |
| `scripts/audits/unique-text.mjs` | Reuse | Duplicate-text check | H |
| `scripts/design/contrast.mjs` | Reuse | WCAG AA contrast from tokens | H |
| `scripts/check-security.mjs`, `scripts/check-live.mjs` | Reuse | Security table and live checks; extended later for the CMS app | H |
| `scripts/audits/ga-live.mjs`, `lib/consent.ts`, `lib/analytics.ts`, `components/Analytics.tsx`, `ConsentBanner.tsx`, `ConsentSettingsButton.tsx` | Adapt | Keep consent only as far as analytics needs it; remove anything written for ads | H |
| `scripts/production-gate.mjs`, `scripts/gen-public-files.mjs`, `scripts/lib/public-files.mjs`, `scripts/lib/site.mjs`, `scripts/serve-out.mjs` | Adapt | Production refusal rules, `robots.txt`, headers, CSP, static server; remove AdSense crawler lines; CSP per motion tier | H |
| `scripts/lib/content-rules.mjs` | Adapt | Keep the AI-writing scan; remove AdSense policy-risk terms; word floors per purpose | H |
| `scripts/framework.mjs` | Adapt | Depends on the framework decision (`PLAN.md` Q8) | H |
| `scripts/flatten-segments.mjs`, `next.config.ts`, `postcss.config.mjs` | Drop if Astro, reuse if Next.js | Next.js-only | H |
| `scripts/adsense-gate.mjs` | Drop | AdSense is out of scope | H |

### 3.4 Keyword research
| File | Decision | Reason | Basis |
|---|---|---|---|
| `scripts/research/kp-ingest.mjs`, `keyword-select.mjs`, `cluster.mjs`, `scripts/research/lib/{kp,common,inputs,pipeline,schemas,select,cluster}.mjs` | Adapt | Keep ingest, selection reasons and clustering; add KD parsers for Semrush, Ahrefs and Moz exports, per-row source, date and label, strict by default, and a light path for brand-first sites | F (`select`), H |
| `research/inputs/README.md`, `research/inputs/examples/*`, `research/inputs/kp/.gitkeep`, `content/examples/keyword-map.json` | Adapt | Input docs and labelled fake fixtures, extended with KD-export fixtures | H |

### 3.5 Starter app and content
| File | Decision | Reason | Basis |
|---|---|---|---|
| `lib/content/schema.ts` | Adapt | Keep strict zod objects and "no raw HTML"; replace blocks and kinds with typed sections | F |
| `components/Inline.tsx` | Reuse | The safe inline-link renderer is the reason content can hold no HTML | H |
| `components/Blocks.tsx` | Adapt | Becomes the "rich text" section among many | F |
| `components/JsonLd.tsx`, `lib/seo/{jsonld,metadata,og,icon}.ts(x)`, `app/og/[...slug]/route.tsx`, `app/favicon.ico/route.ts`, `app/apple-touch-icon.png/route.tsx`, `app/icon.svg` | Adapt | Metadata, JSON-LD and OG image logic stays; rewritten for the chosen framework | H |
| `components/{SiteHeader,SiteFooter,Breadcrumbs,Faq,PageList,ContentPage,TrustPage,Byline,Sources,ExampleNotice}.tsx` | Drop | The single skeleton (F1); the section library replaces it | H |
| `components/tools/*`, `lib/tools/length.ts`, `lib/registry.ts` | Drop | Tool pages and a keyword-map-driven registry belong to content sites | H |
| `app/**/page.tsx`, `app/layout.tsx`, `app/not-found.tsx`, `app/globals.css` | Drop | The fixed look and route shape | F (`globals.css`), H |
| `content/pages/*.json`, `content/site.json`, `lib/site.ts` | Drop | aksitekit's example pages; clientkit ships its own labelled sample | H |
| `docs/templates/DESIGN.md` | Adapt | Keep the token format and contrast pairing; add layout archetype, section plan and motion tokens; the "single column" rule goes | F |
| `docs/templates/{IDEA,PRD,ARCHITECTURE,SECURITY,CONTENT-STRATEGY}.md` | Adapt | `IDEA` becomes `BRIEF`; the others are trimmed for client sites | H |
| `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts` | Adapt | Same toolchain (Node 24, TypeScript, Vitest, Playwright, ESLint); new dependency list, each version checked when added | F (`package.json`) |

### 3.6 Agents, CI and tests
| File | Decision | Reason | Basis |
|---|---|---|---|
| Agents `orchestrator`, `architect`, `designer`, `coder`, `keyword-researcher`, `content-strategist`, `code-reviewer`, `reconciler`, `seo-auditor`, `ai-search-auditor`, `secops-reviewer`, `cloudflare-reviewer`, `responsive-checker`, `performance-auditor`, `devsecops-deployer`, `doc-generator` | Adapt | Same jobs, rewritten in the neutral format without Claude-only tool names (X4); `designer` and `coder` change most | F (`designer`), H |
| Agent `idea-groomer` | Adapt | Becomes `brief-groomer`: client's words kept exactly, groomed brief approved by hash | H |
| Agent `competitor-recon` | Adapt | Becomes reference-site review: structure and what the client likes or dislikes, never copied | H |
| Agent `harness` | Adapt | Renamed `tester` (X2) | F (12 lines) |
| Agent `growth-strategist` | Drop | Replaced by the monthly search loop | H |
| Agent `adsense-gatekeeper` | Drop | AdSense is out of scope | H |
| `.github/workflows/{ci,codeql,security,scorecard,lighthouse,preprod,live-check,deploy-pages,deploy-workers}.yml`, `.github/scripts/*.mjs`, `.github/zap/rules.tsv`, `.github/dependabot.yml`, `.github/CODEOWNERS`, `.github/CI-CD.md` | Adapt | Same jobs and pinned actions; add a light "content-only" workflow for CMS publishes and the design and motion gates; minutes budgeted (`PLAN.md` §8) | H |
| `tests/gates/adsense-gate.test.ts` | Drop | Its gate is dropped | H |
| `tests/starter/{length,registry}.test.ts`, `tests/framework/technology-choice.test.ts` | Drop | Their subjects are dropped | H |
| All other `tests/**` (24 files) | Adapt | Keep the pattern "one planted failing case per gate"; rewritten against clientkit's gates | H |

### 3.7 Vendored skills (62 folders)
Decided per folder in Phase 1, with each licence re-checked then. Proposed starting point:
- **Keep (re-vendor, re-hash):** `accessibility`, `core-web-vitals`, `web-perf`, `frontend-design`, `web-design-guidelines`, `web-interface-guidelines`, `ui-ux-pro-max`, `security-and-hardening`, `security-review`, `semgrep`, `supply-chain-risk-auditor`, `agentic-actions-auditor`, `github-actions-hardening`, `differential-review`, `workers-best-practices`, `wrangler`, `schema`, `seo-technical`, `seo-schema`, `seo-sitemap`, `site-architecture`, `copywriting`, `copy-editing`, `humanizer`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `requesting-code-review`.
- **Keep for search-first sites only:** `keyword-research`, `serp-analysis`, `seo-cluster`, `seo-content`, `seo-content-brief`, `seo-audit`, `seo-geo`, `ai-seo`, `content-strategy`.
- **Drop:** `free-tools`, `programmatic-seo`, `seo-programmatic`, `marketing-council`, `marketing-ideas`, `marketing-loops`, `cro`, `customer-research`, `competitors`, `analytics`, `command-palette`, `jobs-to-be-done`, the five `replica-*` skills, `reverse-engineer-anything`, `site-structure-optimizer`, `composition-patterns`, `react-best-practices`, `feature-dev`, `pr-review-toolkit`, `codebase-design`, `writing-plans`. Reasons: content-site growth work, cloning tools that sit badly with "never copy a third party's design", or Claude-plugin-specific material. `react-best-practices` and `composition-patterns` come back if the site framework is React (Q8).

## 4. Risks

| # | Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|---|
| R1 | **Scope.** Ten phases, three products (kit, estimator and quotes, CMS) | High | Long build, half-finished parts | Each phase ships something usable; the CMS (phases 6 to 8) starts only after a sample site has been built without it |
| R2 | **Workers Free allows 10 ms CPU per request** [M] | High | No password hashing in the CMS; a heavy gate run may be cut off | Identity comes from Cloudflare Access; in-app checks stay light; the full gates run in CI on the publish pull request; measured with a planted large page in Phase 6 |
| R3 | **GitHub Free: no protected branches on private repositories** [M] | High if client repositories are private | "Gates must pass before merge" cannot be enforced by GitHub | The deploy workflow re-checks the gate result for the exact commit; public repositories, or the owner's decision on plans (Q6) |
| R4 | **Actions budget.** GitHub Free includes $12 of compute a month across an account's private repositories [M] | Medium | Many CMS publishes exhaust it; runs are then blocked | A light content-only workflow; batching; estimate in `PLAN.md` §8 |
| R5 | **AI design scores are not deterministic** | High | A "script decides" gate that rests on an AI score can flip between runs | Deterministic checks decide wherever one exists; the critic's score needs written evidence per rubric line, the median of three runs, and a recorded owner override |
| R6 | **"Distinct" is hard to measure** | Medium | A gate that passes look-alikes or fails good designs | Fingerprint on fonts, palette, archetype and section order with planted pairs; thresholds are [P] until tuned on real sites |
| R7 | **Motion against performance** | Medium | Rich and immersive tiers miss LCP and INP budgets | Budgets per tier; CSS and native features first; heavy code loads after first paint; the reduced-motion path is tested |
| R8 | **Consumer AI subscriptions cannot power a server app** [M: Anthropic and Google; OpenAI and Qwen recommend keys for automation] | Certain | CMS reviews cost money, or wait for a local run | Three modes: Admin's API key, local review queue, Workers AI free allowance (`PLAN.md` §9) |
| R9 | **Token estimates start as guesses** | Certain | First quotes are off | Ranges labelled [P]; actual usage recorded per stage; the table is recalibrated after each build |
| R10 | **Usage is reported differently by each coding agent** | High | "Stop at 100% of budget" cannot be a hard stop mid-stage under a subscription | Checked between stages by a gate; where an agent reports nothing the row is [U] and the Admin is told |
| R11 | **Adapter drift across four agent tools** | Medium | A rule that binds Claude Code is missing under Codex | Adapters are generated from one source and a gate fails if they differ from it; formats verified from each vendor's docs in Phase 1 |
| R12 | **IP allowlist lockout** | Medium | Admin cannot reach the CMS | Identity layer as companion; a local break-glass command; tested with a planted lockout |
| R13 | **Secrets in the CMS** (provider keys, GitHub App key) | Medium | Leak gives repository write or spend | Encrypted at rest, write-only in the UI, narrow scopes, audit log, key rotation documented |
| R14 | **Free-plan terms change** | Medium | A limit drops under the design | Limits recorded with dates (`PLAN.md` §8); re-checked at the start of each phase that depends on them |
| R15 | **F4 stays undiagnosed** | Medium | New sites repeat the pattern | Phase 3 starts with the diagnosis on a real site before the loop is built |
| R16 | **Licences.** GSAP's licence is "Standard 'no charge' license" [M: npm registry], not an open-source licence; I could not open its terms page | Medium | A term may not fit client work | MIT options first (Motion, Lenis, three.js); GSAP only after its terms are read in Phase 4 |
| R17 | **Learning loop weakens a rule by small steps** | Low | Safety erodes | Protected paths; thresholds in them may only get stricter; the learner cannot approve its own proposals |
