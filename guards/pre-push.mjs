#!/usr/bin/env node
// Git pre-push guard. Git passes one line per ref on stdin: <local ref> <local sha> <remote ref> <remote sha>.
// Blocks: any push to a protected branch that already exists on the remote, deleting one, and a forced (non
// fast-forward) push to any branch. Creating a protected branch on a remote that doesn't have it yet is allowed,
// so a new repository can get its first `main`. Production changes arrive by pull request after the owner's GO.
import { readFileSync } from 'node:fs';
import { block, git, protectedBranches, repoRoot } from './lib.mjs';

const ZERO = /^0+$/;
const root = repoRoot(process.cwd()) ?? process.cwd();
const guarded = protectedBranches(root);
const problems = [];

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  // no stdin: nothing is being pushed
}

for (const line of input.split('\n').map((l) => l.trim()).filter(Boolean)) {
  const [, localSha, remoteRef, remoteSha] = line.split(/\s+/);
  if (!remoteRef?.startsWith('refs/heads/')) continue;
  const branch = remoteRef.slice('refs/heads/'.length);
  const deleting = ZERO.test(localSha);
  const creating = ZERO.test(remoteSha);

  if (guarded.has(branch)) {
    if (deleting) problems.push(`deleting "${branch}" is not allowed`);
    else if (!creating) problems.push(`pushing to "${branch}" is not allowed: open a pull request and wait for the owner's GO`);
    continue;
  }
  if (!deleting && !creating && !git(['merge-base', '--is-ancestor', remoteSha, localSha], { cwd: root }).ok) {
    problems.push(`forced push to "${branch}" is not allowed (the remote has commits this push would discard)`);
  }
}

if (problems.length) block('pre-push', [...problems, 'Never bypass this with --no-verify.']);
