export function dictionaryKeys(dict) {
  return Object.keys(dict);
}
export function firstKey(dict) {
  const keys = Object.keys(dict);
  return keys.length ? Number(keys[0]) : null;
}