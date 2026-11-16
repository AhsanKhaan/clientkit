#!/usr/bin/env node
// Git pre-commit guard. It works under any coding agent because git runs it, not the agent.
// Blocks: a commit on a protected branch (work on a branch, ship through a pull request), a staged secrets file
// (.env, keys), and staged content that looks like a secret. It prints the rule and the line, never the value.
import { isSecretPath, looksBinary, scanText } from '../lib/secret-patterns.mjs';
import { block, git, protectedBranches, repoRoot } from './lib.mjs';

const root = repoRoot(process.cwd());
if (!root) process.exit(0);

const problems = [];

const branch = git(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: root }).out.trim();
const hasCommits = git(['rev-parse', '--verify', '-q', 'HEAD'], { cwd: root }).ok;
if (hasCommits && protectedBranches(root).has(branch)) {
  problems.push(`commits on "${branch}" are not allowed: work on a branch and open a pull request`);
}

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd: root }).out.split('\0').filter(Boolean);
for (const file of staged) {
  if (isSecretPath(file)) {
    problems.push(`${file}: a secrets file must never be committed`);
    continue;
  }
  const blob = git(['show', `:${file}`], { cwd: root, buffer: true });
  if (!blob.ok || looksBinary(blob.out)) continue;
  for (const f of scanText(blob.out.toString('utf8'))) problems.push(`${file}:${f.line}: looks like a secret (${f.rule})`);
}

if (problems.length) block('pre-commit', [...problems, 'Remove the secret and refer to it by name. Never bypass this with --no-verify.']);
