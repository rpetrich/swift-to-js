function $$numericRangeFailed() {
  throw new RangeError("Not enough bits to represent the given value");
}

export function makeUInt8$fromUInt16$(value) {
  return value > 255 ? $$numericRangeFailed() : value;
}
export function makeInt32$fromInt$(value) {
  return value;
}
export function makeInt16$fromInt$(value) {
  return value > 32767 || value < -32768 ? $$numericRangeFailed() : value;
}