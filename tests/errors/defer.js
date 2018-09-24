export function attempt$shouldThrow$(shouldThrow) {
  if (shouldThrow) {
    throw 0;
  }

  return true;
}
export function defers$shouldThrow$(shouldThrow) {
  try {
    processing = true;
    let $try;

    try {
      $try = attempt$shouldThrow$(shouldThrow);
    } catch (e) {
      $try = null;
    }

    return $try;
  } finally {
    processing = false;
  }
}
let processing = false;