export function attempt$shouldThrow$(shouldThrow) {
  if (shouldThrow) {
    throw 0;
  }

  return true;
}
export function defers$shouldThrow$(shouldThrow) {
  try {
    processing[0] = true;
    let $try;

    try {
      $try = attempt$shouldThrow$(shouldThrow);
    } catch (e) {
      $try = null;
    }

    return $try;
  } finally {
    processing[0] = false;
  }
}
const processing = [false];