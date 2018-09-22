export function allocate() {
  const self = function () {
    const deinit = new Deinit();
    return deinit;
  }();

  console.log("init called");
  return self;
}
export class Deinit {}