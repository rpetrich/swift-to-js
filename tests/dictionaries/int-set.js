export function dictSet$key$value$(dict, key, value) {
  if (value !== null) {
    dict[key] = value;
  } else {
    delete dict[key];
  }
}