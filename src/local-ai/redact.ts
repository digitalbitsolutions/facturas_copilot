const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]"],
  [/\b(api[_-]?key|token|password|secret)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]"],
  [/\b(?:sk|ghp|github_pat)_[A-Za-z0-9_\-]{16,}\b/g, "[REDACTED_TOKEN]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (redacted, [pattern, replacement]) => redacted.replace(pattern, replacement),
    value,
  );
}
