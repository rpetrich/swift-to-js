export function distance$first$second$(first, second) {
  const _x = first.x - second.x;

  const _y = first.y - second.y;

  const point = new Point();
  point.x = _x;
  point.y = _y;
  const delta = point;
  return Math.sqrt(delta.x * delta.x + delta.y * delta.y);
}
export class Point {}