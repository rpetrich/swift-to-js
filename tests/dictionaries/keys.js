export function dictionaryKeys(dict) {
  return Object.keys(dict);
}
export function firstKey(dict) {
  let $temp;
  return ($temp = Object.keys(dict)).length ? Number($temp[0]) : null;
}