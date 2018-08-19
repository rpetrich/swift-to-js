var description_of_double$option$ = function (option) {
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
};

export { description_of_double$option$ };