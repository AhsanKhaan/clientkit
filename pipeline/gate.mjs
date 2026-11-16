#!/usr/bin/env node
// The gate runner. Agents propose, this script decides. It is plain Node with no dependencies, so it gives the same
// result under any coding agent.
//
//   node pipeline/gate.mjs <stage>                              check a stage and record the result
//   node pipeline/gate.mjs record <stage> <RESULT> "<evidence>"  record a manual stage (approval, GO)
//   node pipeline/gate.mjs hash <file>                           print the hash the owner approves
//   node pipeline/gate.mjs status | list | plan | verify-ledger  (plan: the stages that apply to this project)
//   node pipeline/gate.mjs usage <stage> <input-tokens> <output-tokens>   record actual usage for the budget
//   node pipeline/gate.mjs phase <n> "<what was delivered>"      run `npm run verify` and record a kit build phase
//
// Exit codes: 0 PASS or SKIPPED, 1 FAIL, 2 usage error, 3 BLOCKED (a file, script or owner input is missing).
// AKCK_ROOT sets the project folder (default: this repository). AKCK_AGENT names the agent in the ledger; it never
// changes a result.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { budgetCheck, CHECKS } from './lib/checks.mjs';
import { appendLedger, latestByStage, verifyLedger } from './lib/ledger.mjs';
import { blocked, fail, Outcome } from './lib/outcome.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.AKCK_ROOT || path.join(HERE, '..'));
const LEDGER = path.join(ROOT, 'ledger', 'pipeline.jsonl');
const KIT_LEDGER = path.join(ROOT, 'ledger', 'kit.jsonl');
const STAGES_FILE = existsSync(path.join(ROOT, 'pipeline', 'stages.json'))
  ? path.join(ROOT, 'pipeline', 'stages.json')
  : path.join(HERE, 'stages.json');
const STAGES = JSON.parse(readFileSync(STAGES_FILE, 'utf8')).stages;
const RESULTS = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];
const AGENT = process.env.AKCK_AGENT || 'unknown';

const abs = (p) => path.join(ROOT, ...p.split('/'));
const readText = (p) => readFileSync(abs(p), 'utf8').replace(/\r\n/g, '\n');
/** What the owner approves: the first 12 hex of the file's sha256, line endings normalised. */
const fileHash = (p) => createHash('sha256').update(readText(p)).digest('hex').slice(0, 12);

function config() {
  const f = abs('kit.config.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}
const lookup = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function applies(stage) {
  if (!stage.when) return true;
  const cfg = config();
  return Object.entries(stage.when).every(([key, want]) => {
    const have = lookup(cfg, key);
    return Array.isArray(want) ? want.includes(have) : have === want;
  });
}

const ctx = { abs, readText, fileHash, config, applies, stages: STAGES, latest: () => latestByStage(LEDGER) };

function runNpm(script) {
  const pkgFile = abs('package.json');
  if (!existsSync(pkgFile)) blocked('package.json is missing', 'create the project first');
  if (!JSON.parse(readFileSync(pkgFile, 'utf8')).scripts?.[script]) blocked(`npm script "${script}" does not exist yet`, `add the "${script}" script`);
  const r = spawnSync('npm', ['run', '--silent', script], { cwd: ROOT, shell: process.platform === 'win32', encoding: 'utf8' });
  if (r.status !== 0) fail(`npm run ${script} exited ${r.status}: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-5).join(' | ')}`);
}

function check(stage) {
  if (!applies(stage)) return { result: 'SKIPPED', evidence: 'does not apply to this project (kit.config.json)' };
  if (stage.pending) blocked(`this stage's gate is not built yet (${stage.pending})`, `build ${stage.pending} of docs/PLAN.md first`);
  if (stage.manual) blocked(stage.manual, `record it: node pipeline/gate.mjs record ${stage.id} PASS "owner typed: ..."`);
  const notes = [];
  if (stage.budget) notes.push(budgetCheck(ctx));
  for (const out of stage.outputs ?? []) if (!existsSync(abs(out))) blocked(`${out} does not exist`, `${stage.agent}: write ${out}`);
  for (const name of stage.checks ?? []) {
    if (!CHECKS[name]) blocked(`unknown check "${name}"`, 'fix pipeline/stages.json');
    const note = CHECKS[name](stage, ctx);
    if (note) notes.push(note);
  }
  for (const script of stage.npm ?? []) runNpm(script);
  return { result: 'PASS', evidence: [...(stage.outputs ?? []), ...notes, ...(stage.npm ?? []).map((s) => `npm run ${s}`)].join('; ') || 'ok' };
}

function head() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** A manual PASS is accepted only when the owner's words carry the right hash or commit. */
function checkManualPass(stage, evidence) {
  if (stage.approves) {
    if (!existsSync(abs(stage.approves))) blocked(`${stage.approves} does not exist`, `write ${stage.approves} first`);
    const want = fileHash(stage.approves);
    const got = /\bAPPROVE\s+([0-9a-f]{6,64})\b/.exec(evidence)?.[1];
    if (!got) fail('the evidence has no "APPROVE <hash>"', `owner: APPROVE ${want}`);
    if (got !== want) fail(`APPROVE ${got} does not match ${stage.approves} as it is now (${want})`, `owner: APPROVE ${want}`);
  }
  if (stage.go) {
    CHECKS['approvals-current'](stage, ctx);
    const sha = head();
    if (!sha) blocked('there is no commit to approve', 'commit the work first');
    const got = /\bGO\s+([0-9a-f]{7,40})\b/.exec(evidence)?.[1];
    if (!got) fail('the evidence has no "GO <sha>"', `owner: GO ${sha.slice(0, 12)}`);
    if (!sha.startsWith(got)) fail(`GO ${got} is not the current commit (${sha.slice(0, 12)})`, `owner: GO ${sha.slice(0, 12)}`);
  }
}

function nextStage() {
  const latest = latestByStage(LEDGER);
  return STAGES.find((s) => applies(s) && !['PASS', 'SKIPPED'].includes(latest.get(s.id)?.result))?.id ?? 'done';
}
function nextStageAfter(stage, result) {
  if (!['PASS', 'SKIPPED'].includes(result)) return '';
  const i = STAGES.findIndex((s) => s.id === stage.id);
  return STAGES.slice(i + 1).find(applies)?.id ?? 'done';
}

function attempt(stage, gate, fn) {
  let outcome;
  try {
    outcome = fn();
  } catch (e) {
    if (!(e instanceof Outcome)) throw e;
    outcome = { result: e.result, evidence: e.evidence, next: e.next };
  }
  const entry = appendLedger(LEDGER, { stage: stage.id, agent: AGENT, gate, ...outcome, next: outcome.next ?? nextStageAfter(stage, outcome.result) });
  console.log(`${entry.result} ${stage.id}: ${entry.evidence}${entry.next ? `\nnext: ${entry.next}` : ''}`);
  process.exit({ PASS: 0, SKIPPED: 0, FAIL: 1, BLOCKED: 3 }[entry.result]);
}

function usage(message) {
  if (message) console.error(message);
  console.error('usage: gate.mjs <stage> | record <stage> <PASS|FAIL|BLOCKED|SKIPPED> "<evidence>" | hash <file> | usage <stage> <in> <out> | status | list | plan | verify-ledger | phase <n> "<text>"');
  process.exit(2);
}

const [cmd, ...rest] = process.argv.slice(2);
const find = (id) => STAGES.find((s) => s.id === id) ?? usage(`unknown stage "${id}"`);

if (!cmd) usage();
else if (cmd === 'list') {
  for (const s of STAGES) console.log(`${s.id}\t${s.agent}\t${s.summary}`);
} else if (cmd === 'plan') {
  for (const s of STAGES) if (applies(s)) console.log(s.id);
} else if (cmd === 'status') {
  const latest = latestByStage(LEDGER);
  for (const s of STAGES) console.log(`${s.id}\t${applies(s) ? latest.get(s.id)?.result ?? '-' : 'n/a'}`);
  console.log(`next: ${nextStage()}`);
} else if (cmd === 'verify-ledger') {
  let bad = false;
  for (const file of [LEDGER, KIT_LEDGER]) {
    const v = verifyLedger(file);
    const name = path.relative(ROOT, file).replace(/\\/g, '/');
    if (v.ok) console.log(`${name}: PASS (${v.count} entries)`);
    else {
      bad = true;
      console.error(`${name}: FAIL\n${v.errors.join('\n')}`);
    }
  }
  if (bad) process.exit(1);
} else if (cmd === 'usage') {
  // Actual token usage for a stage, as the coding agent reported it. Where an agent reports nothing, record nothing
  // and tell the Admin: the row stays [U].
  const [id, i, o] = rest;
  find(id);
  if (!/^\d+$/.test(i ?? '') || !/^\d+$/.test(o ?? '')) usage('usage needs whole numbers: usage <stage> <input-tokens> <output-tokens>');
  mkdirSync(abs('estimates'), { recursive: true });
  appendFileSync(abs('estimates/usage.jsonl'), JSON.stringify({ at: new Date().toISOString().slice(0, 16) + 'Z', stage: id, agent: AGENT, in: Number(i), out: Number(o) }) + '\n');
  console.log(`usage recorded for ${id}`);
} else if (cmd === 'phase') {
  // The kit's own build phases (docs/PLAN.md §7). PASS is written only when `npm run verify` passes right now.
  const [n, ...words] = rest;
  if (!/^\d+[a-z]?$/.test(n ?? '')) usage('phase needs a number, e.g. phase 1 "what was delivered"');
  const r = spawnSync('npm', ['run', '--silent', 'verify'], { cwd: ROOT, shell: process.platform === 'win32', encoding: 'utf8' });
  const result = r.status === 0 ? 'PASS' : 'FAIL';
  const sha = head();
  const entry = appendLedger(KIT_LEDGER, {
    stage: `phase-${n}`,
    agent: AGENT,
    result,
    gate: 'npm run verify',
    evidence: `${words.join(' ')}${sha ? ` | on top of commit ${sha.slice(0, 12)}` : ' | no commit yet'}${result === 'FAIL' ? ` | ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ')}` : ''}`,
    next: result === 'PASS' ? 'owner: approve the phase' : 'fix and re-run',
  });
  console.log(`${entry.result} ${entry.stage}: ${entry.evidence}`);
  process.exit(result === 'PASS' ? 0 : 1);
} else if (cmd === 'hash') {
  if (!rest[0] || !existsSync(abs(rest[0]))) usage('hash needs an existing file path, relative to the project');
  console.log(fileHash(rest[0]));
} else if (cmd === 'record') {
  const [id, result, evidence = ''] = rest;
  if (!id || !RESULTS.includes(result)) usage();
  const stage = find(id);
  attempt(stage, `gate.mjs record ${id}`, () => {
    if (result === 'PASS') {
      if (!stage.manual) fail(`${id} is not a manual stage: its PASS comes only from running the gate`, `node pipeline/gate.mjs ${id}`);
      checkManualPass(stage, evidence);
    }
    return { result, evidence };
  });
} else {
  const stage = find(cmd);
  attempt(stage, `gate.mjs ${cmd}`, () => check(stage));
}
