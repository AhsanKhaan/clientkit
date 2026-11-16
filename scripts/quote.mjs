#!/usr/bin/env node
// Quote requests from the command line (path 2). The Desk web app will call the same functions.
//
//   node scripts/quote.mjs new <id> <request.json>            refuse and list what is missing, or start the quote
//   node scripts/quote.mjs draft <id> <terms.json>            terms: { scope, deliverables[], fixedFees?, price? }
//   node scripts/quote.mjs show <id>                          Admin view: the latest version with the internal figures
//   node scripts/quote.mjs approve <id> "APPROVE <hash>" <admin name>
//   node scripts/quote.mjs view <id>                          exactly what the client may see
//   node scripts/quote.mjs accept <id> | changes <id> "<what should change>"
//
// Quotes live in quotes/<id>.json. The Admin's settings are config/quote-settings.json (marginPercent, validityDays,
// currency); a draft is refused until all three are set. Every step is written to the ledger.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { accept, approve, clientView, draft, newQuote, requestChanges, versionHash } from '../packages/estimate/src/quote.mjs';
import { appendLedger } from '../pipeline/lib/ledger.mjs';

const ROOT = path.resolve(process.env.AKCK_ROOT || process.cwd());
const json = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
const [cmd, id, a, b] = process.argv.slice(2);

function die(message, code = 1) {
  console.error(`quote: ${message}`);
  process.exit(code);
}
if (!cmd || !/^[a-z0-9-]+$/.test(id ?? '')) die('usage: quote.mjs <new|draft|show|approve|view|accept|changes> <id> ... (id: lowercase letters, digits, hyphens)', 2);

const file = `quotes/${id}.json`;
const load = () => (existsSync(path.join(ROOT, file)) ? json(file) : die(`${file} does not exist`));
function save(q, result, evidence) {
  mkdirSync(path.join(ROOT, 'quotes'), { recursive: true });
  writeFileSync(path.join(ROOT, file), JSON.stringify(q, null, 2) + '\n');
  appendLedger(path.join(ROOT, 'ledger/pipeline.jsonl'), { stage: `quote:${id}`, agent: process.env.AKCK_AGENT || 'unknown', result, gate: `quote.mjs ${cmd}`, evidence });
}

try {
  if (cmd === 'new') {
    if (existsSync(path.join(ROOT, file))) die(`${file} already exists`);
    const q = newQuote(id, JSON.parse(readFileSync(a, 'utf8')));
    save(q, 'PASS', 'quote request complete');
    console.log(`quote ${id}: request recorded. Next: draft it.`);
  } else if (cmd === 'draft') {
    const q = load();
    if (!existsSync(path.join(ROOT, 'config/quote-settings.json'))) die('config/quote-settings.json is missing: the Admin sets marginPercent, validityDays and currency first');
    if (!existsSync(path.join(ROOT, 'estimates/estimate.json'))) die('estimates/estimate.json is missing: run scripts/estimate.mjs first');
    const v = draft(q, json('estimates/estimate.json'), JSON.parse(readFileSync(a, 'utf8')), json('config/quote-settings.json'));
    save(q, 'BLOCKED', `version ${v.n} drafted; waits for the Admin's APPROVE ${versionHash(v)}`);
    console.log(`quote ${id} v${v.n}: ${v.currency} ${v.price}. Admin: APPROVE ${versionHash(v)}`);
  } else if (cmd === 'show') {
    const v = load().versions.at(-1);
    console.log(JSON.stringify(v ? { ...v, hash: versionHash(v) } : null, null, 2));
  } else if (cmd === 'approve') {
    const q = load();
    const hash = /\bAPPROVE\s+([0-9a-f]{6,64})\b/.exec(a ?? '')?.[1];
    if (!hash || !b) die('usage: quote.mjs approve <id> "APPROVE <hash>" <admin name>', 2);
    const v = approve(q, hash, b);
    save(q, 'PASS', `version ${v.n} approved by ${b}: APPROVE ${hash}; valid until ${v.validUntil}`);
    console.log(`quote ${id} v${v.n}: approved, valid until ${v.validUntil}`);
  } else if (cmd === 'view') {
    console.log(JSON.stringify(clientView(load()), null, 2));
  } else if (cmd === 'accept') {
    const q = load();
    const view = accept(q);
    save(q, 'PASS', `version ${view.version} accepted by the client`);
    console.log(`quote ${id} v${view.version}: accepted`);
  } else if (cmd === 'changes') {
    const q = load();
    requestChanges(q, a);
    save(q, 'BLOCKED', 'the client asked for changes; a new draft needs a new approval');
    console.log(`quote ${id}: changes requested. Next: draft a new version.`);
  } else die(`unknown command "${cmd}"`, 2);
} catch (e) {
  die(e.message);
}
