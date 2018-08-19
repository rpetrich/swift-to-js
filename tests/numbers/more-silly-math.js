var more_silly_math$num$ = function (num) {
  var result = 0;

  if (num < 0) {
    result = num;
  } else {
    result = -num;
  }

  return result * 1000 + 4;
};

export { more_silly_math$num$ };