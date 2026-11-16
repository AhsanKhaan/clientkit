// The internal estimate (B3): tokens per stage as a range, and cost from the Admin's dated price table.
// Admin only. Nothing from this module may reach a client: the client path is src/client.mjs and imports none of it.
import { MOTION_TIERS, readOptions } from './options.mjs';

const round = (n) => Math.round(n / 1000) * 1000;
const scale = (range, k) => range.map((v) => round(v * k));
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

/** A model's price entry must be usable: a subscription, or an API price someone checked on a date. */
export function readModel(priceTable, modelId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(priceTable?.date ?? '')) throw new Error('the price table needs a "date" (YYYY-MM-DD)');
  const m = priceTable.models?.[modelId];
  if (!m) throw new Error(`model "${modelId}" is not in the price table (the Admin adds it with its price, source and check date)`);
  if (m.kind === 'subscription') return { id: modelId, kind: 'subscription', inPerM: 0, outPerM: 0 };
  if (m.kind !== 'api') throw new Error(`model "${modelId}": kind must be "api" or "subscription"`);
  for (const k of ['inPerM', 'outPerM']) if (typeof m[k] !== 'number' || m[k] < 0) throw new Error(`model "${modelId}": ${k} must be a price per million tokens`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.checked ?? '') || !m.source) throw new Error(`model "${modelId}": an API price needs "checked" (date) and "source" (where the price was read)`);
  return { id: modelId, kind: 'api', inPerM: m.inPerM, outPerM: m.outPerM };
}

export function estimate(rawOptions, modelId, priceTable, ranges) {
  const o = readOptions(rawOptions);
  const model = readModel(priceTable, modelId);
  const s = ranges.stages;
  const x = ranges.multipliers;
  const motion = x.motion[o.motionTier];
  const lang = 1 + x.perExtraLanguage * (o.languages - 1);
  const sections = o.pages * o.sectionsPerPage;

  const rows = [];
  const push = (id, part, k = 1) => rows.push({ id, in: scale(part.in, k), out: scale(part.out, k) });
  push('brief', s.brief);
  push('keywords', o.purpose === 'brand-first' ? s.keywordsLight : s.keywordsFull);
  push('design', s.design, 1 + x.designPerMotionStep * MOTION_TIERS.indexOf(o.motionTier));
  const build = {
    in: add(add(s.buildBase.in, s.buildPerSection.in.map((v) => v * sections)), s.buildPerFeature.in.map((v) => v * o.features.length)),
    out: add(add(s.buildBase.out, s.buildPerSection.out.map((v) => v * sections)), s.buildPerFeature.out.map((v) => v * o.features.length)),
  };
  push('build', build, motion * lang);
  if (o.cms) push('cms', s.cms);
  push('reviews', s.reviews, 1 + (x.reviewsPerTwentyPages * o.pages) / 20);

  const cost = (r) => [0, 1].map((i) => Math.round(((r.in[i] * model.inPerM + r.out[i] * model.outPerM) / 1e6) * 100) / 100);
  const stages = rows.map((r) => ({ ...r, cost: cost(r) }));
  const total = stages.reduce((t, r) => ({ in: add(t.in, r.in), out: add(t.out, r.out), cost: add(t.cost, r.cost).map((v) => Math.round(v * 100) / 100) }), { in: [0, 0], out: [0, 0], cost: [0, 0] });
  return {
    options: o,
    model: model.id,
    modelKind: model.kind,
    currency: priceTable.currency ?? 'USD',
    priceTableDate: priceTable.date,
    rangesDate: ranges.date,
    label: 'R',
    basis: 'token ranges are [P] until recalibrated from real builds',
    stages,
    total,
  };
}

const n = (v) => v.toLocaleString('en-US');
const span = (r) => `${n(r[0])} to ${n(r[1])}`;

/** reports/estimate.md. `usage` (optional) is the list from estimates/usage.jsonl. */
export function estimateMarkdown(e, usage = []) {
  const used = (id) => usage.filter((u) => u.stage === id).reduce((t, u) => ({ in: t.in + u.in, out: t.out + u.out }), { in: 0, out: 0 });
  const lines = [
    '# Estimate',
    '',
    `- Model: \`${e.model}\` (${e.modelKind}). Price table dated ${e.priceTableDate}; token ranges dated ${e.rangesDate}.`,
    `- Ranges are [R]. The token ranges behind them are [P] until recalibrated from real builds.`,
    `- ${e.options.pages} pages, ${e.options.sectionsPerPage} sections per page, ${e.options.languages} language(s), motion ${e.options.motionTier}, CMS ${e.options.cms ? 'yes' : 'no'}, purpose ${e.options.purpose}, ${e.options.features.length} feature(s).`,
    '',
    `| Stage | Input tokens [R] | Output tokens [R] | Cost ${e.currency} [R] | Actual input [M] | Actual output [M] |`,
    '|---|---|---|---|---|---|',
    ...e.stages.map((r) => {
      const u = used(r.id);
      return `| ${r.id} | ${span(r.in)} | ${span(r.out)} | ${span(r.cost)} | ${u.in ? n(u.in) : '-'} | ${u.out ? n(u.out) : '-'} |`;
    }),
    `| **Total** | ${span(e.total.in)} | ${span(e.total.out)} | ${span(e.total.cost)} | | |`,
    '',
  ];
  if (e.modelKind === 'subscription') lines.push('Cost is 0 because the work runs under an existing subscription; the tokens still count against that plan\'s usage limits.', '');
  return lines.join('\n');
}
