export function sum$array$(array) {
  const result = [0];

  for (const element of array) {
    result[0] += element;
  }

  return result[0];
}