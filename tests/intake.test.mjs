import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateProject } from '../pipeline/lib/config.mjs';
import { run, tempDir, write } from './helpers.mjs';

// The real stage list is used here (no pipeline/stages.json in the project folder).
const CONFIG = { project: { name: 'Sample Bakery', domain: 'sample-bakery.example', purpose: 'brand-first', languages: ['en'], quoteId: 'q-1' }, motion: { tier: 'subtle' }, cms: { enabled: false } };
const OPTIONS = { purpose: 'brand-first', pages: 5, sectionsPerPage: 4, languages: 1, features: [], motionTier: 'subtle', cms: false };
const REQUEST = { business: 'A bakery', customers: 'Locals', goals: 'More orders', brandAssets: [], likes: [], dislikes: [], pages: ['Home'], features: [], contentSupplied: 'Photos', motionTier: 'subtle', cms: false, budgetRange: '1000-2000', deadline: '2027-01-31' };

const env = (root) => ({ AKCK_ROOT: root, AKCK_AGENT: 'test' });
const gate = (root, ...args) => run('pipeline/gate.mjs', args, { env: env(root) });
const quote = (root, ...args) => run('scripts/quote.mjs', args, { cwd: root, env: env(root) });
const plan = (cfg) => {
  const root = tempDir();
  write(root, 'kit.config.json', JSON.stringify(cfg));
  return gate(root, 'plan').out.trim().split('\n');
};

function project(cfg = CONFIG) {
  const root = tempDir();
  write(root, 'kit.config.json', JSON.stringify(cfg));
  write(root, 'intake/client-words.md', 'We are a bakery. We want people to order cakes online.\n');
  return root;
}

/** Runs intake and the whole quote flow, so later gates can be tested. */
function projectWithAcceptedQuote() {
  const root = project();
  assert.equal(gate(root, 'intake').status, 0);
  write(root, 'request.json', JSON.stringify(REQUEST));
  write(root, 'options.json', JSON.stringify(OPTIONS));
  write(root, 'terms.json', JSON.stringify({ scope: 'Five pages', deliverables: ['Site'] }));
  write(root, 'config/quote-settings.json', JSON.stringify({ marginPercent: 40, validityDays: 30, currency: 'USD' }));
  assert.equal(quote(root, 'new', 'q-1', 'request.json').status, 0);
  assert.equal(run('scripts/estimate.mjs', ['options.json'], { cwd: root, env: env(root) }).status, 0);
  const drafted = quote(root, 'draft', 'q-1', 'terms.json');
  assert.equal(drafted.status, 0, drafted.out);
  return { root, hash: /APPROVE ([0-9a-f]{12})/.exec(drafted.out)[1] };
}

test('each purpose gives its own stage list; the CMS stage appears only on yes', () => {
  const brand = plan(CONFIG);
  const search = plan({ ...CONFIG, project: { ...CONFIG.project, purpose: 'search-first' } });
  const both = plan({ ...CONFIG, project: { ...CONFIG.project, purpose: 'both' }, cms: { enabled: true, mode: 'new' } });
  assert.ok(brand.includes('keywords-light') && !brand.includes('keywords-full'));
  assert.ok(search.includes('keywords-full') && !search.includes('keywords-light'));
  assert.ok(both.includes('keywords-full') && both.includes('cms-setup'));
  assert.ok(!brand.includes('cms-setup') && !search.includes('cms-setup'));
  assert.notDeepEqual(brand, search);
  assert.notDeepEqual(search, both);
});

test('planted: intake fails without a purpose, a CMS answer, or with CMS settings after a no', () => {
  assert.deepEqual(validateProject(CONFIG), []);
  const missing = project({ ...CONFIG, project: { ...CONFIG.project, purpose: undefined }, cms: {} });
  const r = gate(missing, 'intake');
  assert.equal(r.status, 1);
  assert.match(r.out, /project\.purpose/);
  assert.match(r.out, /cms\.enabled/);
  assert.match(validateProject({ ...CONFIG, cms: { enabled: false, mode: 'new' } })[0], /nothing but "enabled": false/);
  assert.match(validateProject({ ...CONFIG, cms: { enabled: true } })[0], /cms\.mode/);
});

test('"no CMS" leaves no CMS stage to run and no CMS setting in the project', () => {
  const root = project();
  const r = gate(root, 'cms-setup');
  assert.match(r.out, /^SKIPPED cms-setup/);
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'kit.config.json'), 'utf8')).cms, { enabled: false });
});

test('planted: the client\'s words are pinned at intake, and a later edit fails the brief', () => {
  const { root, hash } = projectWithAcceptedQuote();
  quote(root, 'approve', 'q-1', `APPROVE ${hash}`, 'Admin');
  quote(root, 'accept', 'q-1');
  write(root, 'estimates/budget.json', JSON.stringify({ tokens: 5000000, setBy: 'Admin', setOn: '2026-11-17' }));
  write(root, 'docs/BRIEF.md', '# Brief\n\nA bakery that wants online cake orders.\n');
  assert.equal(gate(root, 'brief').status, 0);
  write(root, 'intake/client-words.md', 'We are a bakery. We want a huge online shop.\n');
  const r = gate(root, 'brief');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /changed after intake/);
});

test('planted: generation is refused until the quote is approved by hash and accepted', () => {
  const { root, hash } = projectWithAcceptedQuote();
  assert.equal(gate(root, 'quote').status, 3, 'a draft is not enough');
  assert.equal(JSON.parse(quote(root, 'view', 'q-1').out), null, 'the client sees nothing yet');

  assert.equal(quote(root, 'approve', 'q-1', 'APPROVE 000000000000', 'Admin').status, 1);
  assert.equal(quote(root, 'approve', 'q-1', `APPROVE ${hash}`, 'Admin').status, 0);
  assert.equal(gate(root, 'quote').status, 3, 'approved but not accepted is not enough');
  const view = JSON.parse(quote(root, 'view', 'q-1').out);
  assert.equal(view.status, 'approved');
  assert.ok(!('internal' in view));

  assert.equal(quote(root, 'accept', 'q-1').status, 0);
  const ok = gate(root, 'quote');
  assert.equal(ok.status, 0, ok.out);
  assert.equal(gate(root, 'verify-ledger').status, 0, 'quote steps are in the ledger and the chain holds');
  assert.match(readFileSync(path.join(root, 'ledger/pipeline.jsonl'), 'utf8'), /quote:q-1.*approved by Admin/);
});

test('planted: a quote request with missing answers writes no quote file', () => {
  const root = project();
  write(root, 'request.json', JSON.stringify({ ...REQUEST, goals: '', deadline: '' }));
  const r = quote(root, 'new', 'q-1', 'request.json');
  assert.equal(r.status, 1);
  assert.match(r.out, /Missing: goals, deadline/);
  assert.ok(!existsSync(path.join(root, 'quotes/q-1.json')));
});

test('planted: no budget blocks the estimate; 80% warns; 100% refuses the next stage until it is raised', () => {
  const { root, hash } = projectWithAcceptedQuote();
  quote(root, 'approve', 'q-1', `APPROVE ${hash}`, 'Admin');
  quote(root, 'accept', 'q-1');
  write(root, 'docs/BRIEF.md', '# Brief\n\nA bakery.\n');
  const none = gate(root, 'estimate');
  assert.equal(none.status, 3);
  assert.match(none.out, /no budget is set/);

  write(root, 'estimates/budget.json', JSON.stringify({ tokens: 1000, setBy: 'Admin', setOn: '2026-11-17' }));
  assert.equal(gate(root, 'estimate').status, 0);
  gate(root, 'usage', 'brief', '700', '150');
  const warn = gate(root, 'brief');
  assert.equal(warn.status, 0);
  assert.match(warn.out, /WARNING 85% of the budget used/);

  gate(root, 'usage', 'brief', '200', '0');
  const stop = gate(root, 'brief');
  assert.equal(stop.status, 3, stop.out);
  assert.match(stop.out, /budget reached: 105%/);

  write(root, 'estimates/budget.json', JSON.stringify({ tokens: 2000, setBy: 'Admin', setOn: '2026-11-18' }));
  assert.equal(gate(root, 'brief').status, 0);
});

test('a stage whose gate belongs to a later phase is BLOCKED, never passed', () => {
  const root = project();
  const r = gate(root, 'design');
  assert.equal(r.status, 3);
  assert.match(r.out, /not built yet \(Phase 4\)/);
});
