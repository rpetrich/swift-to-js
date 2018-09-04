function $$arrayBoundsFailed() {
  throw new RangeError("Array index out of range");
}

export function arraySet$array$index$value$(array, index, value) {
  array[array.length >= index && index >= 0 ? index : $$arrayBoundsFailed()] = value;
}