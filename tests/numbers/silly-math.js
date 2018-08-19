var silly_math$num$ = function (num) {
  var result;
  result = num;

  while (result < 10000) {
    result *= result;
  }

  return result;
};

export { silly_math$num$ };