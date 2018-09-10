export function attempt$shouldSucceed$(shouldSucceed) {
  if (!shouldSucceed) {
    debugger;
    throw new Error("Should succeed", "", 0);
  }

  return shouldSucceed;
}