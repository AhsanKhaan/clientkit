// kit.config.json for a project: what the intake wrote. validateProject returns a list of problems (empty = valid).
// No dependencies.
export const PURPOSES = ['brand-first', 'search-first', 'both'];
export const MOTION_TIERS = ['none', 'subtle', 'rich', 'immersive'];
export const CMS_MODES = ['new', 'existing'];
export const DEFAULT_MOTION_TIER = 'subtle';

export function validateProject(cfg) {
  const problems = [];
  const p = cfg?.project;
  if (!p || typeof p !== 'object') return ['project: missing (the intake has not run)'];
  if (!p.name?.trim()) problems.push('project.name: missing');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(p.domain ?? '')) problems.push('project.domain: must be a domain such as example.com, without https:// or a path');
  if (!PURPOSES.includes(p.purpose)) problems.push(`project.purpose: must be one of ${PURPOSES.join(', ')} (the first intake question)`);
  if (!Array.isArray(p.languages) || p.languages.length === 0 || p.languages.some((l) => !/^[a-z]{2}(-[A-Z]{2})?$/.test(l))) {
    problems.push('project.languages: must list at least one language code such as "en" or "en-GB"');
  }
  if (!p.quoteId?.trim()) problems.push('project.quoteId: missing (generation starts only on an accepted quote)');

  if (!MOTION_TIERS.includes(cfg.motion?.tier)) problems.push(`motion.tier: must be one of ${MOTION_TIERS.join(', ')} (default ${DEFAULT_MOTION_TIER} when the client has no preference)`);

  const cms = cfg.cms;
  if (typeof cms?.enabled !== 'boolean') problems.push('cms.enabled: must be true or false (the CMS question is asked every time)');
  else if (cms.enabled && !CMS_MODES.includes(cms.mode)) problems.push(`cms.mode: must be one of ${CMS_MODES.join(', ')} when the CMS is wanted`);
  else if (!cms.enabled && Object.keys(cms).length > 1) problems.push('cms: when the answer is no, nothing but "enabled": false may be set');
  return problems;
}
