import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { budgetStatus } from '../packages/estimate/src/budget.mjs';
import { clientEstimate, NOTICE, readRateCard } from '../packages/estimate/src/client.mjs';
import { estimate, estimateMarkdown } from '../packages/estimate/src/internal.mjs';
import { accept, approve, clientView, draft, isAccepted, missingAnswers, newQuote, requestChanges, versionHash } from '../packages/estimate/src/quote.mjs';
import { KIT } from './helpers.mjs';

// Fixtures: invented numbers for tests only. They are not real prices.
const RANGES = JSON.parse(readFileSync(path.join(KIT, 'packages/estimate/data/token-ranges.json'), 'utf8'));
const TABLE = { date: '2026-01-01', currency: 'USD', models: { subscription: { kind: 'subscription' }, 'fake-model': { kind: 'api', inPerM: 2, outPerM: 10, checked: '2026-01-01', source: 'test fixture' }, unchecked: { kind: 'api', inPerM: 2, outPerM: 10 } } };
const CARD = { date: '2026-01-01', currency: 'USD', base: [500, 800], perPage: [50, 90], perSection: [10, 20], perFeature: [80, 150], cms: [400, 700], motion: { none: 1, subtle: 1.1, rich: 1.4, immersive: 1.9 }, perExtraLanguage: 0.3 };
const OPTIONS = { purpose: 'brand-first', pages: 5, sectionsPerPage: 4, languages: 1, features: ['contact form'], motionTier: 'subtle', cms: false };
const REQUEST = { business: 'A bakery', customers: 'Locals', goals: 'More orders', brandAssets: [], likes: [], dislikes: [], pages: ['Home', 'Menu'], features: [], contentSupplied: 'Photos and menu', motionTier: 'subtle', cms: false, budgetRange: '1000-2000', deadline: '2027-01-31' };
const SETTINGS = { marginPercent: 40, validityDays: 30, currency: 'USD' };
const TERMS = { scope: 'Five-page site', deliverables: ['Design', 'Build'], fixedFees: 100 };
const DAY0 = new Date('2026-11-17T10:00:00Z');

test('the internal estimate scales with pages, motion tier, CMS and languages', () => {
  const base = estimate(OPTIONS, 'fake-model', TABLE, RANGES);
  const top = (o) => estimate({ ...OPTIONS, ...o }, 'fake-model', TABLE, RANGES).total.in[1];
  assert.ok(top({ pages: 10 }) > base.total.in[1]);
  assert.ok(top({ motionTier: 'immersive' }) > base.total.in[1]);
  assert.ok(top({ cms: true }) > base.total.in[1]);
  assert.ok(top({ languages: 3 }) > base.total.in[1]);
  assert.ok(top({ purpose: 'search-first' }) > base.total.in[1]);
  assert.ok(base.total.cost[0] > 0 && base.total.cost[0] <= base.total.cost[1]);
  assert.equal(estimate(OPTIONS, 'subscription', TABLE, RANGES).total.cost[1], 0);
  assert.equal(base.priceTableDate, '2026-01-01');
  assert.match(estimateMarkdown(base, [{ stage: 'brief', in: 50000, out: 6000 }]), /\| brief \|.*\| 50,000 \| 6,000 \|/);
});

test('planted: an API price with no check date, an unknown model and bad options are refused', () => {
  assert.throws(() => estimate(OPTIONS, 'unchecked', TABLE, RANGES), /needs "checked"/);
  assert.throws(() => estimate(OPTIONS, 'nope', TABLE, RANGES), /not in the price table/);
  assert.throws(() => estimate({ ...OPTIONS, pages: 0, motionTier: 'wild' }, 'subscription', TABLE, RANGES), /pages:.*\n.*motionTier/);
});

test('the client estimator is labelled, dated, and carries no margin or token cost', () => {
  const r = clientEstimate(OPTIONS, CARD);
  assert.equal(r.notice, NOTICE);
  assert.match(r.notice, /not a quote/);
  assert.equal(r.rateCardDate, '2026-01-01');
  assert.ok(r.range[0] < r.range[1]);
  assert.deepEqual(r.quoteRequestPrefill.features, ['contact form']);
  assert.doesNotMatch(JSON.stringify(r), /margin|token|inPerM|cost/i);
  const source = readFileSync(path.join(KIT, 'packages/estimate/src/client.mjs'), 'utf8');
  assert.doesNotMatch(source, /from '\.\/(internal|quote)\.mjs'/, 'the client path must not import the internal modules');
});

test('planted: a rate card that holds a margin or token field is refused', () => {
  assert.throws(() => readRateCard({ ...CARD, marginPercent: 40 }), /must not hold margin/);
  assert.throws(() => readRateCard({ ...CARD, extras: { tokenCost: 3 } }), /extras\.tokenCost/);
  assert.throws(() => readRateCard({ ...CARD, base: [9, 1] }), /base/);
});

test('planted: a quote request with missing answers is not drafted, and lists what is missing', () => {
  const partial = { ...REQUEST, goals: ' ', pages: [], deadline: undefined, cms: 'yes' };
  assert.deepEqual(missingAnswers(partial), ['goals', 'deadline', 'pages', 'cms']);
  assert.throws(() => newQuote('q1', partial), (e) => e.missing.length === 4 && /no quote was drafted/.test(e.message));
  assert.deepEqual(missingAnswers(REQUEST), []);
});

test('planted: no draft until the Admin has set margin, validity and currency', () => {
  const q = newQuote('q1', REQUEST, DAY0);
  const e = estimate(OPTIONS, 'fake-model', TABLE, RANGES);
  assert.throws(() => draft(q, e, TERMS, { currency: 'USD' }, DAY0), /marginPercent, validityDays/);
});

test('a client sees nothing until the Admin approves by hash, and then only the client-facing terms', () => {
  const q = newQuote('q1', REQUEST, DAY0);
  const e = estimate(OPTIONS, 'fake-model', TABLE, RANGES);
  const v = draft(q, e, TERMS, SETTINGS, DAY0);
  assert.equal(v.price, Math.round((e.total.cost[1] + 100) * 1.4 * 100) / 100);
  assert.equal(clientView(q), null, 'a draft is not visible');

  assert.throws(() => approve(q, '000000000000', 'Admin', DAY0), /does not match/);
  approve(q, versionHash(v), 'Admin', DAY0);
  const view = clientView(q);
  assert.deepEqual(Object.keys(view).sort(), ['currency', 'deliverables', 'price', 'quoteId', 'scope', 'status', 'validUntil', 'version']);
  assert.equal(view.validUntil, '2026-12-17');
  assert.doesNotMatch(JSON.stringify(view), /margin|internal|estimate|fixedFees/);
});

test('planted: a quote edited after approval is hidden and does not count as accepted', () => {
  const q = newQuote('q1', REQUEST, DAY0);
  const v = draft(q, estimate(OPTIONS, 'fake-model', TABLE, RANGES), TERMS, SETTINGS, DAY0);
  approve(q, versionHash(v), 'Admin', DAY0);
  accept(q, DAY0);
  assert.equal(isAccepted(q), true);
  q.versions.at(-1).price = 1;
  assert.equal(clientView(q), null);
  assert.equal(isAccepted(q), false);
});

test('planted: a scope change needs a new Admin approval before the client can accept', () => {
  const q = newQuote('q1', REQUEST, DAY0);
  const e = estimate(OPTIONS, 'fake-model', TABLE, RANGES);
  approve(q, versionHash(draft(q, e, TERMS, SETTINGS, DAY0)), 'Admin', DAY0);
  requestChanges(q, 'Add a blog', DAY0);
  const v2 = draft(q, e, { ...TERMS, scope: 'Five-page site with a blog' }, SETTINGS, DAY0);
  assert.equal(v2.n, 2);
  assert.equal(clientView(q), null, 'the new draft is not visible');
  assert.throws(() => accept(q, DAY0), /no approved quote/);
  assert.throws(() => approve(q, q.versions[0].approvedHash, 'Admin', DAY0), /does not match/, 'the old approval does not carry over');
  approve(q, versionHash(v2), 'Admin', DAY0);
  assert.equal(accept(q, DAY0).status, 'accepted');
  assert.equal(q.versions[0].status, 'superseded');
  assert.equal(q.events.length, 7, 'every step is kept');
});

test('planted: an expired quote cannot be accepted', () => {
  const q = newQuote('q1', REQUEST, DAY0);
  approve(q, versionHash(draft(q, estimate(OPTIONS, 'fake-model', TABLE, RANGES), TERMS, SETTINGS, DAY0)), 'Admin', DAY0);
  assert.throws(() => accept(q, new Date('2026-12-18T00:00:00Z')), /valid until 2026-12-17/);
});

test('budget: ok below 80%, warning from 80%, stop at 100%, unset without a named setter', () => {
  const b = { tokens: 1000, setBy: 'Admin' };
  const use = (n) => [{ stage: 'x', in: n, out: 0 }];
  assert.equal(budgetStatus(b, use(799)).state, 'ok');
  assert.equal(budgetStatus(b, use(800)).state, 'warn');
  assert.equal(budgetStatus(b, use(1000)).state, 'stop');
  assert.equal(budgetStatus({ tokens: 1000 }, use(1)).state, 'unset');
});
