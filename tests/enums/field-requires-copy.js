export function makeCopy$ofPosition$(position) {
  let copy;
  copy = position[0] === 2 ? [2, {
    x: position[1].x,
    y: position[1].y
  }, position[2]] : position[0] === 1 ? [1, {
    x: position[1].x,
    y: position[1].y
  }] : position.slice();
  return copy[0] === 2 ? [2, {
    x: copy[1].x,
    y: copy[1].y
  }, copy[2]] : copy[0] === 1 ? [1, {
    x: copy[1].x,
    y: copy[1].y
  }] : copy.slice();
}