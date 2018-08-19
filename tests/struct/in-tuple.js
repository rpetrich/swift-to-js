export function makeSizes$w1$h1$w2$h2$(w1, h1, w2, h2) {
  return [{
    width: w1,
    height: h1
  }, {
    width: w2,
    height: h2
  }];
}
export function sumSizes$sizes$(sizes) {
  let w = sizes[0].width + sizes[1].height;
  let h = sizes[0].height + sizes[1].height;
  return {
    width: w,
    height: h
  };
}
export function copySizes$sizes$(sizes) {
  return [{
    width: sizes[0].width,
    height: sizes[0].height
  }, {
    width: sizes[1].width,
    height: sizes[1].height
  }];
}