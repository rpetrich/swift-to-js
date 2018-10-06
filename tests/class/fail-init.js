export function allocate$successfully$(successfully) {
  const possible = new Possible();
  possible.foo = 0;

  if (!successfully) {
    return null;
  }

  return possible;
}
export function allocateAlways() {
  const possible0 = new Possible();
  possible0.foo = 0;
  return possible0;
}
export class Possible {}