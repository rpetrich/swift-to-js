export function silly_math$num$(num) {
  let result = num;

  while (result < 10000) {
    result *= result;
  }

  return result;
}