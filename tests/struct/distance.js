export function distance$first$second$(first, second) {
  let delta;

  let _x = first.x - second.x;

  let _y = first.y - second.y;

  delta = {
    x: _x,
    y: _y
  };
  return Math.sqrt(delta.x * delta.x + delta.y * delta.y);
}