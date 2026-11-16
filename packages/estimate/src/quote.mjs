// Path 2: the client quote request. Admin approval by hash is required before a client sees anything.
// Pure functions over a plain quote object: { id, request, versions: [...], events: [...] }. No dependencies.
import { createHash } from 'node:crypto';

/** What the client must answer. Lists may be empty when the honest answer is "none"; they must still be given. */
const TEXT = ['business', 'customers', 'goals', 'contentSupplied', 'motionTier', 'budgetRange', 'deadline'];
const LISTS = ['brandAssets', 'likes', 'dislikes', 'features'];
const NON_EMPTY_LISTS = ['pages'];

export function missingAnswers(request) {
  const missing = [];
  for (const k of TEXT) if (typeof request?.[k] !== 'string' || !request[k].trim()) missing.push(k);
  for (const k of LISTS) if (!Array.isArray(request?.[k])) missing.push(k);
  for (const k of NON_EMPTY_LISTS) if (!Array.isArray(request?.[k]) || request[k].length === 0) missing.push(k);
  if (typeof request?.cms !== 'boolean') missing.push('cms');
  return missing;
}

/** The Admin's defaults. Nothing is assumed: a quote cannot be drafted until each one is set. */
export function missingSettings(settings) {
  const missing = [];
  if (typeof settings?.marginPercent !== 'number' || settings.marginPercent < 0) missing.push('marginPercent');
  if (!Number.isInteger(settings?.validityDays) || settings.validityDays < 1) missing.push('validityDays');
  if (!/^[A-Z]{3}$/.test(settings?.currency ?? '')) missing.push('currency');
  return missing;
}

const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
};

/** What the Admin approves: the client-facing terms plus the internal figures they were set from. */
export function versionHash(version) {
  const { n, scope, deliverables, price, currency, validityDays, internal } = version;
  return createHash('sha256').update(canonical({ n, scope, deliverables, price, currency, validityDays, internal })).digest('hex').slice(0, 12);
}

const day = (d) => d.toISOString().slice(0, 10);
const latest = (q) => q.versions.at(-1);
const log = (q, type, now, detail = {}) => q.events.push({ at: now.toISOString().slice(0, 16) + 'Z', type, ...detail });

export function newQuote(id, request, now = new Date()) {
  const missing = missingAnswers(request);
  if (missing.length) {
    const e = new Error(`the quote request is not complete, so no quote was drafted. Missing: ${missing.join(', ')}`);
    e.missing = missing;
    throw e;
  }
  const q = { id, request, versions: [], events: [] };
  log(q, 'requested', now);
  return q;
}

/**
 * Drafts the next version. `internalEstimate` is the result of internal.estimate(); `terms` is the Admin's scope,
 * deliverables and fixed fees. The price is (highest estimated cost + fixed fees) with the margin applied, unless
 * the Admin sets `terms.price`.
 */
export function draft(q, internalEstimate, terms, settings, now = new Date()) {
  const missing = missingSettings(settings);
  if (missing.length) throw new Error(`the Admin's quote settings are not set: ${missing.join(', ')}`);
  if (!terms?.scope?.trim() || !Array.isArray(terms.deliverables) || terms.deliverables.length === 0) throw new Error('a draft needs a scope and at least one deliverable');
  if (q.versions.some((v) => v.status === 'accepted')) throw new Error('this quote was accepted; a change of scope starts a new quote request');
  const fixedFees = terms.fixedFees ?? 0;
  const computed = Math.round((internalEstimate.total.cost[1] + fixedFees) * (1 + settings.marginPercent / 100) * 100) / 100;
  for (const v of q.versions) if (['draft', 'approved', 'changes-requested'].includes(v.status)) v.status = 'superseded';
  const version = {
    n: q.versions.length + 1,
    status: 'draft',
    scope: terms.scope.trim(),
    deliverables: terms.deliverables,
    price: terms.price ?? computed,
    currency: settings.currency,
    validityDays: settings.validityDays,
    internal: { estimate: internalEstimate, fixedFees, marginPercent: settings.marginPercent, priceWasSetByHand: terms.price != null },
  };
  q.versions.push(version);
  log(q, 'drafted', now, { version: version.n });
  return version;
}

/** The Admin types APPROVE <hash>. A hash for an older or edited version is refused. */
export function approve(q, hash, by, now = new Date()) {
  const v = latest(q);
  if (!v || v.status !== 'draft') throw new Error('there is no draft waiting for approval');
  const want = versionHash(v);
  if (hash !== want) throw new Error(`APPROVE ${hash} does not match version ${v.n} as it is now (${want})`);
  v.status = 'approved';
  v.approvedHash = want;
  v.approvedBy = by;
  v.approvedOn = day(now);
  v.validUntil = day(new Date(now.getTime() + v.validityDays * 86400000));
  log(q, 'approved', now, { version: v.n, hash: want, by });
  return v;
}

/** All a client may see: the latest version, and only once the Admin has approved exactly what it says now. */
export function clientView(q) {
  const v = latest(q);
  if (!v || !['approved', 'accepted'].includes(v.status)) return null;
  if (v.approvedHash !== versionHash(v)) return null;
  return { quoteId: q.id, version: v.n, status: v.status, scope: v.scope, deliverables: v.deliverables, price: v.price, currency: v.currency, validUntil: v.validUntil };
}

export function accept(q, now = new Date()) {
  const view = clientView(q);
  if (!view || view.status !== 'approved') throw new Error('there is no approved quote to accept');
  if (day(now) > view.validUntil) throw new Error(`this quote was valid until ${view.validUntil}; ask for a new one`);
  latest(q).status = 'accepted';
  latest(q).acceptedOn = day(now);
  log(q, 'accepted', now, { version: view.version });
  return clientView(q);
}

/** The client asks for a change. The Admin then drafts a new version, which needs a new approval. */
export function requestChanges(q, text, now = new Date()) {
  const v = latest(q);
  if (!v || v.status !== 'approved') throw new Error('changes can be requested only on an approved quote');
  if (!text?.trim()) throw new Error('say what should change');
  v.status = 'changes-requested';
  log(q, 'changes-requested', now, { version: v.n, text: text.trim() });
}

/** True only for an accepted version whose content still matches what the Admin approved. */
export function isAccepted(q) {
  const v = q?.versions?.at(-1);
  return Boolean(v && v.status === 'accepted' && v.approvedHash === versionHash(v));
}
