export function makeEmpty() {
  return [0];
}
export function makeUpc$numberSystem$manufacturer$product$check$(numberSystem, manufacturer, product, check) {
  return [1, numberSystem, manufacturer, product, check];
}
export function makeQr$value$(value) {
  return [2, value];
}
export function describe$barcode$(barcode) {
  var $match = barcode;

  if ($match[0] === 0) {
    return "Empty";
  } else if ($match[0] === 1) {
    const numberSystem = $match[1];
    const manufacturer = $match[2];
    const product = $match[3];
    const check = $match[4];
    return "UPC:" + String(numberSystem) + "-" + String(manufacturer) + "-" + String(product) + "-" + String(check);
  } else if ($match[0] === 2) {
    const value = $match[1];
    return "QR:" + value;
  }
}