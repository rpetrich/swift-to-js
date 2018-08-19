export function description_of$option$(option) {
  let unwrapped;

  if ((unwrapped = option) !== null) {
    if (unwrapped) {
      return "True";
    }

    return "False";
  }

  return "None";
}