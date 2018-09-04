export function distanceToZero$ofPoint$(point) {
  let x;
  let y;
  x = point[0];
  y = point[1];
  return Math.sqrt(x * x + y * y);
}