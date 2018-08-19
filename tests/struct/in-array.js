export function makeSizes$w1$h1$w2$h2$(w1, h1, w2, h2) {
  return [{
    width: w1,
    height: h1
  }, {
    width: w2,
    height: h2
  }];
}
export function countSizes$sizes$(sizes) {
  return sizes.length;
}
export function copySizes$sizes$(sizes) {
  return sizes.map(function (value) {
    return {
      width: value.width,
      height: value.height
    };
  });
}