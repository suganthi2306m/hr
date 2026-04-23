/** True when a failed request may succeed if retried (no HTTP response body). */
export function isTransientNetworkError(error) {
  if (!error || error.response) return false;
  const c = String(error.code || '');
  return (
    c === 'ECONNABORTED' ||
    c === 'ERR_NETWORK' ||
    c === 'ETIMEDOUT' ||
    c === 'ECONNRESET' ||
    c === 'ENOTFOUND' ||
    c === 'EAI_AGAIN'
  );
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
