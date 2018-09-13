let origin;
export function pointOffsetFromOrigin$x$y$(x, y) {
  let result;
  result = {
    x: origin.x,
    y: origin.y
  };
  result.x += x;
  result.y += y;
  return result;
}
let x = 0;
let y = 0;
origin = {
  x: 0,
  y: 0
};