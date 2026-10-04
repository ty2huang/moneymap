/** Bound upstream requests and cancel them when their authorization lease is lost. */
export function boundedFetch(scope?: AbortSignal): typeof fetch {
  return (input, init) => {
    const requestSignal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signals = [AbortSignal.timeout(30_000)];
    if (scope) signals.push(scope);
    if (requestSignal) signals.push(requestSignal);
    return fetch(input, { ...init, signal: AbortSignal.any(signals) });
  };
}
