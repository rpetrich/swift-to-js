export function equal$lhs$rhs$(T, lhs, rhs) {
  return T.Equatable.$equals$(T, lhs, rhs);
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

    $less$$less$(Self, lhs, rhs) {
      return lhs << rhs;
    },

    $less$$lessequal$(Self, lhs, rhs) {
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

    $greater$$greater$(Self, lhs, rhs) {
      return lhs >> rhs;
    },

    $greater$$greaterequal$(Self, lhs, rhs) {
      lhs[0] = lhs[0] >> rhs;
    },

    $xor$(Self, lhs, rhs) {
      return lhs ^ rhs;
    },

    $xor$$equal$(Self, lhs, rhs) {
      lhs[0] = lhs[0] ^ rhs;
    },

    init$clamping$: abstract$Int$init$clamping$,

    init$exactly$(Self, value) {
      return value;
    },

    init$truncatingIfNeeded$: abstract$Int$init$truncatingIfNeeded$,

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

    $and$$multiplied$: abstract$Int$$and$$multiplied$,

    $and$$plus$(Self, lhs, rhs) {
      return lhs + rhs | 0;
    },

    $and$$added$: abstract$Int$$and$$added$,

    $and$$minus$(Self, lhs, rhs) {
      return lhs - rhs | 0;
    },

    $and$$subtracted$: abstract$Int$$and$$subtracted$,

    $and$$less$$less$(Self, lhs, rhs) {
      return lhs << rhs;
    },

    $and$$less$$lessequal$: abstract$Int$$and$$less$$lessequal$,

    $and$$greater$$greater$(Self, lhs, rhs) {
      return lhs >> rhs;
    },

    $and$$greater$$greaterequal$: abstract$Int$$and$$greater$$greaterequal$,
    addingReportingOverflow: abstract$Int$addingReportingOverflow,
    bigEndian: abstract$Int$bigEndian,
    bitWidth: abstract$Int$bitWidth,
    byteSwapped: abstract$Int$byteSwapped,
    dividedReportingOverflow$by$: abstract$Int$dividedReportingOverflow$by$,
    dividingFullWidth: abstract$Int$dividingFullWidth,
    init$radix: abstract$Int$init$radix,
    init$bigEndian$: abstract$Int$init$bigEndian$,
    init$littleEndian$: abstract$Int$init$littleEndian$,
    leadingZeroBitCount: abstract$Int$leadingZeroBitCount,
    littleEndian: abstract$Int$littleEndian,
    max: abstract$Int$max,
    min: abstract$Int$min,
    multipliedFullWidth$by$: abstract$Int$multipliedFullWidth$by$,
    multipliedReportingOverflow$by$: abstract$Int$multipliedReportingOverflow$by$,
    nonzeroBitCount: abstract$Int$nonzeroBitCount,
    remainderReportingOverflow$dividingBy$: abstract$Int$remainderReportingOverflow$dividingBy$,
    subtractingReportingOverflow: abstract$Int$subtractingReportingOverflow
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

    init$exactly$(Self, value) {
      return value;
    }

  },
  SignedInteger: {
    $and$$plus$: abstract$Int$$and$$plus$,

    $and$$minus$(Self, lhs, rhs) {
      return lhs - rhs | 0;
    },

    init(Self, value) {
      return value;
    },

    init$exactly$(Self, value) {
      return value;
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

    $added$: abstract$Int$$added$,

    $minus$(Self, lhs, rhs) {
      return lhs - rhs;
    },

    $subtracted$: abstract$Int$$subtracted$,

    $$$(Self, start, end) {
      return [start, end];
    },

    $equals$: abstract$Int$$equals$,

    advanced$by$(Self, lhs, rhs) {
      return lhs + rhs;
    },

    distance$to$(Self, lhs, rhs) {
      return rhs - lhs;
    }

  }
};
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

  }
};
export function optionalDoubleEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($Double$question$$Type, lhs, rhs);
}
const $$String$$Type = {
  $rep: 256,
  BidirectionalCollection: {
    formIndex$before$(Self, collection, index) {
      index = abstract$index$before$(index);
    },

    index$before$: abstract$$String$$index$before$,

    joined$separator$(Self, separator) {
      return Self.join(separator);
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

  }
};
export function stringArrayEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($$String$$Type, lhs, rhs);
}
const $Point$Type = {
  $rep: 32,
  Equatable: {
    $notequals$(Self, lhs, rhs) {
      return !(lhs.x === rhs.x && lhs.y === rhs.y);
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
  return !(lhs.x === rhs.x && lhs.y === rhs.y);
}
const $$Point$$Type = {
  $rep: 256,
  BidirectionalCollection: {
    formIndex$before$(Self, collection, index) {
      index = abstract$index$before$(index);
    },

    index$before$: abstract$$Point$$index$before$,

    joined$separator$(Self, separator) {
      return Self.join(separator);
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
          if (!(lhs.x === rhs.x && lhs.y === rhs.y)) break;
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
          if (!(lhs.x === rhs.x && lhs.y === rhs.y)) break;
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
          if (!(lhs.x === rhs.x && lhs.y === rhs.y)) break;
          i++;
        }

        equal = i === lhs.length;
      }

      return equal;
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
        index = abstract$index$before$(index);
      },

      index$before$: abstract$$_$$index$before$,

      joined$separator$(Self, separator) {
        return Self.join(separator);
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

    }
  };
}

export function arrayEqual$lhs$rhs$(T, lhs, rhs) {
  return equal$lhs$rhs$($$_$$Type(T), lhs, rhs);
}