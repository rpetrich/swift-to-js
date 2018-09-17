export function pointOffsetFromOrigin$x$y$(x, y) {
  const _x0 = origin.x;
  const _y0 = origin.y;

  const result = function () {
    const point0 = new Point();
    point0.x = _x;
    point0.y = _y;
    return point0;
  }();

  result.x += x;
  result.y += y;
  return result;
}
export class Point {}
const _x = 0;
const _y = 0;

const origin = function () {
  const point = new Point();
  point.x = _x;
  point.y = _y;
  return point;
}();