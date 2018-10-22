export function factorial$of$(number) {
  let result = 1;

  for (let i = 2; i <= number; i++) {
    result = result * i;
  }

  return result;
}
console.log(factorial$of$(20));