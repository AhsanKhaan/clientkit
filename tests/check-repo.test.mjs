import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeToken, gitRepo, run, write } from './helpers.mjs';

const NPMRC = 'ignore-scripts=true\nsave-exact=true\nmin-release-age=7\n';
const check = (root) => run('scripts/check-repo.mjs', [], { cwd: root, env: { AKCK_ROOT: root } });

function repo(pkg = { name: 'x', scripts: {} }, npmrc = NPMRC) {
  const dir = gitRepo();
  write(dir, 'package.json', JSON.stringify(pkg));
  write(dir, '.npmrc', npmrc);
  return dir;
}

test('a clean repository passes', () => {
  const r = check(repo());
  assert.equal(r.status, 0, r.out);
});

test('planted: a secret in a file fails, and its value is not printed', () => {
  const dir = repo();
  write(dir, 'src/a.js', `const k = "${fakeToken()}";\n`);
  const r = check(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /src\/a\.js:1: looks like a secret/);
  assert.ok(!r.out.includes(fakeToken()));
});

test('planted: a missing .npmrc rule fails', () => {
  const r = check(repo(undefined, 'save-exact=true\nmin-release-age=7\n'));
  assert.equal(r.status, 1);
  assert.match(r.out, /"ignore-scripts=true" is missing/);
});

test('planted: a version range, a lifecycle script and a missing lockfile fail', () => {
  const r = check(repo({ name: 'x', scripts: { postinstall: 'node x.js' }, dependencies: { zod: '^4.6.7' } }));
  assert.equal(r.status, 1);
  assert.match(r.out, /zod "\^4\.6\.7" is not an exact version/);
  assert.match(r.out, /"postinstall" lifecycle script/);
  assert.match(r.out, /package-lock\.json is missing/);
});
