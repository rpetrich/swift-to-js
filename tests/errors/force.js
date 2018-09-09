export function attempt$shouldThrow$(shouldThrow) {
  if (shouldThrow) {
    throw 0;
  }

  return true;
}
export function force$shouldThrow$(shouldThrow) {
  return attempt$shouldThrow$(shouldThrow);
}