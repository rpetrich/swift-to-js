export function literal(value) {
  return [0, value];
}

function ArithmeticExpression$copy(source) {
  return source[0] === 2 ? [2, ArithmeticExpression$copy(source[1]), ArithmeticExpression$copy(source[2])] : source[0] === 1 ? [1, ArithmeticExpression$copy(source[1]), ArithmeticExpression$copy(source[2])] : source.slice();
}

export function add(left, right) {
  return [1, ArithmeticExpression$copy(left), ArithmeticExpression$copy(right)];
}
export function multiply(left, right) {
  return [2, ArithmeticExpression$copy(left), ArithmeticExpression$copy(right)];
}
export function eval(expression) {
  var $match = expression;

  if ($match[0] === 0) {
    const value = $match[1];
    return value;
  } else if ($match[0] === 1) {
    const l = ArithmeticExpression$copy($match[1]);
    const r = ArithmeticExpression$copy($match[2]);
    return eval(l) + eval(r);
  } else if ($match[0] === 2) {
    const l = ArithmeticExpression$copy($match[1]);
    const r = ArithmeticExpression$copy($match[2]);
    return eval(l) * eval(r);
  }
}
export function silly(expression) {
  var $match = expression;

  if ($match[0] === 0) {
    let value = $match[1];
    value += 10;
    return value;
  } else if ($match[0] === 1) {
    let l = ArithmeticExpression$copy($match[1]);
    l = literal(10);
    return eval(l);
  } else {
    return 0;
  }
}