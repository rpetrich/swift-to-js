export function distanceToZero$ofPoint$(point) {
  const x = point[0],
        y = point[1];
  return Math.sqrt(x * x + y * y);
}