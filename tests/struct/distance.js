export function distance$first$second$(first, second) {
  const _x = first.x - second.x;

  const _y = first.y - second.y;

  const delta = {
    x: _x,
    y: _y
  };
  return Math.sqrt(delta.x * delta.x + delta.y * delta.y);
}