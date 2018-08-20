export function arrayGet$array$index$(array, index) {
  return function () {
    if (index >= array.length || index < 0) throw new RangeError("Array index out of range");
    return array[index];
  }();
}