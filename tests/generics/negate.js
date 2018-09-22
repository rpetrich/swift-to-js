export function negate$number$(T, number) {
  return T.$minus$(number);
}
const $Int$SignedNumeric = {
  $minus$(value) {
    return -value;
  }

};
export function negate$integer$(integer) {
  return negate$number$($Int$SignedNumeric, integer);
}
const $Double$SignedNumeric = {
  $minus$(value) {
    return -value;
  }

};
export function negate$double$(double) {
  return negate$number$($Double$SignedNumeric, double);
}
export function negateDirect$double$(double) {
  return -double;
}