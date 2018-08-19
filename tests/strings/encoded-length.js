var utf8_length$str$ = function (str) {
  return new TextEncoder("utf-8").encode(str).length;
};

export { utf8_length$str$ };