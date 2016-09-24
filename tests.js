var assert = require("assert");

var swift = require("./test.swift.js");

if (swift.increment_until_zero) {
	assert.ok(swift.increment_until_zero(-2) == -1, "increment_until_zero(-2)");
	assert.ok(swift.increment_until_zero(-1) == 0, "increment_until_zero(-1)");
	assert.ok(swift.increment_until_zero(0) == 0, "increment_until_zero(0)");
}

if (swift.decrement_until_zero) {
	assert.ok(swift.decrement_until_zero(2) == 1, "decrement_until_zero(2)");
	assert.ok(swift.decrement_until_zero(1) == 0, "decrement_until_zero(1)");
	assert.ok(swift.decrement_until_zero(0) == 0, "decrement_until_zero(0)");
}

if (swift.negate) {
	assert.ok(swift.negate(0) === 0, "negate(0)");
	assert.ok(swift.negate(1) === -1, "negate(1)");
	assert.ok(swift.negate(-1) === 1, "negate(-1)");
	assert.ok(swift.negate(-2147483648) === -2147483648, "negate(-2147483648)"); // Modular arithmetic overflow
}

if (swift.factorial_iterative) {
	assert.ok(swift.factorial_iterative(0) == 1, "factorial_iterative(0)");
	assert.ok(swift.factorial_iterative(1) == 1, "factorial_iterative(1)");
	assert.ok(swift.factorial_iterative(2) == 2, "factorial_iterative(2)");
	assert.ok(swift.factorial_iterative(16) == 2004189184, "factorial_iterative(16)");
}

if (swift.factorial_recursive) {
	assert.ok(swift.factorial_recursive(0) == 1, "factorial_recursive(0)");
	assert.ok(swift.factorial_recursive(1) == 1, "factorial_recursive(1)");
	assert.ok(swift.factorial_recursive(2) == 2, "factorial_recursive(2)");
	assert.ok(swift.factorial_recursive(16) == 2004189184, "factorial_recursive(16)");
}

if (swift.silly_math) {
	assert.ok(swift.silly_math(2) == 65536, "silly_math(2)");
	assert.ok(swift.silly_math(3) == 43046721, "silly_math(3)");
	assert.ok(swift.silly_math(-2) == 65536, "silly_math(-2)");
}

if (swift.more_silly_math) {
	assert.ok(swift.more_silly_math(0) == 4, "more_silly_math(0)");
	assert.ok(swift.more_silly_math(1) == -996, "silly_math(1)");
	assert.ok(swift.more_silly_math(-1) == -996, "silly_math(-1)");
	assert.ok(swift.more_silly_math(8) == -7996, "silly_math(8)");
}

if (swift.optional_from) {
	assert.ok(swift.optional_from(1) === true, "optional_from(1)");
	assert.ok(swift.optional_from(0) === false, "optional_from(0)");
	assert.ok(swift.optional_from(-1) === undefined, "optional_from(-1)");
}

if (swift.description_of) {
	assert.ok(swift.description_of(true) == "True", "description_of(true)");
	assert.ok(swift.description_of(false) == "False", "description_of(false)");
	assert.ok(swift.description_of(undefined) == "None", "description_of(undefined)");
}

if (swift.has_value) {
	assert.ok(swift.has_value(true) === true, "has_value(true)");
	assert.ok(swift.has_value(false) === true, "has_value(false)");
	assert.ok(swift.has_value(undefined) === false, "has_value(undefined)");
}

if (swift.hello_world) {
	assert.ok(swift.hello_world() === "Hello World!", "hello_world()");
}

if (swift.string_length) {
	assert.ok(swift.string_length("Hello") === 5, "string_length(\"Hello\")");
}

if (swift.select_value) {
	assert.ok(swift.select_value(0)[0] == 3, "select_value(0)");
	assert.ok(swift.select_value(2)[0] == 0, "select_value(2)");
	assert.ok(swift.select_value(3)[0] == 1, "select_value(3)");
	assert.ok(swift.select_value(5)[0] == 2, "select_value(5)");
	assert.ok(swift.select_value(15)[0] == 3, "select_value(15)");
}

if (swift.getOrigin) {
	assert.ok(swift.getOrigin().x === 0, "getOrigin().x");
	assert.ok(swift.getOrigin().y === 0, "getOrigin().y");
}

if (swift.distance) {
	assert.ok(swift.distance({x: 0, y: 0}, { x: 3, y: 4 }) === 5, "distance({x: 0, y: 0}, { x: 3, y: 4 })");
	assert.ok(swift.distance({x: 2, y: -2}, { x: 5, y: 2 }) === 5, "distance({x: 2, y: -2}, { x: 5, y: 2 })");
}

if (swift.IntHolder && swift.newValue) {
	assert.ok(swift.newValue(1) instanceof swift.IntHolder, "newValue(1) instanceof IntHolder");
}
