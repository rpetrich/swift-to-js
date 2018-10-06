export function swapInts$a$b$(a, b) {
  const temp = a[0];
  a[0] = b[0];
  b[0] = temp;
}
export function swapInts() {
  const a = [0];
  const b = [1];
  const temp = a[0];
  a[0] = b[0];
  b[0] = temp;
  return a[0];
}