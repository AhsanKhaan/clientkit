import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeToken, git, gitRepo, run, write } from './helpers.mjs';

const ZERO = '0'.repeat(40);
const preCommit = (cwd) => run('guards/pre-commit.mjs', [], { cwd });
const prePush = (cwd, lines) => run('guards/pre-push.mjs', ['origin', 'url'], { cwd, input: lines.join('\n') + '\n' });

function repoOnBranch() {
  const dir = gitRepo();
  write(dir, 'README.md', '# test\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  git(dir, 'switch', '-q', '-c', 'work');
  return dir;
}

test('a clean staged file passes the pre-commit guard', () => {
  const dir = repoOnBranch();
  write(dir, 'notes.md', 'Set GITHUB_TOKEN in your shell profile.\n');
  git(dir, 'add', '-A');
  assert.equal(preCommit(dir).status, 0);
});

test('planted: a staged secret is blocked, and its value is not printed', () => {
  const dir = repoOnBranch();
  write(dir, 'config.js', `export const token = "${fakeToken()}";\n`);
  git(dir, 'add', '-A');
  const r = preCommit(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /config\.js:1: looks like a secret \(github-token\)/);
  assert.ok(!r.out.includes(fakeToken()));
});

test('planted: a staged .env file is blocked; .env.example is allowed', () => {
  const dir = repoOnBranch();
  write(dir, '.env.example', 'API_KEY=\n');
  git(dir, 'add', '-A');
  assert.equal(preCommit(dir).status, 0);
  write(dir, '.env', 'API_KEY=x\n');
  git(dir, 'add', '-A', '-f');
  const r = preCommit(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /\.env: a secrets file/);
});

test('planted: a commit on main is blocked once main has a commit', () => {
  const dir = repoOnBranch();
  git(dir, 'switch', '-q', 'main');
  write(dir, 'a.txt', 'a\n');
  git(dir, 'add', '-A');
  const r = preCommit(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /commits on "main" are not allowed/);
});

test('planted: a push to main is blocked; a push to a work branch passes', () => {
  const dir = repoOnBranch();
  const sha = git(dir, 'rev-parse', 'HEAD');
  const blocked = prePush(dir, [`refs/heads/work ${sha} refs/heads/main ${sha}`]);
  assert.equal(blocked.status, 1, blocked.out);
  assert.match(blocked.out, /pushing to "main" is not allowed/);
  assert.equal(prePush(dir, [`refs/heads/work ${sha} refs/heads/work ${ZERO}`]).status, 0);
});

test('the first main on an empty remote is allowed; deleting main is not', () => {
  const dir = repoOnBranch();
  const sha = git(dir, 'rev-parse', 'HEAD');
  assert.equal(prePush(dir, [`refs/heads/main ${sha} refs/heads/main ${ZERO}`]).status, 0);
  assert.equal(prePush(dir, [`(delete) ${ZERO} refs/heads/main ${sha}`]).status, 1);
});

test('planted: a forced push to a work branch is blocked; a fast-forward passes', () => {
  const dir = repoOnBranch();
  const base = git(dir, 'rev-parse', 'HEAD');
  write(dir, 'a.txt', 'a\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'a');
  const a = git(dir, 'rev-parse', 'HEAD');
  assert.equal(prePush(dir, [`refs/heads/work ${a} refs/heads/work ${base}`]).status, 0);

  git(dir, 'reset', '-q', '--hard', base);
  write(dir, 'b.txt', 'b\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'b');
  const b = git(dir, 'rev-parse', 'HEAD');
  const r = prePush(dir, [`refs/heads/work ${b} refs/heads/work ${a}`]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /forced push/);
});

test('a production branch named in kit.config.json is protected too', () => {
  const dir = repoOnBranch();
  write(dir, 'kit.config.json', JSON.stringify({ hosting: { productionBranch: 'live' } }));
  const sha = git(dir, 'rev-parse', 'HEAD');
  assert.equal(prePush(dir, [`refs/heads/work ${sha} refs/heads/live ${sha}`]).status, 1);
});
