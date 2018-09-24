export function allocate() {
  let deinit = new Deinit();
  console.log("init called");
  return deinit;
}
export class Deinit {}