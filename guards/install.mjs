#!/usr/bin/env node
// Turns the git hooks on for this clone: `npm run hooks:install`. Run it once after cloning.
// It only sets core.hooksPath to .githooks in this repository's own git config.
import { git, repoRoot } from './lib.mjs';

const root = repoRoot(process.cwd());
if (!root) {
  console.error('hooks:install: not inside a git repository');
  process.exit(1);
}
const r = git(['config', '--local', 'core.hooksPath', '.githooks'], { cwd: root });
if (!r.ok) {
  console.error('hooks:install: could not set core.hooksPath');
  process.exit(1);
}
console.log('hooks:install: git hooks are on (core.hooksPath = .githooks)');
