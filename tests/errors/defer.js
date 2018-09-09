export function attempt$shouldThrow$(shouldThrow) {
  if (shouldThrow) {
    throw 0;
  }

  return true;
}
let processing = false;
export function defers$shouldThrow$(shouldThrow) {
  let $try;

  try {
    processing = true;

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