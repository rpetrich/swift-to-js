export function negate$number$(T, number) {
  return T["SignedNumeric.-"](number);
}
export function negate$integer$(integer) {
  return negate$number$(Int$Type, integer);
}