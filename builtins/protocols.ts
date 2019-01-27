import { abstractMethod, returnFunctionType, wrapped, wrappedSelf, FunctionBuilder } from "../functions";
import { parseFunctionType } from "../parse";
import { protocol, TypeMap } from "../reified";
import { addVariable, lookup, uniqueName, Scope } from "../scope";
import { Function } from "../types";
import { concat } from "../utils";
import { binary, call, callable, conditional, conformance, functionValue, ignore, literal, logical, read, reuse, set, statements, tuple, typeTypeValue, typeValue, unary, ArgGetter, Value } from "../values";

import { resolveMethod, reuseArgs } from "./common";
import { emptyOptional, wrapInOptional } from "./Optional";

import { blockStatement, forStatement, returnStatement, whileStatement } from "@babel/types";

function toTypeTypeValue() {
	return typeTypeValue;
}

function adaptedMethod(otherMethodName: string, conformanceName: string | undefined, otherType: Function | string, adapter: (otherValue: Value, scope: Scope, type: Value, arg: ArgGetter) => Value, ourType: Function | string, typeArgCount: number = 1) {
	const ourFunctionType = parseFunctionType(ourType);
	return wrapped((scope, arg, type, typeValues, outerArg) => {
		const conformedType = typeof conformanceName !== "undefined" ? conformance(type, conformanceName, scope) : type;
		const types: Value[] = ourFunctionType.arguments.types.map((_, i) => outerArg(i));
		const typeTypes: Value[] = ourFunctionType.arguments.types.map(toTypeTypeValue);
		const otherMethod = call(functionValue(otherMethodName, conformedType, otherType), types, typeTypes, scope);
		return adapter(otherMethod, scope, type, arg);
	}, returnFunctionType(ourFunctionType));
}

function updateMethod(otherMethodName: string, conformanceName: string | undefined) {
	return adaptedMethod(otherMethodName, conformanceName, "(Self, Self) -> Self", (targetMethod, scope, type, arg) => {
		const lhs = arg(0, "lhs");
		const rhs = arg(1, "rhs");
		return set(lhs, call(targetMethod, [lhs, rhs], [type, type], scope), scope);
	}, "(Self.Type) -> (inout Self, Self) -> Void");
}

export function addDefaultProtocols(protocolTypes: TypeMap) {
	function addProtocol(name: string, functionMap: { [functionName: string]: FunctionBuilder } = Object.create(null), ...requirements: string[]) {
		const result = protocol(name, {
			[name]: {
				functions: functionMap,
				requirements,
			},
		});
		protocolTypes[name] = () => result;
	}

	addProtocol("Object", {
		":rep": abstractMethod,
	});
	addProtocol("Equatable", {
		"==": abstractMethod,
		"!=": adaptedMethod("==", "Equatable", "(Self, Self) -> Bool", (equalsMethod, scope, type, arg) => unary("!", call(equalsMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope), scope), "(Self.Type) -> (Self, Self) -> Bool"),
		"~=": adaptedMethod("==", "Equatable", "(Self, Self) -> Bool", (equalsMethod, scope, type, arg) => call(equalsMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope), "(Self.Type) -> (Self, Self) -> Bool"),
	});
	addProtocol("Comparable", {
		"<": abstractMethod,
		">": adaptedMethod("<", "Comparable", "(Self, Self) -> Bool", (lessThanMethod, scope, type, arg) => call(lessThanMethod, [arg(1, "rhs"), arg(0, "lhs")], [type, type], scope), "(Self.Type) -> (Self, Self) -> Bool"),
		"<=": adaptedMethod("<", "Comparable", "(Self, Self) -> Bool", (lessThanMethod, scope, type, arg) => unary("!", call(lessThanMethod, [arg(1, "rhs"), arg(0, "lhs")], [type, type], scope), scope), "(Self.Type) -> (Self, Self) -> Bool"),
		">=": adaptedMethod("<", "Comparable", "(Self, Self) -> Bool", (lessThanMethod, scope, type, arg) => unary("!", call(lessThanMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope), scope), "(Self.Type) -> (Self, Self) -> Bool"),
		"...": wrapped((scope, arg) => tuple([arg(0, "minimum"), arg(1, "maximum")]), "(Self, Self) -> Range<Self>"),
	}, "Equatable");
	addProtocol("ExpressibleByNilLiteral", {
		"init(nilLiteral:)": abstractMethod,
	});
	addProtocol("ExpressibleByBooleanLiteral", {
		"init(booleanLiteral:)": abstractMethod,
	});
	addProtocol("ExpressibleByIntegerLiteral", {
		"init(integerLiteral:)": abstractMethod,
	});
	addProtocol("ExpressibleByFloatLiteral", {
		"init(floatLiteral:)": abstractMethod,
	});
	addProtocol("ExpressibleByUnicodeScalarLiteral", {
		"init(unicodeScalarLiteral:)": abstractMethod,
	});
	addProtocol("ExpressibleByExtendedGraphemeClusterLiteral", {
		"init(extendedGraphemeClusterLiteral:)": abstractMethod,
	});
	addProtocol("ExpressibleByStringLiteral", {
		"init(stringLiteral:)": abstractMethod,
	});
	addProtocol("ExpressibleByArrayLiteral", {
		"init(arrayLiteral:)": abstractMethod,
	});
	addProtocol("ExpressibleByDictionaryLiteral", {
		"init(dictionaryLiteral:)": abstractMethod,
	});
	addProtocol("AdditiveArithmetic", {
		"zero": abstractMethod,
		"+": abstractMethod,
		"+=": updateMethod("+", "AdditiveArithmetic"),
		"-": abstractMethod,
		"-=": updateMethod("-", "AdditiveArithmetic"),
	}, "Equatable", "ExpressibleByIntegerLiteral");
	addProtocol("Numeric", {
		"init(exactly:)": abstractMethod,
		"*": abstractMethod,
		"*=": updateMethod("*", "Numeric"),
	}, "Equatable", "ExpressibleByIntegerLiteral", "AdditiveArithmetic");
	addProtocol("SignedNumeric", {
		"-": adaptedMethod("-", "Numeric", "(Self, Self) -> Self", (subtractMethod, scope, type, arg) => {
			// TODO: Call ExpressibleByIntegerLiteral
			return call(subtractMethod, [literal(0), arg(0, "self")], ["Int", type], scope);
		}, "(Self.Type) -> (Self) -> Self"),
		"negate": adaptedMethod("-", "SignedNumeric", "(Self, Self) -> Self", (negateMethod, scope, type, arg) => {
			return reuseArgs(arg, 0, scope, ["self"], (self) => {
				return set(self, call(negateMethod, [self], [type], scope), scope);
			});
		}, "(Self.Type) -> (inout Self) -> Void"),
	}, "Numeric");
	addProtocol("BinaryInteger", {
		"init(exactly:)": abstractMethod,
		"init(truncatingIfNeeded:)": abstractMethod,
		"init(clamping:)": abstractMethod,
		"/": abstractMethod,
		"/=": updateMethod("/", "BinaryInteger"),
		"%": abstractMethod,
		"%=": updateMethod("%", "BinaryInteger"),
		"+": abstractMethod,
		"+=": updateMethod("+", "BinaryInteger"),
		"-": abstractMethod,
		"-=": updateMethod("-", "BinaryInteger"),
		"*": abstractMethod,
		"*=": updateMethod("*", "BinaryInteger"),
		"~": abstractMethod,
		"&": abstractMethod,
		"&=": updateMethod("&", "BinaryInteger"),
		"|": abstractMethod,
		"|=": updateMethod("|", "BinaryInteger"),
		"^": abstractMethod,
		"^=": updateMethod("^", "BinaryInteger"),
		">>": abstractMethod,
		">>=": updateMethod(">>", "BinaryInteger"),
		"<<": abstractMethod,
		"<<=": updateMethod("<<", "BinaryInteger"),
		"quotientAndRemainder(dividingBy:)": abstractMethod,
		"signum": abstractMethod,
		"isSigned": abstractMethod,
	}, "CustomStringConvertible", "Hashable", "Numeric", "Strideable");
	addProtocol("SignedInteger", {
		"max": abstractMethod,
		"min": abstractMethod,
		"&+": abstractMethod,
		"&-": abstractMethod,
	}, "BinaryInteger", "SignedNumeric");
	addProtocol("UnsignedInteger", {
		max: abstractMethod,
		min: abstractMethod,
		magnitude: abstractMethod,
	}, "BinaryInteger", "SignedNumeric");
	addProtocol("FixedWidthInteger", {
		"max": abstractMethod,
		"min": abstractMethod,
		"init(_:radix:)": abstractMethod,
		"init(clamping:)": adaptedMethod("init(clamping:)", "BinaryInteger", "(T) -> T", (targetMethod, scope, type, arg) => {
			return call(targetMethod, [arg(0, "value")], ["T"], scope);
		}, "(Self.Type, T.Type) -> (T) -> Self"),
		"init(bigEndian:)": adaptedMethod("byteSwapped", "FixedWidthInteger", "(Self) -> Self", (targetMethod, scope, type, arg) => {
			return call(targetMethod, [arg(0, "value")], ["Self"], scope);
		}, "(Self.Type) -> (Self) -> Self"),
		"init(littleEndian:)": wrapped((scope, arg) => {
			return arg(0, "value");
		}, "(Self.Type) -> (Self) -> Self"),
		"bigEndian": abstractMethod,
		"byteSwapped": abstractMethod,
		"leadingZeroBitCount": abstractMethod,
		"littleEndian": abstractMethod,
		"nonzeroBitCount": abstractMethod,
		"bitWidth": abstractMethod,
		"addingReportingOverflow(_:)": abstractMethod,
		"dividedReportingOverflow(by:)": abstractMethod,
		"dividingFullWidth(_:)": abstractMethod,
		"multipliedFullWidth(by:)": abstractMethod,
		"multipliedReportingOverflow(by:)": abstractMethod,
		"remainderReportingOverflow(dividingBy:)": abstractMethod,
		"subtractingReportingOverflow(_:)": abstractMethod,
		"&*": abstractMethod,
		"&*=": updateMethod("&*", "FixedWidthInteger"),
		"&+": abstractMethod,
		"&+=": updateMethod("&+", "FixedWidthInteger"),
		"&-": abstractMethod,
		"&-=": updateMethod("&-", "FixedWidthInteger"),
		"&<<": abstractMethod,
		"&<<=": updateMethod("&<<", "FixedWidthInteger"),
		"&>>": abstractMethod,
		"&>>=": updateMethod("&>>", "FixedWidthInteger"),
	}, "BinaryInteger", "LosslessStringConvertible");
	addProtocol("FloatingPoint", {
		"init(_:)": abstractMethod,
		// properties
		"exponent": abstractMethod,
		"floatingPointClass": abstractMethod,
		"isCanonical": abstractMethod,
		"isFinite": abstractMethod,
		"isInfinite": abstractMethod,
		"isNaN": abstractMethod,
		"isSignalingNaN": abstractMethod,
		"isSubnormal": abstractMethod,
		"isZero": abstractMethod,
		"nextDown": abstractMethod,
		"nextUp": abstractMethod,
		"sign": abstractMethod,
		"significand": abstractMethod,
		"ulp": abstractMethod,
		// static properties
		"greatestFiniteMagnitude": abstractMethod,
		"infinity": abstractMethod,
		"leastNonzeroMagnitude": abstractMethod,
		"leastNormalMagnitude": abstractMethod,
		"nan": abstractMethod,
		"pi": abstractMethod,
		"radix": abstractMethod,
		"signalingNaN": abstractMethod,
		"ulpOfOne": abstractMethod,
		// methods
		"addProduct(_:_:)": abstractMethod,
		"addingProduct(_:_:)": abstractMethod,
		"formRemainder(dividingBy:)": abstractMethod,
		"formSquareRoot(_:)": abstractMethod,
		"formTruncatingRemainder(dividingBy:)": abstractMethod,
		"isEqual(to:)": abstractMethod,
		"isLess(than:)": abstractMethod,
		"isLessThanOrEqualTo(_:)": abstractMethod,
		"isTotallyOrdered(belowOrEqualTo:)": abstractMethod,
		"negate()": abstractMethod,
		"remainder(dividingBy:)": abstractMethod,
		"round()": abstractMethod,
		"round(_:)": abstractMethod,
		"rounded()": abstractMethod,
		"rounded(_:)": abstractMethod,
		"squareRoot()": abstractMethod,
		"truncatingRemainder(dividingBy:)": abstractMethod,
		// static methods
		"maximum(_:_:)": abstractMethod,
		"maximumMagnitude(_:_:)": abstractMethod,
		"minimum(_:_:)": abstractMethod,
		"minimumMagnitude(_:_:)": abstractMethod,
		// operators
		"*": abstractMethod,
		"*=": abstractMethod,
		"+": abstractMethod,
		"+=": abstractMethod,
		"-": abstractMethod,
		"-=": abstractMethod,
		"/": abstractMethod,
		"/=": abstractMethod,
		"==": abstractMethod,
	}, "Hashable", "SignedNumeric", "Strideable");
	addProtocol("BinaryFloatingPoint", {
		// initializers
		"init(_:)": abstractMethod,
		"init(exactly:)": abstractMethod,
		"init(sign:exponentBitPattern:significandBitPattern:)": abstractMethod,
		// properties
		"binade": abstractMethod,
		"exponentBitPattern": abstractMethod,
		"significandBitPattern": abstractMethod,
		"significandWidth": abstractMethod,
		// static properties
		"exponentBitCount": abstractMethod,
		"significandBitCount": abstractMethod,
	}, "ExpressibleByFloatLiteral", "FloatingPoint");
	addProtocol("IteratorProtocol", {
		"next()": abstractMethod,
	});
	addProtocol("Sequence", {
		"makeIterator()": abstractMethod,
		"contains(_:)": adaptedMethod("contains(where:)", "Sequence", "(Self, (Self.Element) -> Bool) -> Bool", (containsWhere, scope, type, arg) => {
			return call(
				containsWhere,
				[
					arg(0, "sequence"),
					callable((innerScope, innerArg) => {
						// TODO: Check if equal
						return literal(true);
					}, "(Self.Element) -> Bool"),
				],
				[
					"Self",
					"(Self.Element) -> Bool",
				],
				scope,
			);
		}, "(Self.Type) -> (Self, Self.Element) -> Bool"),
		"contains(where:)": abstractMethod,
		"first(where:)": abstractMethod,
		"min()": abstractMethod,
		"min(by:)": abstractMethod,
		"max()": abstractMethod,
		"max(by:)": abstractMethod,
		"dropFirst()": abstractMethod,
		"dropLast()": abstractMethod,
		"sorted()": abstractMethod,
		"sorted(by:)": abstractMethod,
		"reversed()": abstractMethod,
		"underestimatedCount": abstractMethod,
		"allSatisfy(_:)": abstractMethod,
		"reduce": abstractMethod,
	});
	addProtocol("Collection", {
		"Element": abstractMethod,
		"subscript(_:)": abstractMethod,
		"startIndex": abstractMethod,
		"endIndex": abstractMethod,
		"index(after:)": abstractMethod,
		"index(_:offsetBy:)": wrappedSelf((scope, arg, type, collection) => {
			const collectionType = conformance(type, "Collection", scope);
			const indexType = typeValue("Self.Index");
			return reuseArgs(arg, 0, scope, ["index", "distance"], (index, distance) => {
				const current = uniqueName(scope, "current");
				const i = uniqueName(scope, "i");
				return statements([
					addVariable(scope, current, "Self.Index", index),
					forStatement(
						addVariable(scope, i, "Int", literal(0)),
						read(binary("<", lookup(i, scope), distance, scope), scope),
						read(set(lookup(i, scope), literal(1), scope, "+="), scope),
						blockStatement(
							ignore(
								set(
									lookup(current, scope),
									call(
										resolveMethod(collectionType, "index(after:)", scope, [collection], [type]),
										[lookup(current, scope)],
										[indexType],
										scope,
									),
									scope,
								),
								scope,
							),
						),
					),
					returnStatement(read(lookup(current, scope), scope)),
				]);
			});
		}, "(Self, Self.Index, Int) -> Self.Index"),
		"index(_:offsetBy:limitedBy:)": wrappedSelf((scope, arg, type, collection) => {
			const collectionType = conformance(type, "Collection", scope);
			const indexType = typeValue("Self.Index");
			return reuseArgs(arg, 0, scope, ["index", "distance", "limit"], (index, distance, limit) => {
				const current = uniqueName(scope, "current");
				const i = uniqueName(scope, "i");
				return statements([
					addVariable(scope, current, "Self.Index", index),
					forStatement(
						addVariable(scope, i, "Int", literal(0)),
						read(logical("&&",
							binary("<", lookup(i, scope), distance, scope),
							call(
								resolveMethod(conformance(indexType, "Equatable", scope), "!=", scope),
								[lookup(current, scope), limit],
								[indexType, indexType],
								scope,
							),
							scope,
						), scope),
						read(set(lookup(i, scope), literal(1), scope, "+="), scope),
						blockStatement(
							ignore(
								set(
									lookup(current, scope),
									call(
										resolveMethod(collectionType, "index(after:)", scope, [collection], [type]),
										[lookup(current, scope)],
										[indexType],
										scope,
									),
									scope,
								),
								scope,
							),
						),
					),
					returnStatement(read(lookup(current, scope), scope)),
				]);
			});
		}, "(Self, Self.Index, Int, Self.Index) -> Self.Index"),
		"distance(from:to:)": wrappedSelf((scope, arg, type, collection) => {
			const collectionType = conformance(type, "Collection", scope);
			const indexType = typeValue("Self.Index");
			const indexTypeEquatable = conformance(indexType, "Equatable", scope);
			return reuseArgs(arg, 0, scope, ["start", "end"], (start, end) => {
				const current = uniqueName(scope, "current");
				const count = uniqueName(scope, "count");
				return statements([
					addVariable(scope, current, "Self.Index", start),
					addVariable(scope, count, "Int", literal(0)),
					whileStatement(
						read(call(
							resolveMethod(indexTypeEquatable, "!=", scope),
							[lookup(current, scope), end],
							[indexType, indexType],
							scope,
						), scope),
						blockStatement(concat(
							ignore(set(lookup(count, scope), literal(1), scope, "+="), scope),
							ignore(
								set(
									lookup(current, scope),
									call(
										resolveMethod(collectionType, "index(after:)", scope, [collection], [type]),
										[lookup(current, scope)],
										[indexType],
										scope,
									),
									scope,
								),
								scope,
							),
						)),
					),
					returnStatement(read(lookup(count, scope), scope)),
				]);
			});
		}, "(Self, Self.Index, Self.Index) -> Int"),
		"count": wrapped((scope, arg, type) => {
			return reuseArgs(arg, 0, scope, ["collection"], (collection) => {
				const collectionType = conformance(type, "Collection", scope);
				const indexType = typeValue("Self.Index");
				return call(
					call(
						functionValue("distance(from:to:)", collectionType, "(Type, Self) -> (Self.Index, Self.Index) -> Self.Index"),
						[type, collection],
						["Type", type],
						scope,
					),
					[
						call(resolveMethod(collectionType, "startIndex", scope), [collection], ["Self"], scope),
						call(resolveMethod(collectionType, "endIndex", scope), [collection], ["Self"], scope),
					],
					[
						indexType,
						indexType,
					],
					scope,
				);
			});
		}, "(Self) -> Int"),
		"formIndex(after:)": wrapped((scope, arg, type) => {
			const indexType = typeValue("Self.Index");
			const collectionType = conformance(type, "Collection", scope);
			return reuseArgs(arg, 0, scope, ["collection", "index"], (collection, index) => {
				return set(
					index,
					call(
						resolveMethod(collectionType, "index(after:)", scope, [collection], [type]),
						[index],
						[indexType],
						scope,
					),
					scope,
				);
			});
		}, "(Self, inout Self.Index) -> Void"),
		"formIndex(_:offsetBy:)": wrapped((scope, arg, type) => {
			const indexType = typeValue("Self.Index");
			const collectionType = conformance(type, "Collection", scope);
			return reuseArgs(arg, 0, scope, ["collection", "index", "distance"], (collection, index, distance) => {
				return set(
					index,
					call(
						resolveMethod(collectionType, "index(_:offsetBy:)", scope, [collection], [type]),
						[index, distance],
						[indexType, "Int"],
						scope,
					),
					scope,
				);
			});
		}, "(Self, inout Self.Index, Int) -> Void"),
		"formIndex(_:offsetBy:limitedBy:)": wrapped((scope, arg, type) => {
			const indexType = typeValue("Self.Index");
			const collectionType = conformance(type, "Collection", scope);
			return reuseArgs(arg, 0, scope, ["collection", "index", "distance", "limit"], (collection, index, distance, limit) => {
				return set(
					index,
					call(
						resolveMethod(collectionType, "index(_:offsetBy:limitedBy:)", scope, [collection], [type]),
						[index, distance, limit],
						[indexType, "Int", indexType],
						scope,
					),
					scope,
				);
			});
		}, "(Self, inout Self.Index, Int, Self.Index) -> Void"),
		"lazy": abstractMethod,
		"first": wrapped((scope, arg, type) => {
			return reuseArgs(arg, 0, scope, ["collection"], (collection) => {
				const collectionType = conformance(type, "Collection", scope);
				const elementType = typeValue("Self.Element");
				return conditional(
					call(resolveMethod(collectionType, "isEmpty", scope), [collection], ["Self"], scope),
					wrapInOptional(
						call(
							resolveMethod(collectionType, "subscript(_:)", scope),
							[collection, call(resolveMethod(collectionType, "startIndex", scope), [collection], ["Self"], scope)],
							["Self", "Self.Index"],
							scope,
						),
						elementType,
						scope,
					),
					emptyOptional(elementType, scope),
					scope,
				);
			});
		}, "(Self) -> Self.Element?"),
		"isEmpty": wrapped((scope, arg, type) => {
			return reuseArgs(arg, 0, scope, ["collection"], (collection) => {
				const collectionType = conformance(type, "Collection", scope);
				const indexType = typeValue("Self.Index");
				return call(
					resolveMethod(conformance(indexType, "Equatable", scope), "!=", scope),
					[
						call(resolveMethod(collectionType, "endIndex", scope), [collection], ["Self"], scope),
						call(resolveMethod(collectionType, "startIndex", scope), [collection], ["Self"], scope),
					],
					[
						indexType,
						indexType,
					],
					scope,
				);
			});
		}, "(Self) -> Bool"),
		"makeIterator()": abstractMethod,
		"prefix(upTo:)": abstractMethod,
		"prefix(through:)": wrappedSelf((scope, arg, type, self) => {
			const collectionType = conformance(type, "Collection", scope);
			const indexType = typeValue("Self.Index");
			return reuseArgs(arg, 0, scope, ["position"], (position) => {
				return call(
					call(
						functionValue("prefix(upTo:)", collectionType, "(Collection) -> (Self.Index) -> Self.SubSequence"),
						[type, self],
						["Type", type],
						scope,
					),
					[
						call(
							resolveMethod(collectionType, "index(after:)", scope, [self], [type]),
							[position],
							[indexType],
							scope,
						),
					],
					[
						indexType,
					],
					scope,
				);
			});
		}, "(Self, Self.Index) -> Self.SubSequence"),
	}, "Sequence");
	addProtocol("BidirectionalCollection", {
		"index(before:)": abstractMethod,
		"formIndex(before:)": wrapped((scope, arg, type) => {
			const indexType = typeValue("Self.Index");
			const collectionType = conformance(type, "BidirectionalCollection", scope);
			return reuseArgs(arg, 0, scope, ["collection", "index"], (collection, index) => {
				return set(
					index,
					call(
						resolveMethod(collectionType, "index(before:)", scope, [collection], [type]),
						[index],
						[indexType],
						scope,
					),
					scope,
				);
			});
		}, "(Self, inout Self.Index) -> Void"),
	}, "Collection");
	addProtocol("Strideable", {
		"+": abstractMethod,
		"+=": updateMethod("+", "Strideable"),
		"-": abstractMethod,
		"-=": updateMethod("-", "Strideable"),
		"==": abstractMethod,
		"...": abstractMethod,
		"distance(to:)": adaptedMethod("-", "Strideable", "(Self, Self) -> Self", (subtractMethod, scope, type, arg) => {
			return call(subtractMethod, [arg(1, "rhs"), arg(0, "lhs")], [type, type], scope);
		}, "(Self.Type) -> (Self, Self) -> Bool"),
		"advanced(by:)": adaptedMethod("+", "Strideable", "(Self, Self) -> Self", (addMethod, scope, type, arg) => {
			return call(addMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope);
		}, "(Self.Type) -> (Self, Self) -> Bool"),
	}, "Comparable");
	addProtocol("Hashable", {
		"hashValue": abstractMethod,
		"hash(into:)": adaptedMethod("hashValue", "Hashable", "(Self) -> Int", (hashValueMethod, scope, type, arg) => {
			return reuse(call(hashValueMethod, [arg(0, "self")], ["Self"], scope), scope, "hashValue", (hashValue) => {
				const hasherType = typeValue("Hasher");
				const combine = call(functionValue("combine()", hasherType, "(Type) -> (inout Hasher, Int) -> Void"), [hasherType], [typeTypeValue], scope);
				return call(combine, [arg(1, "hasher"), hashValue], ["Hasher", "Int"], scope);
			});
		}, "(Self.Type) -> (Self, inout Hasher) -> Bool"),
	}, "Equatable");
	addProtocol("CustomStringConvertible", {
		description: abstractMethod,
	});
	addProtocol("LosslessStringConvertible", {
		"init(_:)": abstractMethod,
	}, "CustomStringConvertible");
}
