---
name: start
description: Start or resume a client site project - the intake questions, the quote, the estimate and the brief, each with its gate. Use for "start a site", "new client", "resume the project", "what's next".
---

Run this in the main session; you ask the owner every question yourself. Follow `agents/orchestrator.md`.

## 0. Before anything
`node pipeline/gate.mjs verify-ledger`, then `node pipeline/gate.mjs status`. If stages already passed, resume at the
one it names and re-run that gate first.

## 1. Intake: ask these every time, in this order
1. **Purpose.** "Is this site for a client's brand, or is its main job to rank on Google?" Options: brand-first,
   search-first, both. Never choose for the owner. The answer sets the stages
   (`node pipeline/gate.mjs plan` shows them):
   - brand-first: the brief and client requirements lead; keyword work is light (brand, service and local terms);
   - search-first: the full keyword pipeline, then design;
   - both: the full keyword pipeline and the full design pipeline.
2. **Client requirements.** Brand assets (logo, colours, fonts), tone, reference sites the client likes and dislikes,
   pages and sections wanted, features (forms, booking, gallery, multilingual), languages, and the motion level:
   none, subtle, rich or immersive. If the client has no preference, use subtle and say so.
   When the project came from an accepted quote, start from the business description in `quotes/<id>.json` and ask
   only what it doesn't answer.
3. **CMS.** "Do you want a CMS for this website?" If no, write `"cms": { "enabled": false }` and nothing else about a
   CMS anywhere. If yes, ask: connect to an existing CMS instance, or create a new one (`"mode"`).
4. **Domain and name.**

Write what was said, and nothing that wasn't:
- `intake/client-words.md`: the client's answers exactly as given. Don't tidy, shorten or extend them. The intake gate
  records this file's hash; later stages fail if it changes.
- `kit.config.json`: `project.name`, `project.domain`, `project.purpose`, `project.languages`, `project.quoteId`,
  `motion.tier`, `cms`.

Gate: `node pipeline/gate.mjs intake`.

## 2. Quote
Generation starts only on a quote the Admin approved and the client accepted (`scripts/quote.mjs`; steps in its
header). A request with missing answers is not drafted: show the owner the list it prints. Only the Admin's own
`APPROVE <hash>` typed in chat counts.

Gate: `node pipeline/gate.mjs quote`.

## 3. Estimate and budget
1. Write the choices to a JSON file: `purpose`, `pages`, `sectionsPerPage`, `languages`, `features`, `motionTier`,
   `cms`.
2. `node scripts/estimate.mjs <options.json> [model]` writes `estimates/estimate.json` and `reports/estimate.md`.
3. Show the owner the total and ask for the token budget. Write their number to `estimates/budget.json`:
   `{ "tokens": <number>, "setBy": "<name>", "setOn": "<date>" }`. Never set or raise it yourself.

Gate: `node pipeline/gate.mjs estimate`.

After each stage, record what it used if your tool reports it:
`node pipeline/gate.mjs usage <stage> <input-tokens> <output-tokens>`. If it reports nothing, say so to the owner: that
row stays [U]. At 80% of the budget the gates print a warning; at 100% they refuse the next stage until the Admin
raises the budget.

## 4. Brief
Groom the client's words into `docs/BRIEF.md` (what the business does, customers, goals, pages and sections, features,
tone, references liked and disliked, motion tier, CMS answer, open questions). Add nothing the client didn't say; put
gaps under open questions and ask.

Gate: `node pipeline/gate.mjs brief`, then the owner's `APPROVE <hash>` (see `skills/gate.md`).

## 5. Report (every time you stop)
A table of stage, result and evidence from the ledger; "owner to do" and "done" as separate short lists; the one next
action.
