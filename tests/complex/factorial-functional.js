export function factorial_functional$number$(number) {
  let result = 1;

  for (let i = 2; i <= number; i++) {
    result = result * i;
  }

  return result;
}