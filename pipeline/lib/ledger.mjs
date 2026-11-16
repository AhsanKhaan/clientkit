// The ledger: append-only JSON Lines, one entry per gate run or approval. Each entry carries the hash of the one
// before it, so a changed, removed or reordered line is detected by verify(). No dependencies.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { redact } from '../../lib/secret-patterns.mjs';

export const GENESIS = '0'.repeat(64);
const FIELDS = ['seq', 'at', 'stage', 'agent', 'attempt', 'result', 'gate', 'evidence', 'next', 'prev'];

const digest = (entry) => createHash('sha256').update(JSON.stringify(FIELDS.map((k) => entry[k] ?? null))).digest('hex');

export function readLedger(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l, i) => {
    try {
      return JSON.parse(l);
    } catch {
      throw new Error(`ledger line ${i + 1} is not valid JSON`);
    }
  });
}

/** Returns { ok, errors }. An empty ledger is valid. */
export function verifyLedger(file) {
  const errors = [];
  let entries;
  try {
    entries = readLedger(file);
  } catch (e) {
    return { ok: false, errors: [e.message], count: 0 };
  }
  let prev = GENESIS;
  entries.forEach((e, i) => {
    const n = i + 1;
    if (e.seq !== n) errors.push(`entry ${n}: seq is ${e.seq}, expected ${n}`);
    if (e.prev !== prev) errors.push(`entry ${n}: prev does not match the hash of entry ${n - 1}`);
    if (e.hash !== digest(e)) errors.push(`entry ${n}: content does not match its hash`);
    prev = e.hash;
  });
  return { ok: errors.length === 0, errors, count: entries.length };
}

/** Appends one entry. Refuses to write onto a ledger whose chain is already broken. */
export function appendLedger(file, { stage, agent, result, gate, evidence, next, now = new Date() }) {
  const check = verifyLedger(file);
  if (!check.ok) throw new Error(`the ledger is damaged, so nothing was appended: ${check.errors[0]}`);
  const entries = readLedger(file);
  const last = entries.at(-1);
  const entry = {
    seq: entries.length + 1,
    at: now.toISOString().slice(0, 16) + 'Z',
    stage,
    agent: agent || 'unknown',
    attempt: entries.filter((e) => e.stage === stage).length + 1,
    result,
    gate,
    evidence: redact(evidence ?? '').slice(0, 2000),
    next: next ?? '',
    prev: last ? last.hash : GENESIS,
  };
  entry.hash = digest(entry);
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(entry) + '\n');
  return entry;
}

/** The latest entry per stage. */
export function latestByStage(file) {
  const map = new Map();
  for (const e of readLedger(file)) map.set(e.stage, e);
  return map;
}
