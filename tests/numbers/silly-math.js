export function silly_math$num$(num) {
  const result = [num];

  while (result[0] < 10000) {
    result[0] *= result[0];
  }

  return result[0];
}