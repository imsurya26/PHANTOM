/** Background network work follows visibility and connection quality. */
export function periodicPollPolicy({
  hidden = false,
  online = true,
  connection,
} = {}) {
  return {
    paused: hidden || !online,
    multiplier:
      connection?.saveData === true ||
      ['slow-2g', '2g', '3g'].includes(connection?.effectiveType)
        ? 4
        : 1,
  };
}

/** One bounded gate per existing interval; no extra timers or listeners. */
export function createPeriodicPollGate(intervalMs, now = Date.now) {
  let lastPoll = now();
  return (policy = periodicPollPolicy()) => {
    if (policy.paused) return false;
    const current = now();
    if (
      policy.multiplier > 1 &&
      current - lastPoll < intervalMs * policy.multiplier
    )
      return false;
    lastPoll = current;
    return true;
  };
}
