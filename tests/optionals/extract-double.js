export function description_of_double$option$(option) {
  let unwrapped;
  let doubleUnwrapped;

  if (unwrapped = option[0], option.length !== 0) {
    if (doubleUnwrapped = unwrapped, unwrapped !== null) {
      if (doubleUnwrapped) {
        return "True";
      }

      return "False";
    }

    return "Inner None";
  }

  return "Outer None";
}