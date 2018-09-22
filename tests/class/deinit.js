export function allocate() {
  const deinit = new Deinit();
  console.log("init called");
  return deinit;
}
export class Deinit {}