function description_of_double$option$(option) {
  var unwrapped, doubleUnwrapped;

  if ((unwrapped = option).length !== 0) {
    if ((doubleUnwrapped = unwrapped) !== null) {
      if (doubleUnwrapped) {
        return "True";
      }

      return "False";
    }

    return "Inner None";
  }

  return "Outer None";
}