export function attempt$shouldThrow$(shouldThrow) {
  if (shouldThrow) {
    throw 0;
  }

  return true;
}
export function recover$shouldThrow$(shouldThrow) {
  let $try;

  try {
    $try = attempt$shouldThrow$(shouldThrow);
  } catch (e) {
    $try = null;
  }

  return $try;
}