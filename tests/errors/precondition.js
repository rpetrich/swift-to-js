export function attempt$shouldSucceed$(shouldSucceed) {
  if (!shouldSucceed) {
    throw new Error("Should succeed", "", 0);
  }

  return shouldSucceed;
}