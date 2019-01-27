export function makeVirtualCall$onFoo$passthrough$(foo, passthrough) {
  return "Result: " + foo.virtualCall$passthrough$(passthrough);
}
export function makeVirtualCall$onBar$passthrough$(bar, passthrough) {
  return "Result: " + bar.virtualCall$passthrough$(passthrough);
}
export function makeStaticCall$onFoo$(foo) {
  return "Result: Static";
}
export function makeStaticCall$onBar$(bar) {
  return "Result: Static";
}
export function isBar$foo$(foo) {
  return foo instanceof Bar;
}
export class Foo {
  virtualCall$passthrough$(passthrough) {
    return "Foo";
  }

}
export class Bar extends Foo {
  virtualCall$passthrough$(passthrough) {
    if (passthrough) {
      return super.virtualCall$passthrough$(passthrough);
    } else {
      return "Bar";
    }
  }

}