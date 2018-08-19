export function silly_math$num$(num) {
  var result;
  result = num;

  while (result < 10000) {
    result *= result;
  }

  return result;
}