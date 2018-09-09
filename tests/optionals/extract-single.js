export function description_of$option$(option) {
  let unwrapped;

  if (option !== null) {
    unwrapped = option;

    if (unwrapped) {
      return "True";
    }

    return "False";
  }

  return "None";
}