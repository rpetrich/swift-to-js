function $$arrayBoundsFailed() {
  throw new RangeError("Array index out of range");
}

export function arrayIncrement$array$index$amount$(array, index, amount) {
  array[array.length >= index && index >= 0 ? index : $$arrayBoundsFailed()] = array[array.length > index && index >= 0 ? index : $$arrayBoundsFailed()] + amount;
}
export function arrayDecrement$array$index$amount$(array, index, amount) {
  array[array.length >= index && index >= 0 ? index : $$arrayBoundsFailed()] = array[array.length > index && index >= 0 ? index : $$arrayBoundsFailed()] - amount;
}