function description_of$option$(option) {
  var unwrapped;

  if ((unwrapped = option) !== null) {
    if (unwrapped) {
      return "True";
    }

    return "False";
  }

  return "None";
}