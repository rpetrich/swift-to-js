export function make$empty$(empty) {
  return [0];
}
export function make$upc$(value) {
  return [1, value];
}
export function make$qrCode$(value) {
  return [2, value];
}
export function describe$barcode$(barcode) {
  let value;
  var $match = barcode;

  if ($match[0] === 0) {
    return "Empty";
  } else if ($match[0] === 1) {
    value = $match[1];
    return "UPC:" + String(value);
  } else if ($match[0] === 2) {
    value = $match[1];
    return "QR:" + value;
  }
}