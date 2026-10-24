const PRIVATE_FIELD =
  /authorization|cookie|session|secret|password|token|api[-_]?key|map[-_]?key/i;

/** Safe structured logging. Never log raw error objects or provider URLs. */
export function redact(value, secrets = [], depth = 0) {
  if (depth > 8) return '[TRUNCATED]';
  if (typeof value === 'string') {
    let safe = value
      .replace(
        /\b(?:authorization|(?:set-)?cookie)\s*:[^\r\n]*/gi,
        '[HEADER REDACTED]',
      )
      .replace(/https?:\/\/[^\s<>"']+/gi, '[URL REDACTED]')
      .replace(/\b(?:Bearer|Token|Basic)\s+\S+/gi, '[AUTH REDACTED]')
      .replace(
        /((?:api[-_]?key|map[-_]?key|token|password|secret|cookie|authorization|session)\s*[=:]\s*)("[^"]*"|'[^']*')/gi,
        '$1[REDACTED]',
      )
      .replace(
        /((?:api[-_]?key|map[-_]?key|token|password|secret|cookie|authorization|session)\s*[=:]\s*)[^\s,;&]+/gi,
        '$1[REDACTED]',
      );
    for (const secret of secrets) {
      if (typeof secret !== 'string' || !secret) continue;
      for (const form of [secret, encodeURIComponent(secret)])
        safe = safe.split(form).join('[REDACTED]');
    }
    return safe.slice(0, 2048);
  }
  if (value instanceof Error) return { error: 'Operation failed' };
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => redact(item, secrets, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [
          key,
          PRIVATE_FIELD.test(key)
            ? '[REDACTED]'
            : redact(item, secrets, depth + 1),
        ]),
    );
  return value;
}
