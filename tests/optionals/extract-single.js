export function description_of$option$(option) {
  if (option !== null) {
    const unwrapped = option;

    if (unwrapped) {
      return "True";
    }

    return "False";
  }

  return "None";
}