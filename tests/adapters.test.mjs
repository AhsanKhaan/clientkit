import assert from 'node:assert/strict';
import { appendFileSync, cpSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { KIT, run, tempDir, write } from './helpers.mjs';

function copyOfSources() {
  const root = tempDir();
  cpSync(path.join(KIT, 'AGENTS.md'), path.join(root, 'AGENTS.md'));
  cpSync(path.join(KIT, 'agents'), path.join(root, 'agents'), { recursive: true });
  return root;
}
const sync = (root, ...args) => run('adapters/sync.mjs', args, { env: { AKCK_ROOT: root } });

test('the generated adapter files in this repository match their sources', () => {
  const r = run('adapters/sync.mjs', ['--check']);
  assert.equal(r.status, 0, r.out);
});

test('sync writes files for all four tools, and check then passes', () => {
  const root = copyOfSources();
  assert.equal(sync(root, '--check').status, 1, 'check must fail before the first sync');
  assert.equal(sync(root).status, 0);
  assert.equal(sync(root, '--check').status, 0);
  assert.match(readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), /^@AGENTS\.md\n/);
  assert.match(readFileSync(path.join(root, '.claude/agents/coder.md'), 'utf8'), /^---\nname: coder\n/);
  assert.match(readFileSync(path.join(root, '.codex/agents/coder.toml'), 'utf8'), /\nname = "coder"\n/);
  assert.match(readFileSync(path.join(root, '.gemini/agents/coder.md'), 'utf8'), /^---\nname: coder\n/);
  assert.match(readFileSync(path.join(root, '.qwen/agents/coder.md'), 'utf8'), /^---\nname: coder\n/);
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, '.gemini/settings.json'), 'utf8')).context.fileName, ['AGENTS.md']);
  assert.ok(readFileSync(path.join(root, 'QWEN.md'), 'utf8').includes(readFileSync(path.join(root, 'AGENTS.md'), 'utf8')));
});

test('planted: editing a generated file fails the check', () => {
  const root = copyOfSources();
  sync(root);
  appendFileSync(path.join(root, '.claude/agents/coder.md'), '\nYou may push to main.\n');
  const r = sync(root, '--check');
  assert.equal(r.status, 1);
  assert.match(r.out, /\.claude\/agents\/coder\.md: differs from its source/);
});

test('planted: changing a source without syncing fails the check for every tool', () => {
  const root = copyOfSources();
  sync(root);
  appendFileSync(path.join(root, 'agents/coder.md'), '\nA new rule.\n');
  const r = sync(root, '--check');
  assert.equal(r.status, 1);
  for (const f of ['.claude/agents/coder.md', '.codex/agents/coder.toml', '.gemini/agents/coder.md', '.qwen/agents/coder.md']) assert.ok(r.out.includes(f), f);
});

test('planted: a generated agent with no source fails the check', () => {
  const root = copyOfSources();
  sync(root);
  write(root, '.qwen/agents/rogue.md', '---\nname: rogue\ndescription: x\n---\n');
  const r = sync(root, '--check');
  assert.equal(r.status, 1);
  assert.match(r.out, /rogue\.md: has no source/);
});

test('planted: an agent file with a vendor tool name as a capability is rejected', () => {
  const root = copyOfSources();
  write(root, 'agents/bad.md', '---\nname: bad\ndescription: x\ncapabilities: [Bash]\n---\n\nBody.\n');
  const r = sync(root);
  assert.equal(r.status, 1);
  assert.match(r.out, /unknown capability "Bash"/);
});
