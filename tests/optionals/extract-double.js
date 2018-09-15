export function description_of_double$option$(option) {
  if (option.length !== 0) {
    const unwrapped = option[0];

    if (unwrapped !== null) {
      const doubleUnwrapped = unwrapped;

      if (doubleUnwrapped) {
        return "True";
      }

      return "False";
    }

    return "Inner None";
  }

  return "Outer None";
}