export function attempt$shouldSucceed$(shouldSucceed) {
  if (!shouldSucceed) {
    throw 0;
  }
}