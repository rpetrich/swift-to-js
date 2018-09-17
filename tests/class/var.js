export class Point {}
export let origin = function () {
  const point = new Point();
  point.x = 0;
  point.y = 0;
  return point;
}();