export function select_value$num$(num) {
  var $match = num % 15;

  if (0 === $match) {
    return 3;
  } else if (3 === $match || 6 === $match || 9 === $match || 12 === $match) {
    return 1;
  } else if (5 === $match || 10 === $match) {
    return 2;
  } else {
    return 0;
  }
}
export function describe$divisible$(divisible) {
  var $match = divisible;

  if ($match === 0) {
    return "divisible by neither three or five";
  } else if ($match === 1) {
    return "divisible by three, but not five";
  } else if ($match === 2) {
    return "divisible by five, but not three";
  } else if ($match === 3) {
    return "divisible by both three and five";
  }
}
export function rawValue$of$(divisible) {
  return divisible;
}