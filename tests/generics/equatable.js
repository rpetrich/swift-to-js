export function equal$lhs$rhs$(T, lhs, rhs) {
  return T.Equatable.$equals$(T, lhs, rhs);
}
export function match$lhs$rhs$(T, lhs, rhs) {
  return T.Equatable.$match$(T, lhs, rhs);
}
const $Int$Type = {
  $rep: 4,
  BinaryInteger: {
    $mod$(Self, lhs, rhs) {
      return lhs % rhs;
    },

    $mod$$equal$(Self, lhs, rhs) {
      lhs[0] = lhs[0] % rhs;
    },

    $and$(Self, lhs, rhs) {
      return lhs & rhs;
    },

    $and$$equal$(Self, lhs, rhs) {
      lhs[0] = lhs[0] & rhs;
    },

    $multiply$(Self, lhs, rhs) {
      return lhs * rhs;
    },

    $multiplied$(Self, lhs, rhs) {
      lhs[0] = lhs[0] * rhs;
    },

    $plus$(Self, lhs, rhs) {
      return lhs + rhs;
    },

    $added$(Self, lhs, rhs) {
      lhs[0] = lhs[0] + rhs;
    },

    $minus$(Self, lhs, rhs) {
      return lhs - rhs;
    },

    $subtracted$(Self, lhs, rhs) {
      lhs[0] = lhs[0] - rhs;
    },

    $divide$(Self, lhs, rhs) {
      return lhs / rhs | 0;
    },

    $divided$(Self, lhs, rhs) {
      lhs[0] = lhs[0] / rhs | 0;
    },

    $less$(Self, lhs, rhs) {
      return lhs < rhs;
    },

    $leftshift$(Self, lhs, rhs) {
      return lhs << rhs;
    },

    $leftshift$$equal$(Self, lhs, rhs) {
      lhs[0] = lhs[0] << rhs;
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

    $rightshift$$equal$(Self, lhs, rhs) {
      lhs[0] = lhs[0] >> rhs;
    },

    $xor$(Self, lhs, rhs) {
      return lhs ^ rhs;
    },

    $xor$$equal$(Self, lhs, rhs) {
      lhs[0] = lhs[0] ^ rhs;
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

    $or$$equal$(Self, lhs, rhs) {
      lhs[0] = lhs[0] | rhs;
    },

    $tilde$(Self, self) {
      return ~self;
    }

  },
  Comparable: {
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
    },

    $match$(Self, lhs, rhs) {
      return lhs === rhs;
    }

  },
  FixedWidthInteger: {
    $and$$multiply$(Self, lhs, rhs) {
      return lhs * rhs | 0;
    },

    $and$$multiplied$(Self, lhs, rhs) {
      lhs[0] = lhs[0] * rhs | 0;
    },

    $and$$plus$(Self, lhs, rhs) {
      return lhs + rhs | 0;
    },

    $and$$added$(Self, lhs, rhs) {
      lhs[0] = lhs[0] + rhs | 0;
    },

    $and$$minus$(Self, lhs, rhs) {
      return lhs - rhs | 0;
    },

    $and$$subtracted$(Self, lhs, rhs) {
      lhs[0] = lhs[0] - rhs | 0;
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

    $multiplied$(Self, lhs, rhs) {
      lhs[0] = lhs[0] * rhs;
    },

    $plus$(Self, lhs, rhs) {
      return lhs + rhs;
    },

    $added$(Self, lhs, rhs) {
      lhs[0] = lhs[0] + rhs;
    },

    $minus$(Self, lhs, rhs) {
      return lhs - rhs;
    },

    $subtracted$(Self, lhs, rhs) {
      lhs[0] = lhs[0] - rhs;
    },

    init$exactly$(Self, T, value) {
      return value > T.SignedInteger.min(T) || value < T.SignedInteger.max(T) ? null : value;
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

    $added$(Self, lhs, rhs) {
      lhs[0] = lhs[0] + rhs;
    },

    $minus$(Self, lhs, rhs) {
      return lhs - rhs;
    },

    $subtracted$(Self, lhs, rhs) {
      lhs[0] = lhs[0] - rhs;
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
  $rep: -1,
  Equatable: {
    $notequals$(Self, lhs, rhs) {
      return lhs !== rhs;
    },

    $equals$(Self, lhs, rhs) {
      return lhs === rhs;
    },

    $match$(Self, lhs, rhs) {
      return lhs === rhs;
    }

  },
  ExpressibleByNilLiteral: {
    init$nilLiteral$(Self) {
      return null;
    }

  }
};
export function optionalDoubleEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($Double$question$$Type, lhs, rhs);
}
const $$String$$Type = {
  $rep: 256,
  BidirectionalCollection: {
    formIndex$before$(Self, collection, index) {
      index = index - 1;
    },

    index$before$(Self, index) {
      return index - 1;
    },

    joined$separator$(Self, collection, separator) {
      return collection.join(separator);
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
    },

    $match$(Self, lhs, rhs) {
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

  }
};
export function stringArrayEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($$String$$Type, lhs, rhs);
}
const $Point$Type = {
  $rep: 32,
  Equatable: {
    $notequals$(Self, lhs, rhs) {
      return lhs.x !== rhs.x || lhs.y !== rhs.y;
    },

    $equals$(Self, lhs, rhs) {
      return lhs.x === rhs.x && lhs.y === rhs.y;
    },

    $match$(Self, lhs, rhs) {
      return lhs.x === rhs.x && lhs.y === rhs.y;
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
  $rep: 256,
  BidirectionalCollection: {
    formIndex$before$(Self, collection, index) {
      index = index - 1;
    },

    index$before$(Self, index) {
      return index - 1;
    },

    joined$separator$(Self, collection, separator) {
      return collection.join(separator);
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
    },

    $match$(Self, lhs, rhs) {
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

  }
};
export function pointArrayEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($$Point$$Type, lhs, rhs);
}

function $$_$$Type(T) {
  return {
    $rep: 256,
    BidirectionalCollection: {
      formIndex$before$(Self, collection, index) {
        index = index - 1;
      },

      index$before$(Self, index) {
        return index - 1;
      },

      joined$separator$(Self, collection, separator) {
        return collection.join(separator);
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
      },

      $match$(Self, lhs, rhs) {
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

    }
  };
}

export function arrayEqual$lhs$rhs$(T, lhs, rhs) {
  return equal$lhs$rhs$($$_$$Type(T), lhs, rhs);
}