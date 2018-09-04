function $$arrayBoundsFailed() {
  throw new RangeError("Array index out of range");
}

export function arrayGet$array$index$(array, index) {
  return array[array.length > index && index >= 0 ? index : $$arrayBoundsFailed()];
}