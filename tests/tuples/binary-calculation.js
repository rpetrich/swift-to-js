var distanceToZero$ofPoint$ = function (point) {
  var x, y;
  x = point[0], y = point[1];
  return [Math.sqrt(x * x + y * y)];
};

export { distanceToZero$ofPoint$ };