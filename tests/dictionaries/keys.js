export function dictionaryKeys(dict) {
  return Object.keys(dict);
}
export function firstKey(dict) {
  let keys;
  return (keys = Object.keys(dict)).length ? Number(keys[0]) : null;
}