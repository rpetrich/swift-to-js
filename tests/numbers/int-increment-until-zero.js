var increment$number$ = function (number) {
  return number + 1;
},
    increment_until_zero$number$ = function (number) {
  if (number < 0) {
    return increment$number$;
  }

  return number;
};

export { increment_until_zero$number$ };