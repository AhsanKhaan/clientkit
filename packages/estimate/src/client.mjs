// Path 1: the self-serve estimator a client may use. No approval, no commitment.
// It reads only the rate card the Admin published (price ranges with margin already applied). It never imports the
// internal estimate, so token costs and the margin cannot reach its output.
import { readOptions } from './options.mjs';

export const NOTICE = 'Indicative estimate, not a quote.';
const FORBIDDEN_KEY = /margin|token|cost|internal/i;
const isRange = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && x >= 0) && v[0] <= v[1];

/** Throws if the rate card is unusable, or carries anything a client must not see. */
export function readRateCard(card) {
  const problems = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(card?.date ?? '')) problems.push('date: YYYY-MM-DD');
  if (!/^[A-Z]{3}$/.test(card?.currency ?? '')) problems.push('currency: a three-letter code');
  for (const k of ['base', 'perPage', 'perSection', 'perFeature', 'cms']) if (!isRange(card?.[k])) problems.push(`${k}: a [low, high] price range`);
  for (const t of ['none', 'subtle', 'rich', 'immersive']) if (typeof card?.motion?.[t] !== 'number') problems.push(`motion.${t}: a multiplier`);
  if (typeof card?.perExtraLanguage !== 'number') problems.push('perExtraLanguage: a fraction such as 0.3');
  const walk = (obj, at) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (FORBIDDEN_KEY.test(k)) problems.push(`${at}${k}: a client rate card must not hold margin, token or cost fields`);
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${at}${k}.`);
    }
  };
  walk(card, '');
  if (problems.length) throw new Error(`the client rate card is not valid:\n  ${problems.join('\n  ')}`);
  return card;
}

export function clientEstimate(rawOptions, rateCard) {
  const o = readOptions(rawOptions);
  const c = readRateCard(rateCard);
  const lang = 1 + c.perExtraLanguage * (o.languages - 1);
  const range = [0, 1].map((i) => {
    const content = (c.perPage[i] * o.pages + c.perSection[i] * o.pages * o.sectionsPerPage + c.perFeature[i] * o.features.length) * c.motion[o.motionTier] * lang;
    return Math.round((c.base[i] + content + (o.cms ? c.cms[i] : 0)) / 10) * 10;
  });
  return {
    notice: NOTICE,
    range,
    currency: c.currency,
    rateCardDate: c.date,
    choices: o,
    // Carried into the quote request form, so the client doesn't answer the same things twice.
    quoteRequestPrefill: { pages: o.pages, sectionsPerPage: o.sectionsPerPage, languages: o.languages, features: o.features, motionTier: o.motionTier, cms: o.cms, purpose: o.purpose },
  };
}
