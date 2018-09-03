export function dictGet$key$(dict, key) {
  return Object.hasOwnProperty.call(dict, key) ? dict[key] : null;
}
export function doubleDictGet$key$(dict, key) {
  return Object.hasOwnProperty.call(dict, key) ? [dict[key]] : [];
}