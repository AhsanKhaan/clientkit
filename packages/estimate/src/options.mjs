// The choices both estimate paths accept. Shared, and free of any cost data.
export const PURPOSES = ['brand-first', 'search-first', 'both'];
export const MOTION_TIERS = ['none', 'subtle', 'rich', 'immersive'];

/** Returns a clean options object, or throws with every problem listed. */
export function readOptions(raw) {
  const problems = [];
  const int = (key, min, max) => {
    const v = raw?.[key];
    if (!Number.isInteger(v) || v < min || v > max) problems.push(`${key}: a whole number from ${min} to ${max}`);
    return v;
  };
  const o = {
    purpose: raw?.purpose,
    pages: int('pages', 1, 200),
    sectionsPerPage: int('sectionsPerPage', 1, 20),
    languages: int('languages', 1, 20),
    features: Array.isArray(raw?.features) ? raw.features.map(String) : null,
    motionTier: raw?.motionTier,
    cms: raw?.cms,
  };
  if (!PURPOSES.includes(o.purpose)) problems.push(`purpose: one of ${PURPOSES.join(', ')}`);
  if (!MOTION_TIERS.includes(o.motionTier)) problems.push(`motionTier: one of ${MOTION_TIERS.join(', ')}`);
  if (typeof o.cms !== 'boolean') problems.push('cms: true or false');
  if (!o.features) problems.push('features: a list (it may be empty)');
  if (problems.length) throw new Error(`estimate options are not valid:\n  ${problems.join('\n  ')}`);
  return o;
}
