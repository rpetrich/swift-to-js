export function newEmpty() {
  return {};
}
export function newSingle$key$value$(key, value) {
  return {
    [key]: value
  };
}
export function dictGet$key$(dict, key) {
  return Object.hasOwnProperty.call(dict, key) ? dict[key] : null;
}
export function dictSet$key$value$(dict, key, value) {
  if (value !== null) {
    dict[key] = value;
  } else {
    delete dict[key];
  }
}
export function count(dict) {
  return Object.keys(dict).length;
}
export function allKeys(dict) {
  return Object.keys(dict);
}
export function firstKey(dict) {
  let keys;
  return (keys = Object.keys(dict)).length ? keys[0] : null;
}