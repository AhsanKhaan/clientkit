// Built-in checks a stage can name in pipeline/stages.json. Each gets (stage, ctx) and either returns (optionally
// with a line of evidence), or ends the run through fail() or blocked(). ctx: { abs, readText, fileHash, config,
// latest, stages, applies }.
import { existsSync, readFileSync } from 'node:fs';
import { budgetStatus, readUsage } from '../../packages/estimate/src/budget.mjs';
import { isAccepted } from '../../packages/estimate/src/quote.mjs';
import { validateProject } from './config.mjs';
import { blocked, fail } from './outcome.mjs';

const PLACEHOLDER = /\{\{[A-Z0-9_]+\}\}|\bTODO\b|\bTBD\b/;
const CLIENT_WORDS = 'intake/client-words.md';
const readJson = (ctx, rel) => JSON.parse(readFileSync(ctx.abs(rel), 'utf8'));

/** Shared with gate.mjs: every stage marked `budget` runs this first. */
export function budgetCheck(ctx) {
  if (!existsSync(ctx.abs('estimates/budget.json'))) blocked('no budget is set', 'Admin: write estimates/budget.json ({ "tokens": <number>, "setBy": "<name>", "setOn": "<date>" })');
  const usage = existsSync(ctx.abs('estimates/usage.jsonl')) ? readUsage(readFileSync(ctx.abs('estimates/usage.jsonl'), 'utf8')) : [];
  const s = budgetStatus(readJson(ctx, 'estimates/budget.json'), usage);
  if (s.state === 'unset') blocked('estimates/budget.json has no valid "tokens" and "setBy"', 'Admin: set the budget');
  const pct = `${Math.round(s.share * 100)}% of the budget used (${s.used.toLocaleString('en-US')} of ${s.tokens.toLocaleString('en-US')} tokens)`;
  if (s.state === 'stop') blocked(`budget reached: ${pct}`, 'Admin: raise "tokens" in estimates/budget.json, with setBy and setOn, or stop here');
  return s.state === 'warn' ? `WARNING ${pct}` : pct;
}

export const CHECKS = {
  'no-placeholders': (stage, ctx) => {
    for (const out of stage.outputs ?? []) {
      const hit = ctx.readText(out).split('\n').findIndex((l) => PLACEHOLDER.test(l));
      if (hit !== -1) fail(`${out}:${hit + 1} still has a placeholder`);
    }
  },

  /** Every approval stage before this one has a PASS whose hash still matches the file. */
  'approvals-current': (stage, ctx) => {
    for (const s of ctx.stages) {
      if (s.id === stage.id) break;
      if (!s.approves || !ctx.applies(s)) continue;
      const row = ctx.latest().get(s.id);
      const now = existsSync(ctx.abs(s.approves)) ? ctx.fileHash(s.approves) : '<hash>';
      if (!row || row.result !== 'PASS') blocked(`${s.approves} is not approved yet`, `owner: APPROVE ${now}`);
      if (!row.evidence.includes(now)) blocked(`${s.approves} changed after it was approved`, `owner: APPROVE ${now}`);
    }
  },

  /** The intake answers: purpose, languages, motion tier, the CMS answer, the quote. */
  'config-valid': (stage, ctx) => {
    const problems = validateProject(ctx.config());
    if (problems.length) fail(`kit.config.json: ${problems.join('; ')}`, 'orchestrator: ask the owner the missing intake questions');
    const c = ctx.config();
    return `purpose ${c.project.purpose}; motion ${c.motion.tier}; cms ${c.cms.enabled ? c.cms.mode : 'no'}`;
  },

  /** The client's words are on file. Their hash goes in the ledger, so a later edit is detected. */
  'client-words-pinned': (stage, ctx) => {
    if (!existsSync(ctx.abs(CLIENT_WORDS)) || !ctx.readText(CLIENT_WORDS).trim()) blocked(`${CLIENT_WORDS} is missing or empty`, 'orchestrator: save the client\'s answers exactly as given');
    return `client-words ${ctx.fileHash(CLIENT_WORDS)}`;
  },

  'client-words-unchanged': (stage, ctx) => {
    const row = ctx.latest().get('intake');
    if (!row || row.result !== 'PASS') blocked('the intake stage has not passed', 'run the intake gate first');
    if (!existsSync(ctx.abs(CLIENT_WORDS))) fail(`${CLIENT_WORDS} was removed after intake`);
    const now = ctx.fileHash(CLIENT_WORDS);
    if (!row.evidence.includes(`client-words ${now}`)) fail(`${CLIENT_WORDS} was changed after intake; the client's words must stay exactly as given`, 'restore the file, or run intake again if the client sent new answers');
  },

  /** Generation starts only on a quote the Admin approved and the client accepted. */
  'quote-accepted': (stage, ctx) => {
    const id = ctx.config().project?.quoteId;
    if (!id) blocked('kit.config.json has no project.quoteId', 'run the intake gate first');
    if (!/^[a-z0-9-]+$/.test(id)) fail('project.quoteId must be lowercase letters, digits and hyphens');
    const file = `quotes/${id}.json`;
    if (!existsSync(ctx.abs(file))) blocked(`${file} does not exist`, 'draft, approve and accept the quote first (scripts/quote.mjs)');
    if (!isAccepted(readJson(ctx, file))) blocked(`quote ${id} is not accepted (or was edited after approval)`, 'Admin approves by hash, then the client accepts');
    return `quote ${id} accepted`;
  },

  'estimate-present': (stage, ctx) => {
    const file = 'estimates/estimate.json';
    if (!existsSync(ctx.abs(file))) blocked(`${file} does not exist`, 'run: node scripts/estimate.mjs <options.json> <model>');
    const e = readJson(ctx, file);
    if (!Array.isArray(e.stages) || !e.total || !e.priceTableDate || !e.model) fail(`${file} is not a complete estimate`);
    return `estimate for ${e.model}, price table ${e.priceTableDate}`;
  },
};
