export function dictionaryKeys(dict) {
  return Object.keys(dict).map(Number);
}
export function firstKey(dict) {
  let $temp;
  return ($temp = Object.keys(dict).map(Number)).length ? $temp[0] : null;
}