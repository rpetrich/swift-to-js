export function optional_from$num$(num) {
  if (num > 0) {
    return true;
  } else {
    if (num === 0) {
      return false;
    }
  }

  return null;
}