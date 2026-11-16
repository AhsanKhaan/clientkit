// Shared by the git hooks. No dependencies.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function git(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: opts.buffer ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: opts.cwd });
  return { ok: r.status === 0, out: r.stdout };
}

export function repoRoot(cwd) {
  const r = git(['rev-parse', '--show-toplevel'], { cwd });
  return r.ok ? r.out.trim() : null;
}

/** `main` plus the production branch named in kit.config.json. */
export function protectedBranches(root) {
  const set = new Set(['main']);
  try {
    const f = path.join(root, 'kit.config.json');
    if (existsSync(f)) {
      const branch = JSON.parse(readFileSync(f, 'utf8'))?.hosting?.productionBranch;
      if (branch) set.add(String(branch));
    }
  } catch {
    // an unreadable config protects main only
  }
  return set;
}

export function block(hook, lines) {
  process.stderr.write(`${hook}: BLOCKED\n${lines.map((l) => `  ${l}`).join('\n')}\n`);
  process.exit(1);
}
