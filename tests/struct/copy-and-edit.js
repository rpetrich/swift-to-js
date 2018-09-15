export function pointOffsetFromOrigin$x$y$(x, y) {
  let result = {
    x: origin.x,
    y: origin.y
  };
  result.x += x;
  result.y += y;
  return result;
}
const x = 0;
const y = 0;
let origin = {
  x: 0,
  y: 0
};