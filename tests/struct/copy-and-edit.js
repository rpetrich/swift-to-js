export function pointOffsetFromOrigin$x$y$(x, y) {
  let result = {
    x: origin.x,
    y: origin.y
  };
  result.x += x;
  result.y += y;
  return result;
}
let origin = {
  x: 0,
  y: 0
};