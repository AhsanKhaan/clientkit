import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { git, gitRepo, run, tempDir, write } from './helpers.mjs';

const STAGES = {
  stages: [
    { id: 'brief', agent: 'orchestrator', summary: 'brief', outputs: ['docs/BRIEF.md'], checks: ['no-placeholders'], npm: [] },
    { id: 'brief-approval', agent: 'owner', summary: 'approve', manual: 'owner typed APPROVE', approves: 'docs/BRIEF.md' },
    { id: 'cms', agent: 'coder', summary: 'cms', outputs: ['cms.txt'], when: { 'cms.enabled': true } },
    { id: 'build', agent: 'coder', summary: 'build', checks: ['approvals-current'], npm: [] },
    { id: 'go', agent: 'owner', summary: 'go', manual: 'owner typed GO', go: true },
  ],
};

function project(root = tempDir()) {
  write(root, 'pipeline/stages.json', JSON.stringify(STAGES));
  write(root, 'kit.config.json', JSON.stringify({ cms: { enabled: false } }));
  write(root, 'docs/BRIEF.md', '# Brief\n\nA bakery wants a five-page site.\n');
  return root;
}
const gate = (root, args, agent = 'test') => run('pipeline/gate.mjs', args, { env: { AKCK_ROOT: root, AKCK_AGENT: agent } });
const ledger = (root) => readFileSync(path.join(root, 'ledger/pipeline.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('a stage passes when its output exists and has no placeholder', () => {
  const root = project();
  const r = gate(root, ['brief']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^PASS brief/);
});

test('planted: a missing output is BLOCKED, a placeholder is FAIL', () => {
  const root = project();
  write(root, 'docs/BRIEF.md', '# Brief\n\nClient: {{CLIENT_NAME}}\n');
  assert.equal(gate(root, ['brief']).status, 1);
  const empty = tempDir();
  write(empty, 'pipeline/stages.json', JSON.stringify(STAGES));
  assert.equal(gate(empty, ['brief']).status, 3);
});

test('planted: a wrong APPROVE hash is refused; the right one is recorded', () => {
  const root = project();
  const wrong = gate(root, ['record', 'brief-approval', 'PASS', 'owner typed: APPROVE 000000000000']);
  assert.equal(wrong.status, 1, wrong.out);
  assert.match(wrong.out, /does not match/);
  const none = gate(root, ['record', 'brief-approval', 'PASS', 'looks good to me']);
  assert.equal(none.status, 1);

  const hash = gate(root, ['hash', 'docs/BRIEF.md']).out.trim();
  assert.match(hash, /^[0-9a-f]{12}$/);
  const ok = gate(root, ['record', 'brief-approval', 'PASS', `owner typed: APPROVE ${hash}`]);
  assert.equal(ok.status, 0, ok.out);
});

test('planted: a PASS cannot be recorded by hand for a stage that has a gate', () => {
  const root = project();
  const r = gate(root, ['record', 'brief', 'PASS', 'trust me']);
  assert.equal(r.status, 1);
  assert.match(r.out, /not a manual stage/);
});

test('planted: build is BLOCKED when the brief changed after approval', () => {
  const root = project();
  const hash = gate(root, ['hash', 'docs/BRIEF.md']).out.trim();
  gate(root, ['record', 'brief-approval', 'PASS', `owner typed: APPROVE ${hash}`]);
  assert.equal(gate(root, ['build']).status, 0);
  write(root, 'docs/BRIEF.md', '# Brief\n\nA bakery wants a fifty-page site.\n');
  const r = gate(root, ['build']);
  assert.equal(r.status, 3, r.out);
  assert.match(r.out, /changed after it was approved/);
});

test('a stage whose condition is not met is SKIPPED', () => {
  const root = project();
  const r = gate(root, ['cms']);
  assert.equal(r.status, 0);
  assert.match(r.out, /^SKIPPED cms/);
});

test('planted: GO for another commit is refused; GO for HEAD is recorded', () => {
  const root = project(gitRepo());
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  const hash = gate(root, ['hash', 'docs/BRIEF.md']).out.trim();
  gate(root, ['record', 'brief-approval', 'PASS', `owner typed: APPROVE ${hash}`]);
  const wrong = gate(root, ['record', 'go', 'PASS', 'owner typed: GO 1234567abcdef']);
  assert.equal(wrong.status, 1, wrong.out);
  const sha = git(root, 'rev-parse', 'HEAD');
  const ok = gate(root, ['record', 'go', 'PASS', `owner typed: GO ${sha.slice(0, 12)}`]);
  assert.equal(ok.status, 0, ok.out);
});

test('the same gate gives the same result under two agents', () => {
  const [a, b] = ['claude-code', 'codex'].map((agent) => {
    const root = project();
    write(root, 'docs/BRIEF.md', '# Brief\n\nTODO\n');
    const first = gate(root, ['brief'], agent);
    write(root, 'docs/BRIEF.md', '# Brief\n\nDone.\n');
    const second = gate(root, ['brief'], agent);
    return { codes: [first.status, second.status], rows: ledger(root).map(({ stage, result, gate: g, evidence, attempt }) => ({ stage, result, g, evidence, attempt })), agents: ledger(root).map((e) => e.agent) };
  });
  assert.deepEqual(a.codes, [1, 0]);
  assert.deepEqual(a.codes, b.codes);
  assert.deepEqual(a.rows, b.rows);
  assert.deepEqual(a.agents, ['claude-code', 'claude-code']);
  assert.deepEqual(b.agents, ['codex', 'codex']);
});

test('planted: an edited or removed ledger line fails verification and blocks new entries', () => {
  const root = project();
  gate(root, ['brief']);
  gate(root, ['cms']);
  gate(root, ['brief']);
  assert.equal(gate(root, ['verify-ledger']).status, 0);
  const file = path.join(root, 'ledger/pipeline.jsonl');
  const original = readFileSync(file, 'utf8');
  const lines = original.trim().split('\n');

  writeFileSync(file, original.replace('"SKIPPED"', '"PASS"'));
  const edited = gate(root, ['verify-ledger']);
  assert.equal(edited.status, 1);
  assert.match(edited.out, /does not match its hash/);
  assert.notEqual(gate(root, ['brief']).status, 0, 'a damaged ledger must not accept a new entry');

  writeFileSync(file, [lines[0], lines[2]].join('\n') + '\n');
  assert.equal(gate(root, ['verify-ledger']).status, 1);
});

test('evidence is redacted before it reaches the ledger', async () => {
  const { fakeToken } = await import('./helpers.mjs');
  const root = project();
  gate(root, ['record', 'brief', 'FAIL', `token was ${fakeToken()}`]);
  const text = readFileSync(path.join(root, 'ledger/pipeline.jsonl'), 'utf8');
  assert.ok(!text.includes(fakeToken()));
  assert.match(text, /redacted:github-token/);
});
