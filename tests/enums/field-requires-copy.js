function Position$copy(source) {
  return source[0] === 2 ? [2, {
    x: source[1].x,
    y: source[1].y
  }, source[2]] : source[0] === 1 ? [1, {
    x: source[1].x,
    y: source[1].y
  }] : source.slice();
}

export function makeCopy$ofPosition$(position) {
  let copy;
  copy = Position$copy(position);
  return copy;
}
export function makeCopyDirect$ofPosition$(position) {
  return Position$copy(position);
}