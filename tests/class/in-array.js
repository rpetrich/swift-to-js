export function makeSizes$w1$h1$w2$h2$(w1, h1, w2, h2) {
  return [function () {
    const size = new Size();
    size.width = w1;
    size.height = h1;
    return size;
  }(), function () {
    const size0 = new Size();
    size0.width = w2;
    size0.height = h2;
    return size0;
  }()];
}
export function countSizes$sizes$(sizes) {
  return sizes.length;
}
export function copySizes$sizes$(sizes) {
  return sizes.slice();
}
export class Size {}