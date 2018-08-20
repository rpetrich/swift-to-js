export function dictSet$key$value$(dict, key, value) {
  value !== null ? dict[key] = value : delete dict[key];
}