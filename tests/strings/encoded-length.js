function utf8_length$str$(str) {
  return new TextEncoder("utf-8").encode(str).length;
}