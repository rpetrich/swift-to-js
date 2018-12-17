export function sum$array$(array) {
  const result = [0];
  const iterator = {
    array: array,
    index: -1
  };

  for (let element; (element = ++iterator.index < iterator.array.length ? iterator.array[iterator.index] : null) !== null;) {
    result[0] += element;
  }

  return result[0];
}