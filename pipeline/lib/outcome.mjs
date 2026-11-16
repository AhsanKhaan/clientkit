// How a check ends a gate run early. FAIL: the work is wrong. BLOCKED: something is missing.
export class Outcome extends Error {
  constructor(result, evidence, next) {
    super(evidence);
    Object.assign(this, { result, evidence, next });
  }
}
export const fail = (evidence, next = 'fix and re-run the gate') => { throw new Outcome('FAIL', evidence, next); };
export const blocked = (evidence, next) => { throw new Outcome('BLOCKED', evidence, next); };
