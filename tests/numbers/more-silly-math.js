export function more_silly_math$num$(num) {
  const result = [0];

  if (num < 0) {
    result[0] = num;
  } else {
    result[0] = -num;
  }

  return result[0] * 1000 + 4;
}