export function pointOffsetFromOrigin$x$y$(x, y) {
  const _x = origin.x;
  const _y = origin.y;
  const point0 = new Point();
  point0.x = _x;
  point0.y = _y;
  const result = point0;
  result.x = result.x + x;
  result.y = result.y + y;
  return result;
}
export class Point {}
const point = new Point();
point.x = 0;
point.y = 0;
const origin = point;