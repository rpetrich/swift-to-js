export function checkEqual$singleOptional$with$(singleOptional, other) {
  return singleOptional === other;
}
export function checkEqual$doubleOptional$with$(doubleOptional, other) {
  return doubleOptional.length === 0 ? other.length === 0 : other.length !== 0 && doubleOptional[0] === other[0];
}
export function checkNotEqual$singleOptional$with$(singleOptional, other) {
  return singleOptional !== other;
}
export function checkNotEqual$doubleOptional$with$(doubleOptional, other) {
  return doubleOptional.length === 0 ? other.length !== 0 : other.length === 0 || doubleOptional[0] !== other[0];
}