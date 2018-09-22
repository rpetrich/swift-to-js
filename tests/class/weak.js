export function allocate() {
  const weakSelf = new WeakSelf();
  weakSelf.property = null;
  const result = weakSelf;
  result.property = result;
  return result;
}
export function read$weakSelf$(weakSelf) {
  return weakSelf.property;
}
export class WeakSelf {}