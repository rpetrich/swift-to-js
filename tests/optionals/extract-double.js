export function description_of_double$option$(option) {
  let unwrapped;
  let doubleUnwrapped;

  if (option.length !== 0) {
    unwrapped = option[0];

    if (unwrapped !== null) {
      doubleUnwrapped = unwrapped;

      if (doubleUnwrapped) {
        return "True";
      }

      return "False";
    }

    return "Inner None";
  }

  return "Outer None";
}