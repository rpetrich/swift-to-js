export function negate$number$(T, number) {
  return T.SignedNumeric.$minus$(number);
}
const $Int$Type = {
  SignedNumeric: {
    $minus$(value) {
      return -value;
    },

    negate(lhs) {
      lhs[0] = -lhs[0];
    },

    Numeric: {
      init$exactly$(value) {
        return value;
      },

      $plus$(lhs, rhs) {
        return lhs + rhs;
      },

      $added$(lhs, rhs) {
        lhs[0] = lhs[0] + rhs;
      },

      $minus$(lhs, rhs) {
        return lhs - rhs;
      },

      $subtracted$(lhs, rhs) {
        lhs[0] = lhs[0] - rhs;
      },

      $multiply$(lhs, rhs) {
        return lhs * rhs;
      },

      $multiplied$(lhs, rhs) {
        lhs[0] = lhs[0] * rhs;
      },

      Equatable: {
        $equals$(lhs, rhs) {
          return lhs === rhs;
        },

        $notequals$(lhs, rhs) {
          return lhs !== rhs;
        },

        $match$(lhs, rhs) {
          return lhs === rhs;
        }

      }
    }
  },
  Numeric: {
    init$exactly$(value) {
      return value;
    },

    $plus$(lhs, rhs) {
      return lhs + rhs;
    },

    $added$(lhs, rhs) {
      lhs[0] = lhs[0] + rhs;
    },

    $minus$(lhs, rhs) {
      return lhs - rhs;
    },

    $subtracted$(lhs, rhs) {
      lhs[0] = lhs[0] - rhs;
    },

    $multiply$(lhs, rhs) {
      return lhs * rhs;
    },

    $multiplied$(lhs, rhs) {
      lhs[0] = lhs[0] * rhs;
    },

    Equatable: {
      $equals$(lhs, rhs) {
        return lhs === rhs;
      },

      $notequals$(lhs, rhs) {
        return lhs !== rhs;
      },

      $match$(lhs, rhs) {
        return lhs === rhs;
      }

    }
  }
};
export function negate$integer$(integer) {
  return negate$number$($Int$Type, integer);
}
const $Double$Type = {
  SignedNumeric: {
    $minus$(value) {
      return -value;
    },

    negate(lhs) {
      lhs[0] = -lhs[0];
    }

  }
};
export function negate$double$(double) {
  return negate$number$($Double$Type, double);
}
export function negateDirect$double$(double) {
  return -double;
}