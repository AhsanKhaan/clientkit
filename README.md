# AK Client Kit

Takes a client's requirements and produces a custom, well-designed, animated website, with an optional private CMS
for updating it afterwards. Private repository, all rights reserved.

- **Plan:** `docs/PLAN.md`. **Why:** `docs/ANALYSIS.md`.
- **Rules for every coding agent:** `AGENTS.md`.

## Status
Phase 1 of 10 (skeleton and provider layer) is built. Nothing here generates a site yet; that starts in Phase 2.

## Setup (once per clone)
Needs Node 24.22 or newer and git. There are no dependencies to install yet.

```bash
npm run hooks:install
```

```bash
npm run verify
```

## What is here
| Path | What it is |
|---|---|
| `AGENTS.md`, `agents/`, `skills/` | The rules, agents and skills, written once in a vendor-neutral format |
| `adapters/sync.mjs` | Generates the files for Claude Code, Codex, Gemini CLI and Qwen Code from that source |
| `CLAUDE.md`, `QWEN.md`, `.claude/`, `.codex/`, `.gemini/`, `.qwen/` | Generated. Never edit them |
| `pipeline/` | The gate runner and the stage list |
| `ledger/` | Append-only, hash-chained record of gate runs and approvals. Committed |
| `guards/`, `.githooks/` | Git hooks that block secrets, commits and pushes to `main`, and forced pushes |
| `scripts/check-repo.mjs` | Secret scan and supply-chain settings check |
| `tests/` | One planted failing case per gate |

## Commands
| Command | Does |
|---|---|
| `npm run verify` | Everything below, in order |
| `npm run agents:sync` / `agents:check` | Regenerate the per-tool files / fail if they differ from the source |
| `npm run check:repo` | No secrets, `.npmrc` rules present, exact versions |
| `npm run ledger:verify` | No ledger entry was changed or removed |
| `npm test` | The tests |
| `node pipeline/gate.mjs status` | Each stage's latest result and the next stage |

## Choices made in Phase 1
- **No dependencies yet.** Tests use Node's built-in test runner, so nothing is installed. Vitest and TypeScript come
  in when a phase needs them, each with a licence and version check.
- **Guards are git hooks plus CI,** because only Claude Code would run Claude Code hooks. A hook can be skipped with
  `--no-verify`; `AGENTS.md` forbids that, and CI repeats the secret check.
- **The first `main`.** The push guard allows creating `main` on a remote that doesn't have it, so a new repository
  can be set up. After that, `main` changes only by pull request.
- **Not yet verified in a live tool:** the generated Codex, Gemini CLI and Qwen Code files follow each vendor's
  documentation as read on 2026-11-17, but have not been loaded in those tools.
