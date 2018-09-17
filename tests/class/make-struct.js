export function makeSize$w$h$(w, h) {
  return function () {
    const size = new Size();
    size.width = w;
    size.height = h;
    return size;
  }();
}
export class Size {}