export function hash$of$(str) {
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + str.charCodeAt(i) - hash;
  }

  return hash | 0;
}