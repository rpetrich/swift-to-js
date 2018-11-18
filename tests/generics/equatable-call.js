export function equal$lhs$rhs$(T, lhs, rhs) {
  return T.Equatable.$equals$(T, lhs, rhs);
}
export function match$lhs$rhs$(T, lhs, rhs) {
  return T.Equatable.$match$(T, lhs, rhs);
}
export function matchInts$lhs$rhs$(lhs, rhs) {
  return lhs === rhs;
}
export function matchOptionals$lhs$rhs$(lhs, rhs) {
  return lhs === rhs;
}