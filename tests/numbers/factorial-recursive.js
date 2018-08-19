var factorial_recursive$number$ = function (number) {
  if (number <= 1) {
    return 1;
  }

  return number * factorial_recursive$number$(number - 1);
};

export { factorial_recursive$number$ };