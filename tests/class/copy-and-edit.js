export function pointOffsetFromOrigin$x$y$(x, y) {
  const _x0 = origin.x;
  const _y0 = origin.y;
  const point0 = new Point();
  point0.x = _x;
  point0.y = _y;
  const result = point0;
  result.x += x;
  result.y += y;
  return result;
}
export class Point {}
const _x = 0;
const _y = 0;
const point = new Point();
point.x = _x;
point.y = _y;
const origin = point;