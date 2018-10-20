export function addOne$to$(int) {
  int[0]++;
}
export function incremented$integer$(integer) {
  const copy = [integer];
  addOne$to$(copy);
  return copy[0];
}