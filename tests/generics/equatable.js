export function equal$lhs$rhs$(T, lhs, rhs) {
  return T.Equatable.$equals$(T, lhs, rhs);
}
export function match$lhs$rhs$(T, lhs, rhs) {
  return T.Equatable.$equals$(T, lhs, rhs);
}
const $Int$Type = {
  AdditiveArithmetic: {
    $plus$(Self, lhs, rhs) {
      return lhs + rhs;
    },

    $minus$(Self, lhs, rhs) {
      return lhs - rhs;
    },

    zero(Self) {
      return 0;
    }

  },
  BinaryInteger: {
    $mod$(Self, lhs, rhs) {
      return lhs % rhs;
    },

    $and$(Self, lhs, rhs) {
      return lhs & rhs;
    },

    $multiply$(Self, lhs, rhs) {
      return lhs * rhs;
    },

    $plus$(Self, lhs, rhs) {
      return lhs + rhs;
    },

    $minus$(Self, lhs, rhs) {
      return lhs - rhs;
    },

    $divide$(Self, lhs, rhs) {
      return lhs / rhs | 0;
    },

    $less$(Self, lhs, rhs) {
      return lhs < rhs;
    },

    $leftshift$(Self, lhs, rhs) {
      return lhs << rhs;
    },

    $lessequal$(Self, lhs, rhs) {
      return lhs <= rhs;
    },

    $greater$(Self, lhs, rhs) {
      return lhs > rhs;
    },

    $greaterequal$(Self, lhs, rhs) {
      return lhs >= rhs;
    },

    $rightshift$(Self, lhs, rhs) {
      return lhs >> rhs;
    },

    $xor$(Self, lhs, rhs) {
      return lhs ^ rhs;
    },

    init$clamping$(Self, T, value) {
      return value > T.SignedInteger.max(T) ? T.SignedInteger.max(T) : value < T.SignedInteger.min(T) ? T.SignedInteger.min(T) : value;
    },

    init$exactly$(Self, T, value) {
      return value > T.SignedInteger.min(T) || value < T.SignedInteger.max(T) ? null : value;
    },

    init$truncatingIfNeeded$(Self, source) {
      return source | 0;
    },

    isSigned(Self) {
      return true;
    },

    quotientAndRemainder$dividingBy$(Self, lhs, rhs) {
      return [lhs / rhs | 0, lhs % rhs];
    },

    signum(Self, self) {
      return self > 0 ? 1 : self < 0 ? -1 : self;
    },

    $or$(Self, lhs, rhs) {
      return lhs | rhs;
    },

    $tilde$(Self, self) {
      return ~self;
    }

  },
  Comparable: {
    $$$(Self, minimum, maximum) {
      return [minimum, maximum];
    },

    $less$(Self, lhs, rhs) {
      return lhs < rhs;
    },

    $lessequal$(Self, lhs, rhs) {
      return lhs <= rhs;
    },

    $greater$(Self, lhs, rhs) {
      return lhs > rhs;
    },

    $greaterequal$(Self, lhs, rhs) {
      return lhs >= rhs;
    }

  },
  CustomStringConvertible: {
    description(Self, self) {
      return String(self);
    }

  },
  Equatable: {
    $notequals$(Self, lhs, rhs) {
      return lhs !== rhs;
    },

    $equals$(Self, lhs, rhs) {
      return lhs === rhs;
    }

  },
  FixedWidthInteger: {
    $and$$multiply$(Self, lhs, rhs) {
      return lhs * rhs | 0;
    },

    $and$$plus$(Self, lhs, rhs) {
      return lhs + rhs | 0;
    },

    $and$$minus$(Self, lhs, rhs) {
      return lhs - rhs | 0;
    },

    $and$$leftshift$(Self, lhs, rhs) {
      return lhs << rhs;
    },

    $and$$leftshift$$equal$(Self, lhs, rhs) {
      lhs[0] = lhs[0] << rhs;
    },

    $and$$rightshift$(Self, lhs, rhs) {
      return lhs >> rhs;
    },

    $and$$rightshift$$equal$(Self, lhs, rhs) {
      lhs[0] = lhs[0] >> rhs;
    },

    addingReportingOverflow(Self, lhs, rhs) {
      const full = lhs + rhs;
      const truncated = full | 0;
      return [truncated, truncated !== full];
    },

    bigEndian(Self, value) {
      return value >> 24 & 255 | value >> 8 & 65280 | value << 8 & 16711680 | value << 24;
    },

    bitWidth(Self) {
      return 32;
    },

    byteSwapped(Self, value) {
      return value >> 24 & 255 | value >> 8 & 65280 | value << 8 & 16711680 | value << 24;
    },

    dividedReportingOverflow$by$(Self, lhs, rhs) {
      const full = lhs / rhs | 0;
      const truncated = full | 0;
      return [truncated, truncated !== full];
    },

    dividingFullWidth(Self) {
      return $$notImplemented();
    },

    init$radix$(Self, text, radix) {
      const integer = parseInt(text, radix);
      return integer !== integer ? null : integer;
    },

    init$bigEndian$(Self, value) {
      return value >> 24 & 255 | value >> 8 & 65280 | value << 8 & 16711680 | value << 24;
    },

    init$clamping$(Self, $1) {
      return $1 > $1.SignedInteger.max($1) ? $1.SignedInteger.max($1) : $1 < $1.SignedInteger.min($1) ? $1.SignedInteger.min($1) : $1;
    },

    init$littleEndian$(Self, value) {
      return value;
    },

    leadingZeroBitCount(Self, value) {
      let shift = 32;

      while (value >> --shift === 0 && shift >= 0) {}

      return 31 - shift;
    },

    littleEndian(Self, self) {
      return self;
    },

    max(Self) {
      return 2147483647;
    },

    min(Self) {
      return -2147483648;
    },

    multipliedFullWidth$by$(Self, lhs, rhs) {
      return [lhs * rhs / 4294967296 | 0, Math.imul(lhs, rhs)];
    },

    multipliedReportingOverflow$by$(Self, lhs, rhs) {
      const full = lhs * rhs;
      const truncated = full | 0;
      return [truncated, truncated !== full];
    },

    nonzeroBitCount(Self, value) {
      let current = value;
      let count = 0;

      while (current) {
        count++;
        current &= current - 1;
      }

      return count;
    },

    remainderReportingOverflow$dividingBy$(Self, lhs, rhs) {
      const full = lhs % rhs;
      const truncated = full | 0;
      return [truncated, truncated !== full];
    },

    subtractingReportingOverflow(Self, lhs, rhs) {
      const full = lhs - rhs;
      const truncated = full | 0;
      return [truncated, truncated !== full];
    }

  },
  Hashable: {
    hash$into$(Self, self, hasher) {
      hasher[0] = (hasher[0] << 5) + self - hasher[0];
    },

    hashValue(Self, self) {
      return self;
    }

  },
  LosslessStringConvertible: {
    init(Self, description) {
      const integer = parseInt(description, 10);
      return integer !== integer ? null : integer;
    }

  },
  Numeric: {
    $multiply$(Self, lhs, rhs) {
      return lhs * rhs;
    },

    init$exactly$(Self, T, value) {
      return value > T.SignedInteger.min(T) || value < T.SignedInteger.max(T) ? null : value;
    }

  },
  Object: {
    $rep(Self) {
      return 4;
    }

  },
  SignedInteger: {
    $and$$plus$(Self, lhs, rhs) {
      return lhs + rhs | 0;
    },

    $and$$minus$(Self, lhs, rhs) {
      return lhs - rhs | 0;
    },

    init(Self, T, value) {
      return value < T.SignedInteger.min(T) || value > T.SignedInteger.max(T) ? $$numericRangeFailed() : value;
    },

    init$exactly$(Self, T, value) {
      return value > T.SignedInteger.min(T) || value < T.SignedInteger.max(T) ? null : value;
    },

    max(Self) {
      return 2147483647;
    },

    min(Self) {
      return -2147483648;
    }

  },
  SignedNumeric: {
    $minus$(Self, value) {
      return -value;
    },

    negate(Self, self) {
      self[0] = -self[0];
    }

  },
  Strideable: {
    $plus$(Self, lhs, rhs) {
      return lhs + rhs;
    },

    $minus$(Self, lhs, rhs) {
      return lhs - rhs;
    },

    $$$(Self, start, end) {
      return [start, end];
    },

    $equals$(Self, lhs, rhs) {
      return lhs === rhs;
    },

    advanced$by$(Self, lhs, rhs) {
      return lhs + rhs;
    },

    distance$to$(Self, lhs, rhs) {
      return rhs - lhs;
    }

  }
};

function $$notImplemented() {
  throw new Error("Not implemented!");
}

function $$numericRangeFailed() {
  throw new RangeError("Not enough bits to represent the given value");
}

export function integerEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($Int$Type, lhs, rhs);
}
const $Double$question$$Type = {
  Equatable: {
    $notequals$(Self, lhs, rhs) {
      return lhs !== rhs;
    },

    $equals$(Self, lhs, rhs) {
      return lhs === rhs;
    }

  },
  ExpressibleByNilLiteral: {
    init$nilLiteral$(Self) {
      return null;
    }

  },
  Object: {
    $rep(Self) {
      return 132;
    }

  }
};
export function optionalDoubleEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($Double$question$$Type, lhs, rhs);
}
const $$String$$Type = {
  BidirectionalCollection: {
    formIndex$before$(Self, collection, index) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      index = index - 1;
    },

    index$before$(Self, index) {
      return index - 1;
    },

    joined$separator$(Self, collection, separator) {
      return collection.join(separator);
    }

  },
  Collection: {
    Element(Self) {
      return $String$Type;
    },

    count(Self, collection) {
      let current = 0;
      let count = 0;

      while ($Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, collection.length)) {
        count++;
        current = current + 1;
      }

      return count;
    },

    distance$from$to$(Self, self, start, end) {
      let current = start;
      let count = 0;

      while ($Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, end)) {
        count++;
        current = current + 1;
      }

      return count;
    },

    endIndex(Self, array) {
      return array.length;
    },

    first(Self, collection) {
      return $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, collection.length, 0) ? $$someOptional($Self$Element$Type, collection[0]) : $$emptyOptional($Self$Element$Type);
    },

    formIndex$offsetBy$(Self, collection, index, distance) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      let current = index;

      for (let i = 0; i < distance; i++, undefined) {
        current = current + 1;
      }

      index = current;
    },

    formIndex$offsetBy$limitedBy$(Self, collection, index, distance, limit) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      let current = index;

      for (let i = 0; i < distance && $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, limit); i++, undefined) {
        current = current + 1;
      }

      index = current;
    },

    formIndex$after$(Self, collection, index) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      index = index + 1;
    },

    index$offsetBy$(Self, self, index, distance) {
      let current = index;

      for (let i = 0; i < distance; i++, undefined) {
        current = current + 1;
      }

      return current;
    },

    index$offsetBy$limitedBy$(Self, self, index, distance, limit) {
      let current = index;

      for (let i = 0; i < distance && $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, limit); i++, undefined) {
        current = current + 1;
      }

      return current;
    },

    index$after$(Self, index) {
      return index + 1;
    },

    isEmpty(Self, collection) {
      return $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, collection.length, 0);
    },

    lazy: abstract$$String$$lazy,
    makeIterator: abstract$$String$$makeIterator,

    prefix$through$(Self, self, position) {
      return abstract$prefix$upTo$(position + 1);
    },

    prefix$upTo$: abstract$$String$$prefix$upTo$,

    startIndex(Self) {
      return 0;
    },

    subscript(Self, array, index) {
      return array[index];
    }

  },
  Equatable: {
    $notequals$(Self, lhs, rhs) {
      let unequal;

      if (lhs.length !== rhs.length) {
        unequal = true;
      } else {
        let i = 0;

        while (i < lhs.length) {
          if (lhs[i] !== rhs[i]) break;
          i++;
        }

        unequal = i !== lhs.length;
      }

      return unequal;
    },

    $equals$(Self, lhs, rhs) {
      let equal;

      if (lhs.length !== rhs.length) {
        equal = false;
      } else {
        let i = 0;

        while (i < lhs.length) {
          if (lhs[i] !== rhs[i]) break;
          i++;
        }

        equal = i === lhs.length;
      }

      return equal;
    }

  },
  ExpressibleByArrayLiteral: {
    init$arrayLiteral$(Self, array) {
      return array;
    }

  },
  Hashable: {
    hash$into$(Self, array, hasher) {
      for (let i = 0; i < array.length; i++) {
        let hash = 0;

        for (let i0 = 0; i0 < array[i].length; i0++) {
          hash = (hash << 5) + array[i].charCodeAt(i0) - hash;
        }

        hasher[0] = (hasher[0] << 5) + (hash | 0) - hasher[0];
      }
    },

    hashValue(Self, array) {
      let hash = [0];

      for (let i = 0; i < array.length; i++) {
        let hash0 = 0;

        for (let i0 = 0; i0 < array[i].length; i0++) {
          hash0 = (hash0 << 5) + array[i].charCodeAt(i0) - hash0;
        }

        hash[0] = (hash[0] << 5) + (hash0 | 0) - hash[0];
      }

      return hash[0] | 0;
    }

  },
  Object: {
    $rep(Self) {
      return 256;
    }

  },
  Sequence: {
    Iterator: $IndexingIterator$less$Array$less$String$rightshift$$Type,
    allSatisfy: abstract$$String$$allSatisfy,

    contains(Self, sequence) {
      return abstract$contains$where$(sequence, function () {
        return true;
      });
    },

    contains$where$: abstract$$String$$contains$where$,
    dropFirst: abstract$$String$$dropFirst,
    dropLast: abstract$$String$$dropLast,
    first$where$: abstract$$String$$first$where$,

    makeIterator(Self, array) {
      return {
        elements: array,
        position: 0
      };
    },

    max: abstract$$String$$max,
    max$by$: abstract$$String$$max$by$,
    min: abstract$$String$$min,
    min$by$: abstract$$String$$min$by$,
    reduce: abstract$$String$$reduce,
    reversed: abstract$$String$$reversed,
    sorted: abstract$$String$$sorted,
    sorted$by$: abstract$$String$$sorted$by$,
    underestimatedCount: abstract$$String$$underestimatedCount
  }
};
const $Self$Index$Type = {};
const $String$Type = {
  Collection: {
    Element: abstract$String$Element,

    count(Self, string) {
      return string.length;
    },

    distance$from$to$(Self, self, start, end) {
      return end - start;
    },

    endIndex(Self, string) {
      return string.length;
    },

    first(Self, collection) {
      return $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, collection.length, 0) ? $$someOptional($Self$Element$Type, collection[collection.length > 0 ? 0 : $$stringBoundsFailed()]) : $$emptyOptional($Self$Element$Type);
    },

    formIndex$offsetBy$(Self, collection, index, distance) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      const result = index + distance;
      index = result > collection.length ? $$stringBoundsFailed() : result;
    },

    formIndex$offsetBy$limitedBy$(Self, collection, index, distance, limit) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      const result = index + distance;
      index = result > limit ? limit : result > collection.length ? $$stringBoundsFailed() : result;
    },

    formIndex$after$(Self, collection, index) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      index = collection.length > index ? index + 1 : $$stringBoundsFailed();
    },

    index$offsetBy$(Self, self, index, distance) {
      const result = index + distance;
      return result > self.length ? $$stringBoundsFailed() : result;
    },

    index$offsetBy$limitedBy$(Self, self, index, distance, limit) {
      const result = index + distance;
      return result > limit ? limit : result > self.length ? $$stringBoundsFailed() : result;
    },

    index$after$(Self, string, index) {
      return string.length > index ? index + 1 : $$stringBoundsFailed();
    },

    isEmpty(Self, collection) {
      return $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, collection.length, 0);
    },

    lazy: abstract$String$lazy,
    makeIterator: abstract$String$makeIterator,

    prefix$through$(Self, self, position) {
      return self.substring(0, self.length > position ? position + 1 : $$stringBoundsFailed());
    },

    prefix$upTo$(Self, self, end) {
      return self.substring(0, end);
    },

    startIndex(Self) {
      return 0;
    },

    subscript(Self, str, i) {
      return str[str.length > i ? i : $$stringBoundsFailed()];
    }

  },
  Equatable: {
    $notequals$(Self, lhs, rhs) {
      return lhs !== rhs;
    },

    $equals$(Self, lhs, rhs) {
      return lhs === rhs;
    }

  },
  Hashable: {
    hash$into$(Self, string, hasher) {
      for (let i = 0; i < string.length; i++) {
        hasher[0] = (hasher[0] << 5) + string.charCodeAt(i) - hasher[0];
      }
    },

    hashValue(Self, string) {
      let hash = 0;

      for (let i = 0; i < string.length; i++) {
        hash = (hash << 5) + string.charCodeAt(i) - hash;
      }

      return hash | 0;
    }

  },
  Object: {
    $rep(Self) {
      return 8;
    }

  }
};

function $$stringBoundsFailed() {
  throw new RangeError("String index out of range");
}

const $Self$Element$Type = {};

function $$someOptional(T, value) {
  return (T.Object.$rep(T) & 128) !== 0 ? [value] : value;
}

function $$emptyOptional(T) {
  return (T.Object.$rep(T) & 128) !== 0 ? [] : null;
}

const $IndexingIterator$less$Array$less$String$rightshift$$Type = {
  IteratorProtocol: {
    next(Self, iterator) {
      return iterator.position === iterator.elements.length ? null : iterator.elements[iterator.position++];
    }

  },
  Object: {
    $rep(Self) {
      return 32;
    }

  }
};
export function stringArrayEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($$String$$Type, lhs, rhs);
}
const $Point$Type = {
  Equatable: {
    $notequals$(Self, lhs, rhs) {
      return lhs.x !== rhs.x || lhs.y !== rhs.y;
    },

    $equals$(Self, lhs, rhs) {
      return lhs.x === rhs.x && lhs.y === rhs.y;
    }

  },
  Object: {
    $rep(Self) {
      return 32;
    }

  }
};
export function pointEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($Point$Type, lhs, rhs);
}
export function pointEqualDirect$lhs$rhs$(lhs, rhs) {
  return lhs.x === rhs.x && lhs.y === rhs.y;
}
export function pointNotEqualDirect$lhs$rhs$(lhs, rhs) {
  return lhs.x !== rhs.x || lhs.y !== rhs.y;
}
const $$Point$$Type = {
  BidirectionalCollection: {
    formIndex$before$(Self, collection, index) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      index = index - 1;
    },

    index$before$(Self, index) {
      return index - 1;
    },

    joined$separator$(Self, collection, separator) {
      return collection.join(separator);
    }

  },
  Collection: {
    Element(Self) {
      return $Point$Type;
    },

    count(Self, collection) {
      let current = 0;
      let count = 0;

      while ($Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, collection.length)) {
        count++;
        current = current + 1;
      }

      return count;
    },

    distance$from$to$(Self, self, start, end) {
      let current = start;
      let count = 0;

      while ($Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, end)) {
        count++;
        current = current + 1;
      }

      return count;
    },

    endIndex(Self, array) {
      return array.length;
    },

    first(Self, collection) {
      return $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, collection.length, 0) ? $$someOptional($Self$Element$Type, collection[0]) : $$emptyOptional($Self$Element$Type);
    },

    formIndex$offsetBy$(Self, collection, index, distance) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      let current = index;

      for (let i = 0; i < distance; i++, undefined) {
        current = current + 1;
      }

      index = current;
    },

    formIndex$offsetBy$limitedBy$(Self, collection, index, distance, limit) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      let current = index;

      for (let i = 0; i < distance && $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, limit); i++, undefined) {
        current = current + 1;
      }

      index = current;
    },

    formIndex$after$(Self, collection, index) {
      const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
      index = index + 1;
    },

    index$offsetBy$(Self, self, index, distance) {
      let current = index;

      for (let i = 0; i < distance; i++, undefined) {
        current = current + 1;
      }

      return current;
    },

    index$offsetBy$limitedBy$(Self, self, index, distance, limit) {
      let current = index;

      for (let i = 0; i < distance && $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, limit); i++, undefined) {
        current = current + 1;
      }

      return current;
    },

    index$after$(Self, index) {
      return index + 1;
    },

    isEmpty(Self, collection) {
      return $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, collection.length, 0);
    },

    lazy: abstract$$Point$$lazy,
    makeIterator: abstract$$Point$$makeIterator,

    prefix$through$(Self, self, position) {
      return abstract$prefix$upTo$(position + 1);
    },

    prefix$upTo$: abstract$$Point$$prefix$upTo$,

    startIndex(Self) {
      return 0;
    },

    subscript(Self, array, index) {
      return array[index];
    }

  },
  Equatable: {
    $notequals$(Self, lhs, rhs) {
      let unequal;

      if (lhs.length !== rhs.length) {
        unequal = true;
      } else {
        let i = 0;

        while (i < lhs.length) {
          const lhs = lhs[i];
          const rhs = rhs[i];
          if (lhs.x !== rhs.x || lhs.y !== rhs.y) break;
          i++;
        }

        unequal = i !== lhs.length;
      }

      return unequal;
    },

    $equals$(Self, lhs, rhs) {
      let equal;

      if (lhs.length !== rhs.length) {
        equal = false;
      } else {
        let i = 0;

        while (i < lhs.length) {
          const lhs = lhs[i];
          const rhs = rhs[i];
          if (lhs.x !== rhs.x || lhs.y !== rhs.y) break;
          i++;
        }

        equal = i === lhs.length;
      }

      return equal;
    }

  },
  ExpressibleByArrayLiteral: {
    init$arrayLiteral$(Self, array) {
      return array;
    }

  },
  Hashable: {
    hash$into$(Self, array, hasher) {
      for (let i = 0; i < array.length; i++) {
        hasher[0] = (hasher[0] << 5) + $Point$Type.Hashable.hashValue($Point$Type, array[i]) - hasher[0];
      }
    },

    hashValue(Self, array) {
      let hash = [0];

      for (let i = 0; i < array.length; i++) {
        hash[0] = (hash[0] << 5) + $Point$Type.Hashable.hashValue($Point$Type, array[i]) - hash[0];
      }

      return hash[0] | 0;
    }

  },
  Object: {
    $rep(Self) {
      return 256;
    }

  },
  Sequence: {
    Iterator: $IndexingIterator$less$Array$less$Point$rightshift$$Type,
    allSatisfy: abstract$$Point$$allSatisfy,

    contains(Self, sequence) {
      return abstract$contains$where$(sequence, function () {
        return true;
      });
    },

    contains$where$: abstract$$Point$$contains$where$,
    dropFirst: abstract$$Point$$dropFirst,
    dropLast: abstract$$Point$$dropLast,
    first$where$: abstract$$Point$$first$where$,

    makeIterator(Self, array) {
      return {
        elements: array,
        position: 0
      };
    },

    max: abstract$$Point$$max,
    max$by$: abstract$$Point$$max$by$,
    min: abstract$$Point$$min,
    min$by$: abstract$$Point$$min$by$,
    reduce: abstract$$Point$$reduce,
    reversed: abstract$$Point$$reversed,
    sorted: abstract$$Point$$sorted,
    sorted$by$: abstract$$Point$$sorted$by$,
    underestimatedCount: abstract$$Point$$underestimatedCount
  }
};
const $IndexingIterator$less$Array$less$Point$rightshift$$Type = {
  IteratorProtocol: {
    next(Self, iterator) {
      return iterator.position === iterator.elements.length ? null : iterator.elements[iterator.position++];
    }

  },
  Object: {
    $rep(Self) {
      return 32;
    }

  }
};
export function pointArrayEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($$Point$$Type, lhs, rhs);
}

function $$_$$Type(T) {
  return {
    BidirectionalCollection: {
      formIndex$before$(Self, collection, index) {
        const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
        index = index - 1;
      },

      index$before$(Self, index) {
        return index - 1;
      },

      joined$separator$(Self, collection, separator) {
        return collection.join(separator);
      }

    },
    Collection: {
      Element(Self) {
        return T;
      },

      count(Self, collection) {
        let current = 0;
        let count = 0;

        while ($Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, collection.length)) {
          count++;
          current = current + 1;
        }

        return count;
      },

      distance$from$to$(Self, self, start, end) {
        let current = start;
        let count = 0;

        while ($Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, end)) {
          count++;
          current = current + 1;
        }

        return count;
      },

      endIndex(Self, array) {
        return array.length;
      },

      first(Self, collection) {
        return $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, collection.length, 0) ? $$someOptional($Self$Element$Type, collection[0]) : $$emptyOptional($Self$Element$Type);
      },

      formIndex$offsetBy$(Self, collection, index, distance) {
        const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
        let current = index;

        for (let i = 0; i < distance; i++, undefined) {
          current = current + 1;
        }

        index = current;
      },

      formIndex$offsetBy$limitedBy$(Self, collection, index, distance, limit) {
        const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
        let current = index;

        for (let i = 0; i < distance && $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, limit); i++, undefined) {
          current = current + 1;
        }

        index = current;
      },

      formIndex$after$(Self, collection, index) {
        const index = ($Self$Index$Type.Object.$rep($Self$Index$Type) & 143) !== 0 ? index[0] : index;
        index = index + 1;
      },

      index$offsetBy$(Self, self, index, distance) {
        let current = index;

        for (let i = 0; i < distance; i++, undefined) {
          current = current + 1;
        }

        return current;
      },

      index$offsetBy$limitedBy$(Self, self, index, distance, limit) {
        let current = index;

        for (let i = 0; i < distance && $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, current, limit); i++, undefined) {
          current = current + 1;
        }

        return current;
      },

      index$after$(Self, index) {
        return index + 1;
      },

      isEmpty(Self, collection) {
        return $Self$Index$Type.Equatable.$notequals$($Self$Index$Type, collection.length, 0);
      },

      lazy: abstract$$_$$lazy,
      makeIterator: abstract$$_$$makeIterator,

      prefix$through$(Self, self, position) {
        return abstract$prefix$upTo$(position + 1);
      },

      prefix$upTo$: abstract$$_$$prefix$upTo$,

      startIndex(Self) {
        return 0;
      },

      subscript(Self, array, index) {
        return array[index];
      }

    },
    Equatable: {
      $notequals$(Self, lhs, rhs) {
        let unequal;

        if (lhs.length !== rhs.length) {
          unequal = true;
        } else {
          let i = 0;

          while (i < lhs.length) {
            if (T.Equatable.$notequals$(T, lhs[i], rhs[i])) break;
            i++;
          }

          unequal = i !== lhs.length;
        }

        return unequal;
      },

      $equals$(Self, lhs, rhs) {
        let equal;

        if (lhs.length !== rhs.length) {
          equal = false;
        } else {
          let i = 0;

          while (i < lhs.length) {
            if (T.Equatable.$notequals$(T, lhs[i], rhs[i])) break;
            i++;
          }

          equal = i === lhs.length;
        }

        return equal;
      }

    },
    ExpressibleByArrayLiteral: {
      init$arrayLiteral$(Self, array) {
        return array;
      }

    },
    Hashable: {
      hash$into$(Self, array, hasher) {
        for (let i = 0; i < array.length; i++) {
          hasher[0] = (hasher[0] << 5) + T.Hashable.hashValue(T, array[i]) - hasher[0];
        }
      },

      hashValue(Self, array) {
        let hash = [0];

        for (let i = 0; i < array.length; i++) {
          hash[0] = (hash[0] << 5) + T.Hashable.hashValue(T, array[i]) - hash[0];
        }

        return hash[0] | 0;
      }

    },
    Object: {
      $rep(Self) {
        return 256;
      }

    },
    Sequence: {
      Iterator: $IndexingIterator$less$Array$less$_$rightshift$$Type(T),
      allSatisfy: abstract$$_$$allSatisfy,

      contains(Self, sequence) {
        return abstract$contains$where$(sequence, function () {
          return true;
        });
      },

      contains$where$: abstract$$_$$contains$where$,
      dropFirst: abstract$$_$$dropFirst,
      dropLast: abstract$$_$$dropLast,
      first$where$: abstract$$_$$first$where$,

      makeIterator(Self, array) {
        return {
          elements: array,
          position: 0
        };
      },

      max: abstract$$_$$max,
      max$by$: abstract$$_$$max$by$,
      min: abstract$$_$$min,
      min$by$: abstract$$_$$min$by$,
      reduce: abstract$$_$$reduce,
      reversed: abstract$$_$$reversed,
      sorted: abstract$$_$$sorted,
      sorted$by$: abstract$$_$$sorted$by$,
      underestimatedCount: abstract$$_$$underestimatedCount
    }
  };
}

function $IndexingIterator$less$Array$less$_$rightshift$$Type(T) {
  return {
    IteratorProtocol: {
      next(Self, iterator) {
        return iterator.position === iterator.elements.length ? $$emptyOptional(T) : $$someOptional(T, iterator.elements[iterator.position++]);
      }

    },
    Object: {
      $rep(Self) {
        return 32;
      }

    }
  };
}

export function arrayEqual$lhs$rhs$(T, lhs, rhs) {
  return equal$lhs$rhs$($$_$$Type(T), lhs, rhs);
}