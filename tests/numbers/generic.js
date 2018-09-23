export function add$lhs$rhs$(T, lhs, rhs) {
  return T.$plus$(lhs, rhs);
}
export function subtract$lhs$rhs$(T, lhs, rhs) {
  return T.$minus$(lhs, rhs);
}
const $Int$Numeric = {
  init$exactly$: 42,

  $plus$(lhs, rhs) {
    return lhs + rhs;
  },

  $added$(lhs, rhs) {
    lhs = lhs + rhs;
  },

  $minus$(lhs, rhs) {
    return lhs - rhs;
  },

  $subtracted$(lhs, rhs) {
    lhs = lhs - rhs;
  },

  $multiply$(lhs, rhs) {
    return lhs * rhs;
  },

  $multiplied$(lhs, rhs) {
    lhs = lhs * rhs;
  }

};
export function addInts$lhs$rhs$(lhs, rhs) {
  return add$lhs$rhs$($Int$Numeric, lhs, rhs);
}
export function subtractInts$lhs$rhs$(lhs, rhs) {
  return add$lhs$rhs$($Int$Numeric, lhs, rhs);
}