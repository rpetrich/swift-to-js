function $$emptyOptional(T) {
  return (T.Object.$rep(T) & 128) !== 0 ? [] : null;
}

function $$someOptional(T, value) {
  return (T.Object.$rep(T) & 128) !== 0 ? [value] : value;
}

function $$optionalIsSome(T, value) {
  return (T.Object.$rep(T) & 128) !== 0 ? value.length !== 0 : value !== null;
}

function $$unwrapOptional(T, value) {
  return (T.Object.$rep(T) & 128) !== 0 ? value[0] : value;
}

export function sum$array$(T, array) {
  let result = (T.Object.$rep(T) & 143) !== 0 ? [T.zero(T)] : T.zero(T);
  const iterator = {
    elements: array,
    position: 0
  };

  for (let element; $$optionalIsSome(T, element = iterator.position === iterator.elements.length ? $$emptyOptional(T) : $$someOptional(T, iterator.elements[iterator.position++]));) {
    element = $$unwrapOptional(T, element);

    if ((T.Object.$rep(T) & 143) !== 0) {
      result[0] = T.AdditiveArithmetic.$plus$(T, result, element);
    } else {
      result = T.AdditiveArithmetic.$plus$(T, result, element);
    }
  }

  return (T.Object.$rep(T) & 143) !== 0 ? result[0] : result;
}