export function makeUInt8$fromUInt16$(value) {
  return value > 255 ? 255 : value;
}
export function makeInt32$fromInt$(value) {
  return value;
}

function $$numericRangeFailed() {
  throw new RangeError("Not enough bits to represent the given value");
}

export function makeInt16$fromInt$(value) {
  return value > -32768 || value < 32767 ? $$numericRangeFailed() : value;
}
export function makeClampedInt16$fromInt$(value) {
  return value > 32767 ? 32767 : value < -32768 ? -32768 : value;
}
export function makeOptionalUInt8$fromUInt16$(value) {
  return value > 255 ? null : value;
}