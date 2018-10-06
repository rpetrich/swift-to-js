export function attempt$shouldThrow$(shouldThrow) {
  if (shouldThrow) {
    throw 0;
  }
}
export function recover$shouldThrow$(shouldThrow) {
  attempt$shouldThrow$(shouldThrow);
  return 1;
}