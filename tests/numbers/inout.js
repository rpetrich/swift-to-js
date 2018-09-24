export function addOne$to$(int) {
  int += 1;
}
export function incremented$integer$(integer) {
  let copy = integer;
  addOne$to$(copy);
  return copy;
}