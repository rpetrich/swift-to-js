export function equal$lhs$rhs$(T, lhs, rhs) {
  return T.$equal$$equal$(lhs, rhs);
}
const $Int$Equatable = {
  $equal$$equal$(lhs, rhs) {
    return lhs === rhs;
  },

  $not$$equal$(lhs, rhs) {
    return lhs !== rhs;
  },

  $tilde$$equal$(lhs, rhs) {
    return lhs === rhs;
  }

};
export function integerEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($Int$Equatable, lhs, rhs);
}
const $Double$question$$Equatable = {
  $equal$$equal$(lhs, rhs) {
    return lhs === rhs;
  },

  $not$$equal$(lhs, rhs) {
    return lhs !== rhs;
  },

  $tilde$$equal$(lhs, rhs) {
    return lhs === rhs;
  }

};
export function optionalDoubleEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($Double$question$$Equatable, lhs, rhs);
}
const $$open$String$close$$Equatable = {
  $equal$$equal$(lhs, rhs) {
    let equal;

    if (lhs.length !== rhs.length) {
      equal = false;
    } else {
      let i = 0;

      while (i < lhs.length && lhs[i] === rhs[i]) {
        i++;
      }

      equal = i === lhs.length;
    }

    return equal;
  },

  $not$$equal$(lhs, rhs) {
    let unequal;

    if (lhs.length !== rhs.length) {
      unequal = true;
    } else {
      let i = 0;

      while (i < lhs.length && lhs[i] === rhs[i]) {
        i++;
      }

      unequal = i !== lhs.length;
    }

    return unequal;
  },

  $tilde$$equal$(lhs, rhs) {
    let equal;

    if (lhs.length !== rhs.length) {
      equal = false;
    } else {
      let i = 0;

      while (i < lhs.length && lhs[i] === rhs[i]) {
        i++;
      }

      equal = i === lhs.length;
    }

    return equal;
  }

};
export function stringArrayEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($$open$String$close$$Equatable, lhs, rhs);
}
const $Point$Equatable = {
  $equal$$equal$(lhs, rhs) {
    return lhs.x === rhs.x && lhs.y === rhs.y;
  },

  $not$$equal$(lhs, rhs) {
    return !(lhs.x === rhs.x && lhs.y === rhs.y);
  },

  $tilde$$equal$(lhs, rhs) {
    return lhs.x === rhs.x && lhs.y === rhs.y;
  }

};
export function pointEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($Point$Equatable, lhs, rhs);
}
export function pointEqualDirect$lhs$rhs$(lhs, rhs) {
  return lhs.x === rhs.x && lhs.y === rhs.y;
}
export function pointNotEqualDirect$lhs$rhs$(lhs, rhs) {
  return !(lhs.x === rhs.x && lhs.y === rhs.y);
}
const $$open$Point$close$$Equatable = {
  $equal$$equal$(lhs, rhs) {
    let equal;

    if (lhs.length !== rhs.length) {
      equal = false;
    } else {
      let i = 0;

      while (i < lhs.length && lhs[i] === rhs[i]) {
        i++;
      }

      equal = i === lhs.length;
    }

    return equal;
  },

  $not$$equal$(lhs, rhs) {
    let unequal;

    if (lhs.length !== rhs.length) {
      unequal = true;
    } else {
      let i = 0;

      while (i < lhs.length && lhs[i] === rhs[i]) {
        i++;
      }

      unequal = i !== lhs.length;
    }

    return unequal;
  },

  $tilde$$equal$(lhs, rhs) {
    let equal;

    if (lhs.length !== rhs.length) {
      equal = false;
    } else {
      let i = 0;

      while (i < lhs.length && lhs[i] === rhs[i]) {
        i++;
      }

      equal = i === lhs.length;
    }

    return equal;
  }

};
export function pointArrayEqual$lhs$rhs$(lhs, rhs) {
  return equal$lhs$rhs$($$open$Point$close$$Equatable, lhs, rhs);
}