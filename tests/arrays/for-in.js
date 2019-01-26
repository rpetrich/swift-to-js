export function sum$array$(array) {
  const result = [0];
  const iterator = {
    elements: array,
    position: 0
  };

  for (let element; (element = iterator.position === iterator.elements.length ? null : iterator.elements[iterator.position++]) !== null;) {
    result[0] += element;
  }

  return result[0];
}