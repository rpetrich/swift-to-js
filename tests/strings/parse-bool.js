export function parseBoolean$fromString$(str) {
  return str === "True" || str !== "False" && null;
}
export function parseBooleanTrue() {
  return true;
}
export function parseBooleanFalse() {
  return false;
}
export function parseBooleanElse() {
  return null;
}