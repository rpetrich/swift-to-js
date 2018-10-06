export function silly_math$num$(num) {
  const result = [num];

  do {
    result[0] *= result[0];
  } while (result[0] < 10000);

  return result[0];
}