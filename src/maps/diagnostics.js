/** Publish fixed diagnostics only: upstream errors may contain credential URLs. */
export function classifyMapFailure(error) {
  const status = Number(error?.statusCode ?? error?.status);
  const code =
    status === 401
      ? 'AUTHENTICATION'
      : status === 403
        ? 'ACCESS_DENIED'
        : status === 429
          ? 'QUOTA_OR_RATE_LIMIT'
          : status >= 500
            ? 'PROVIDER_OUTAGE'
            : status === 400
              ? 'INVALID_REQUEST'
              : error?.name === 'AbortError'
                ? 'CANCELLED'
                : 'NETWORK_OR_PROVIDER';
  return {
    code,
    httpStatus:
      Number.isInteger(status) && status >= 400 && status <= 599
        ? status
        : null,
  };
}

export function safeMapError(error) {
  const diagnostic = classifyMapFailure(error);
  const safe = new Error(
    'Map imagery is temporarily unavailable. Try another map style.',
  );
  safe.code = diagnostic.code;
  safe.statusCode = diagnostic.httpStatus;
  return safe;
}
