function increment$number$(number) {
  return number + 1;
}

function increment_until_zero$number$(number) {
  if (number < 0) {
    return increment$number$(number);
  }

  return number;
}