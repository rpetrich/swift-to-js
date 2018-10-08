export function add$lhs$rhs$(T, lhs, rhs) {
  return T.Numeric.$plus$(lhs, rhs);
}
export function subtract$lhs$rhs$(T, lhs, rhs) {
  return T.Numeric.$minus$(lhs, rhs);
}
const $Int$Type = {
  Numeric: {
    init$exactly$(value) {
      return value;
    },

    $plus$(lhs, rhs) {
      return lhs + rhs;
    },

    $added$(lhs, rhs) {
      return lhs = lhs + rhs;
    },

    $minus$(lhs, rhs) {
      return lhs - rhs;
    },

    $subtracted$(lhs, rhs) {
      return lhs = lhs - rhs;
    },

    $multiply$(lhs, rhs) {
      return lhs * rhs;
    },

    $multiplied$(lhs, rhs) {
      return lhs = lhs * rhs;
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
};
export function addInts$lhs$rhs$(lhs, rhs) {
  return add$lhs$rhs$($Int$Type, lhs, rhs);
}
export function subtractInts$lhs$rhs$(lhs, rhs) {
  return subtract$lhs$rhs$($Int$Type, lhs, rhs);
}