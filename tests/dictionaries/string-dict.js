export function newEmpty() {
  return {};
}
export function newSingle$key$value$(key, value) {
  return {};
}
export function dictGet$key$(dict, key) {
  return Object.hasOwnProperty.call(dict, key) ? dict[key] : null;
}
export function dictSet$key$value$(dict, key, value) {
  value !== null ? dict[key] = value : delete dict[key];
}
export function count(dict) {
  return Object.keys(dict).length;
}
export function allKeys(dict) {
  return Object.keys(dict);
}
export function firstKey(dict) {
  let $temp;
  return ($temp = Object.keys(dict)).length ? $temp[0] : null;
}