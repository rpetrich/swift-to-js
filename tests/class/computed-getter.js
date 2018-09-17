export function isEmpty$size$(size) {
  return size.isEmpty;
}
export function isEmptyInlined$size$(size) {
  return size.width === 0 && size.height === 0;
}
export class Size {
  get isEmpty() {
    return this.width === 0 && this.height === 0;
  }

}