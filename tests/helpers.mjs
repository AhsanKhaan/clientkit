// Test helpers. Every test works in a temporary folder and never touches the real ledger.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function tempDir(prefix = 'akck-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

export function write(root, rel, text) {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
  return full;
}

/** Runs a kit script with node. Returns { status, out } where out is stdout and stderr together. */
export function run(script, args = [], { cwd = KIT, env = {}, input } = {}) {
  const r = spawnSync(process.execPath, [path.join(KIT, script), ...args], { cwd, input, encoding: 'utf8', env: { ...process.env, CI: '1', ...env } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

export function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

export function gitRepo() {
  const dir = tempDir('akck-git-');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

/** A fake token assembled at run time, so no file in the repository contains one. */
export const fakeToken = () => ['gh', 'p_', 'A1b2C3d4E5'.repeat(4)].join('');
