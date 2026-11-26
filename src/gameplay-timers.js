/** Return whole seconds remaining for a monotonic deadline. */
export function remainingSeconds(deadline, now) {
  const end = Number(deadline);
  const current = Number(now);
  if (!Number.isFinite(end) || !Number.isFinite(current)) {
    throw new TypeError('The timer deadline and current time must be finite numbers.');
  }
  return Math.max(0, Math.ceil((end - current) / 1000));
}
