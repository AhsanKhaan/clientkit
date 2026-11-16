#!/usr/bin/env node
// The internal estimate, before any site is generated (Admin only).
//
//   node scripts/estimate.mjs <options.json> [model]     model defaults to "subscription"
//
// Writes estimates/estimate.json (committed) and reports/estimate.md, with actual usage beside the estimate when
// estimates/usage.jsonl exists. Prices come from config/price-table.json. AKCK_ROOT sets the project folder.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUsage } from '../packages/estimate/src/budget.mjs';
import { estimate, estimateMarkdown } from '../packages/estimate/src/internal.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(process.env.AKCK_ROOT || process.cwd());
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const first = (...files) => files.find((f) => existsSync(f));

const [optionsFile, model = 'subscription'] = process.argv.slice(2);
if (!optionsFile || !existsSync(optionsFile)) {
  console.error('usage: node scripts/estimate.mjs <options.json> [model]');
  process.exit(2);
}
try {
  const table = json(first(path.join(ROOT, 'config/price-table.json'), path.join(KIT, 'config/price-table.json')));
  const ranges = json(path.join(KIT, 'packages/estimate/data/token-ranges.json'));
  const e = estimate(json(optionsFile), model, table, ranges);
  const usageFile = path.join(ROOT, 'estimates/usage.jsonl');
  const usage = existsSync(usageFile) ? readUsage(readFileSync(usageFile, 'utf8')) : [];
  mkdirSync(path.join(ROOT, 'estimates'), { recursive: true });
  mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  writeFileSync(path.join(ROOT, 'estimates/estimate.json'), JSON.stringify(e, null, 2) + '\n');
  writeFileSync(path.join(ROOT, 'reports/estimate.md'), estimateMarkdown(e, usage));
  const n = (v) => v.toLocaleString('en-US');
  console.log(`estimate: ${n(e.total.in[0] + e.total.out[0])} to ${n(e.total.in[1] + e.total.out[1])} tokens [R], ${e.currency} ${e.total.cost[0]} to ${e.total.cost[1]} with ${e.model}`);
  console.log('wrote estimates/estimate.json and reports/estimate.md');
} catch (err) {
  console.error(`estimate: ${err.message}`);
  process.exit(1);
}
