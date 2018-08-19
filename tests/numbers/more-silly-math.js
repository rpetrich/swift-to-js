export function more_silly_math$num$(num) {
  let result = 0;

  if (num < 0) {
    result = num;
  } else {
    result = -num;
  }

  return result * 1000 + 4;
}