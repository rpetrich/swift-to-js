function distanceToZero$ofPoint$(point) {
  var x, y;
  x = point[0], y = point[1];
  return [Math.sqrt(x * x + y * y)];
}