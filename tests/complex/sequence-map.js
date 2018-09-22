export function stringSequence$until$(limit) {
  const mapped = [];

  for (let i = 1; i <= limit; i++) {
    mapped.push(String(i));
  }

  return mapped.join(" ");
}