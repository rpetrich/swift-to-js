export function fizzBuzz() {
  const mapped = [];

  for (let i = 1; i <= 100; i++) {
    mapped.push(i % 3 === 0 ? i % 5 === 0 ? "FizzBuzz" : "Fizz" : i % 5 === 0 ? "Buzz" : String(i));
  }

  return mapped;
}