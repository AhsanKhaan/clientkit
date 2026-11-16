#!/usr/bin/env node
// Repository checks that need no install (`npm run check:repo`). CI runs it first.
// - no secrets file and no secret-looking content in tracked or staged files;
// - the supply-chain settings in .npmrc are present;
// - every dependency version is exact, and package.json has no lifecycle hooks.
// AKCK_ROOT sets the folder to check (default: the current folder).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isSecretPath, looksBinary, scanText } from '../lib/secret-patterns.mjs';

const ROOT = path.resolve(process.env.AKCK_ROOT || process.cwd());
const problems = [];
const warnings = [];

const ls = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const files = ls.status === 0 ? ls.stdout.split('\0').filter(Boolean) : [];
if (ls.status !== 0) problems.push('not a git repository, so tracked files could not be listed');

for (const file of files) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) continue;
  if (isSecretPath(file)) {
    problems.push(`${file}: a secrets file must not be in the repository`);
    continue;
  }
  const buf = readFileSync(full);
  if (looksBinary(buf)) continue;
  for (const f of scanText(buf.toString('utf8'))) problems.push(`${file}:${f.line}: looks like a secret (${f.rule})`);
}

const npmrc = existsSync(path.join(ROOT, '.npmrc')) ? readFileSync(path.join(ROOT, '.npmrc'), 'utf8') : '';
for (const rule of ['ignore-scripts=true', 'save-exact=true', 'min-release-age=7']) {
  if (!npmrc.split(/\r?\n/).some((l) => l.trim() === rule)) problems.push(`.npmrc: "${rule}" is missing`);
}

const pkgFile = path.join(ROOT, 'package.json');
if (existsSync(pkgFile)) {
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  let count = 0;
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(pkg[group] ?? {})) {
      count += 1;
      if (!/^(npm:[@\w./-]+@)?\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) problems.push(`package.json: ${name} "${version}" is not an exact version`);
    }
  }
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']) {
    if (pkg.scripts?.[hook]) problems.push(`package.json: the "${hook}" lifecycle script is not allowed`);
  }
  if (count > 0 && !existsSync(path.join(ROOT, 'package-lock.json'))) problems.push('package-lock.json is missing');
} else problems.push('package.json is missing');

if (!process.env.CI) {
  const hooks = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: ROOT, encoding: 'utf8' });
  if (hooks.stdout.trim() !== '.githooks') warnings.push('git hooks are off in this clone: run `npm run hooks:install`');
}

for (const w of warnings) console.log(`check:repo: warning: ${w}`);
if (problems.length) {
  console.error(`check:repo: FAIL\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`check:repo: PASS (${files.length} files)`);
