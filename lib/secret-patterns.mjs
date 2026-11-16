// Secret detection shared by the git hooks, the repository check and the ledger. No dependencies.
// It reports the rule name and the line, never the value.

/** Files that hold secrets by convention. `.env.example` is the only env file allowed. */
const SECRET_PATHS = [
  /(^|\/)\.env(\.[\w.-]+)?$/i,
  /(^|\/)\.dev\.vars(\.[\w.-]+)?$/i,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)(secrets|\.secrets)\//i,
  /(^|\/)id_(rsa|ed25519|ecdsa)$/i,
];

export function isSecretPath(file) {
  const p = file.replace(/\\/g, '/');
  if (/(^|\/)\.env\.example$/i.test(p)) return false;
  return SECRET_PATHS.some((re) => re.test(p));
}

/** Token shapes with a fixed prefix or structure. Each is specific enough to keep false positives rare. */
export const SECRET_RULES = [
  { id: 'private-key', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: 'stripe-live-key', re: /\b[sr]k_live_[A-Za-z0-9]{20,}/ },
  { id: 'assigned-secret', re: /\b(?:api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*["'][A-Za-z0-9+/_=-]{24,}["']/i },
];

/** Findings as { rule, line } for one file's text. */
export function scanText(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    for (const rule of SECRET_RULES) {
      if (rule.re.test(lines[i])) findings.push({ rule: rule.id, line: i + 1 });
    }
  }
  return findings;
}

/** Replaces anything that looks like a secret, so evidence text can be stored safely. */
export function redact(text) {
  let out = String(text);
  for (const rule of SECRET_RULES) out = out.replace(new RegExp(rule.re.source, rule.re.flags + 'g'), `[redacted:${rule.id}]`);
  return out;
}

/** Binary files are skipped: a NUL byte in the first 8 KB. */
export function looksBinary(buffer) {
  return buffer.subarray(0, 8192).includes(0);
}
