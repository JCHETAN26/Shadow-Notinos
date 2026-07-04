/**
 * A tiny min-interval scheduler. Notion enforces ~3 requests/second per
 * integration; bursts (applying a multi-block patch, or several runs at once)
 * can exceed that and get 429'd. This spaces call *starts* at least
 * `1000/ratePerSec` ms apart, process-wide, so we stay under the limit
 * proactively instead of only reacting to 429s.
 */
export interface RateLimiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

export function createRateLimiter(ratePerSec: number): RateLimiter {
  const minIntervalMs = ratePerSec > 0 ? 1000 / ratePerSec : 0;
  // A serialized gate: each call waits its turn, spaced minIntervalMs apart.
  let gate: Promise<void> = Promise.resolve();
  let lastStart = 0;

  function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const ready = gate.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, lastStart + minIntervalMs - now);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastStart = Date.now();
    });
    // Advance the gate regardless of whether fn succeeds, so one failure
    // doesn't wedge the queue.
    gate = ready.then(
      () => undefined,
      () => undefined,
    );
    return ready.then(() => fn());
  }

  return { schedule };
}
