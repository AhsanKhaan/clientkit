// Budget check (B3): warn at 80% of the budget, stop at 100% until the Admin raises it. Pure functions.
export const WARN_AT = 0.8;

/** `usage` is a list of { stage, in, out }; `budget` is { tokens, setBy, setOn }. */
export function budgetStatus(budget, usage) {
  if (!Number.isInteger(budget?.tokens) || budget.tokens <= 0 || !budget.setBy) return { state: 'unset', used: 0, share: 0 };
  const used = usage.reduce((t, u) => t + u.in + u.out, 0);
  const share = used / budget.tokens;
  return { state: share >= 1 ? 'stop' : share >= WARN_AT ? 'warn' : 'ok', used, share, tokens: budget.tokens };
}

export function readUsage(text) {
  return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}
