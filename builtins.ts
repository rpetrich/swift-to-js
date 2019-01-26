import { abstractMethod, noinline, returnFunctionType, wrapped, wrappedSelf, FunctionBuilder } from "./functions";
import { parseFunctionType } from "./parse";
import { primitive, protocol, withPossibleRepresentations, FunctionMap, PossibleRepresentation, TypeMap } from "./reified";
import { addVariable, lookup, uniqueName, DeclarationFlags, Scope } from "./scope";
import { Function } from "./types";
import { concat, lookupForMap } from "./utils";
import { array, binary, call, callable, conditional, conformance, expr, functionValue, ignore, isPure, literal, logical, member, read, reuse, set, statements, transform, tuple, typeTypeValue, typeValue, unary, undefinedValue, ArgGetter, Value } from "./values";

import { arrayBoundsFailed, Array as ArrayBuiltin } from "./builtins/Array";
import { Bool as BoolBuiltin } from "./builtins/Bool";
import { applyDefaultConformances, binaryBuiltin, cachedBuilder, resolveMethod, reuseArgs } from "./builtins/common";
import { Dictionary as DictionaryBuiltin } from "./builtins/Dictionary";
import { buildFloatingType } from "./builtins/floats";
import { buildIntegerType } from "./builtins/integers";
import { emptyOptional, optionalIsSome, unwrapOptional, wrapInOptional, Optional as OptionalBuiltin } from "./builtins/Optional";
import { String as StringBuiltin } from "./builtins/String";

import { arrayPattern, blockStatement, expressionStatement, forStatement, identifier, ifStatement, newExpression, objectExpression, objectProperty, returnStatement, throwStatement, updateExpression, variableDeclaration, variableDeclarator, whileStatement, Statement } from "@babel/types";

function unavailableFunction(scope: Scope, arg: ArgGetter, name: string): Value {
	throw new Error(`${name} is not available`);
}

function closedRangeIterate(range: Value, scope: Scope, body: (value: Value) => Statement): Statement[] {
	let end;
	const contents = [];
	const i = uniqueName(scope, "i");
	if (range.kind === "tuple" && range.values.length === 2) {
		contents.push(addVariable(scope, i, "Int", range.values[0]));
		const endExpression = read(range.values[1], scope);
		if (isPure(endExpression)) {
			end = expr(endExpression);
		} else {
			const endIdentifier = uniqueName(scope, "end");
			contents.push(addVariable(scope, endIdentifier, "Int", expr(endExpression)));
			end = lookup(endIdentifier, scope);
		}
	} else {
		addVariable(scope, i, "Int");
		const iExpression = read(lookup(i, scope), scope);
		if (iExpression.type !== "Identifier") {
			throw new TypeError(`Expected i to be an identifier, got a ${iExpression.type}`);
		}
		const endIdentifier = uniqueName(scope, "end");
		addVariable(scope, endIdentifier, "Int");
		const endIdentifierExpression = read(lookup(endIdentifier, scope), scope);
		if (endIdentifierExpression.type !== "Identifier") {
			throw new TypeError(`Expected end to be an identifier, got a ${endIdentifierExpression.type}`);
		}
		contents.push(variableDeclaration("const", [variableDeclarator(arrayPattern([iExpression, endIdentifierExpression]), read(range, scope))]));
		end = lookup(endIdentifier, scope);
	}
	const result = forStatement(
		contents.length === 1 ? contents[0] : undefined,
		read(binary("<=", lookup(i, scope), end, scope), scope),
		updateExpression("++", read(lookup(i, scope), scope)),
		body(lookup(i, scope)),
	);
	if (contents.length === 1) {
		return [result];
	} else {
		return concat(contents as Statement[], [result]);
	}
}

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

const dummyType = typeValue({ kind: "name", name: "Dummy" });

export interface BuiltinConfiguration {
	checkedIntegers: boolean;
	simpleStrings: boolean;
}

function defaultTypes({ checkedIntegers, simpleStrings }: BuiltinConfiguration): TypeMap {
	const protocolTypes: TypeMap = Object.create(null);
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

	const BoolType = cachedBuilder(BoolBuiltin);

	return {
		...protocolTypes,
		Bool: BoolType,
		Int1: BoolType,
		UInt: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 4294967295, 32, checkedIntegers, (value, scope) => binary(">>>", value, literal(0), scope))),
		Int: cachedBuilder((globalScope) => buildIntegerType(globalScope, -2147483648, 2147483647, 32, checkedIntegers, (value, scope) => binary("|", value, literal(0), scope))),
		UInt8: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 255, 8, checkedIntegers, (value, scope) => binary("&", value, literal(0xFF), scope))),
		Int8: cachedBuilder((globalScope) => buildIntegerType(globalScope, -128, 127, 8, checkedIntegers, (value, scope) => binary(">>", binary("<<", value, literal(24), scope), literal(24), scope))),
		UInt16: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 65535, 16, checkedIntegers, (value, scope) => binary("&", value, literal(0xFFFF), scope))),
		Int16: cachedBuilder((globalScope) => buildIntegerType(globalScope, -32768, 32767, 16, checkedIntegers, (value, scope) => binary(">>", binary("<<", value, literal(16), scope), literal(16), scope))),
		UInt32: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 4294967295, 32, checkedIntegers, (value, scope) => binary(">>>", value, literal(0), scope))),
		Int32: cachedBuilder((globalScope) => buildIntegerType(globalScope, -2147483648, 2147483647, 32, checkedIntegers, (value, scope) => binary("|", value, literal(0), scope))),
		UInt64: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, Number.MAX_SAFE_INTEGER, 53, checkedIntegers, (value) => value)), // 53-bit integers
		Int64: cachedBuilder((globalScope) => buildIntegerType(globalScope, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 53, checkedIntegers, (value) => value)), // 53-bit integers
		Float: cachedBuilder(buildFloatingType),
		Double: cachedBuilder(buildFloatingType),
		String: StringBuiltin(simpleStrings),
		StaticString: cachedBuilder(() => primitive(PossibleRepresentation.String, literal(""), {
		})),
		DefaultStringInterpolation: cachedBuilder((globalScope) => primitive(PossibleRepresentation.String, literal(""), {
			"init(literalCapacity:interpolationCount:)": wrapped(() => literal(""), `(Int, Int) -> Self`),
			"appendLiteral": wrapped((scope, arg, type, argTypes, outerArg) => {
				const interpolationArg = outerArg(0, "interpolation");
				const literalArg = arg(0, "literal");
				if (literalArg.kind === "expression" && literalArg.expression.type === "StringLiteral" && literalArg.expression.value === "") {
					return statements([]);
				} else {
					return set(interpolationArg, literalArg, scope, "+=");
				}
			}, `(String) -> Void`),
			"appendInterpolation": wrapped((scope, arg, type, argTypes, outerArg) => {
				return set(outerArg(1, "interpolation"), arg(0, "value"), scope, "+=");
			}, `(String) -> Void`),
		})),
		Character: cachedBuilder((globalScope) => {
			return primitive(PossibleRepresentation.String, literal(""), {
				"init(_:)": wrapped((scope, arg) => {
					return arg(0, "character");
				}, "(String) -> Character"),
				"==": wrapped(binaryBuiltin("===", 0), "(Character, Character) -> Bool"),
				"!=": wrapped(binaryBuiltin("!==", 0), "(Character, Character) -> Bool"),
				"<": wrapped(binaryBuiltin("<", 0), "(Character, Character) -> Bool"),
				"<=": wrapped(binaryBuiltin("<=", 0), "(Character, Character) -> Bool"),
				">": wrapped(binaryBuiltin(">", 0), "(Character, Character) -> Bool"),
				">=": wrapped(binaryBuiltin(">=", 0), "(Character, Character) -> Bool"),
			});
		}),
		Optional: OptionalBuiltin,
		// Should be represented as an empty struct, but we currently
		_OptionalNilComparisonType: cachedBuilder(() => primitive(PossibleRepresentation.Null, literal(null), {
			"init(nilLiteral:)": wrapped((scope, arg, type) => literal(null), "() -> _OptionalNilComparisonType"),
		}, Object.create(null), {
			Type: cachedBuilder(() => primitive(PossibleRepresentation.Undefined, undefinedValue)),
		})),
		Array: ArrayBuiltin,
		IndexingIterator: (globalScope, typeParameters) => {
			const [ elementsType ] = typeParameters("Elements");
			return {
				functions: lookupForMap({
					"init(_elements:)": wrapped((scope, arg) => {
						const collectionConformance = conformance(elementsType, "Collection", scope);
						const startIndexFunction = call(functionValue("startIndex", collectionConformance, "(Type) -> (Self) -> Self.Index"), [elementsType], ["Type"], scope);
						return transform(arg(0, "elements"), scope, (elementsValue) => {
							return expr(objectExpression([
								objectProperty(identifier("elements"), elementsValue),
								objectProperty(identifier("position"), read(call(startIndexFunction, [expr(elementsValue)], [elementsType], scope), scope)),
							]));
						});
					}, "(Self.Elements) -> Self"),
					"init(_elements:_position:)": wrapped((scope, arg) => {
						return transform(arg(0, "elements"), scope, (elementsValue) => {
							return transform(arg(1, "position"), scope, (positionValue) => {
								return expr(objectExpression([
									objectProperty(identifier("elements"), elementsValue),
									objectProperty(identifier("position"), positionValue),
								]));
							});
						});
					}, "(Self.Elements, Self.Elements.Index) -> Self"),
				}),
				conformances: withPossibleRepresentations(applyDefaultConformances({
					IteratorProtocol: {
						functions: {
							"next()": wrapped((scope, arg) => {
								return reuse(arg(0, "iterator"), scope, "iterator", (iterator) => {
									const collectionConformance = conformance(elementsType, "Collection", scope);
									const elementTypeFunction = call(functionValue("Element", collectionConformance, "(Type) -> () -> Type"), [elementsType], ["Type"], scope);
									const elementType = call(elementTypeFunction, [], [], scope);
									const endIndexFunction = call(functionValue("endIndex", collectionConformance, "(Type) -> (Self) -> Self.Index"), [elementsType], ["Type"], scope);
									return conditional(
										binary("===",
											member(iterator, "position", scope),
											call(endIndexFunction, [member(iterator, "elements", scope)], [elementsType], scope),
											scope,
										),
										emptyOptional(elementType, scope),
										wrapInOptional(member(member(iterator, "elements", scope), expr(updateExpression("++", read(member(iterator, "position", scope), scope))), scope), elementType, scope),
										scope,
									);
								});
							}, "(inout Self) -> Self.Element?"),
						},
						requirements: [],
					},
				}, globalScope), PossibleRepresentation.Object),
				defaultValue() {
					return tuple([]);
				},
				copy(value, scope) {
					return call(member(expr(identifier("Object")), "assign", scope), [literal({}), value], ["Self", "Self"], scope);
				},
				innerTypes: {},
			};
		},
		Dictionary: DictionaryBuiltin,
		Error: cachedBuilder((globalScope) => primitive(PossibleRepresentation.Number, literal(0), {
			hashValue(scope, arg) {
				return arg(0, "self");
			},
		})),
		ClosedRange: cachedBuilder((globalScope) => primitive(PossibleRepresentation.Array, tuple([literal(0), literal(0)]), {
		}, applyDefaultConformances({
			// TODO: Implement Equatable
			Equatable: {
				functions: {
					"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
				},
				requirements: [],
			},
			Sequence: {
				functions: {
					reduce: (scope, arg, type) => {
						const range = arg(2, "range");
						return callable((innerScope, innerArg) => {
							const result = uniqueName(innerScope, "result");
							const initialResult = innerArg(0, "initialResult");
							const next = innerArg(1, "next");
							return statements(concat(
								[addVariable(innerScope, result, dummyType, initialResult)],
								closedRangeIterate(range, innerScope, (i) => blockStatement(
									ignore(set(lookup(result, scope), call(next, [lookup(result, scope), i], [dummyType, dummyType], scope), scope), scope),
								)),
								[returnStatement(read(lookup(result, scope), scope))],
							));
						}, "(Result, (Result, Self.Element) -> Result) -> Result");
					},
				},
				requirements: [],
			},
			Collection: {
				functions: {
					map: (scope, arg, type) => {
						const range = arg(2, "range");
						return callable((innerScope, innerArg) => {
							const mapped = uniqueName(innerScope, "mapped");
							const callback = innerArg(0, "callback");
							return statements(concat(
								[addVariable(innerScope, mapped, dummyType, literal([]), DeclarationFlags.Const)],
								closedRangeIterate(range, innerScope, (i) => blockStatement(
									ignore(call(
										member(lookup(mapped, scope), "push", scope),
										[call(callback, [i], [dummyType], scope)],
										[dummyType],
										scope,
									), scope),
								)),
								[returnStatement(read(lookup(mapped, scope), scope))],
							));
						}, "((Self) -> V) -> [V]");
					},
				},
				requirements: [],
			},
		}, globalScope))),
		Hasher: cachedBuilder((globalScope) => primitive(PossibleRepresentation.Array, array([literal(0)], globalScope), {
			"combine()": wrapped((scope, arg) => {
				return reuseArgs(arg, 0, scope, ["hasher"], (hasher) => {
					return set(
						member(hasher, 0, scope),
						binary("-",
							binary("+",
								binary("<<",
									member(hasher, 0, scope),
									literal(5),
									scope,
								),
								arg(1, "value"), // TODO: Call hashValue
								scope,
							),
							member(hasher, 0, scope),
							scope,
						),
						scope,
					);
				});
			}, "(inout Hasher, Int) -> Void"),
			"finalize()": wrapped((scope, arg) => {
				return binary("|", member(arg(0, "hasher"), 0, scope), literal(0), scope);
			}, "(Hasher) -> Int"),
		})),
	};
}

function throwHelper(type: "Error" | "TypeError" | "RangeError", text: string) {
	return noinline((scope, arg) => statements([throwStatement(newExpression(identifier(type), [literal(text).expression]))]), "() throws -> Void");
}

export const functions: FunctionMap = {
	"Swift.(swift-to-js).numericRangeFailed()": throwHelper("RangeError", "Not enough bits to represent the given value"),
	"Swift.(swift-to-js).forceUnwrapFailed()": throwHelper("TypeError", "Unexpectedly found nil while unwrapping an Optional value"),
	"Swift.(swift-to-js).arrayBoundsFailed()": throwHelper("RangeError", "Array index out of range"),
	"Swift.(swift-to-js).stringBoundsFailed()": throwHelper("RangeError", "String index out of range"),
	"Swift.(swift-to-js).notImplemented()": throwHelper("Error", "Not implemented!"),
	"Swift.(swift-to-js).arrayInsertAt()": noinline((scope, arg) => {
		return statements([
			ifStatement(
				read(logical("||",
					binary(">",
						arg(2, "i"),
						member(arg(0, "array"), "length", scope),
						scope,
					),
					binary("<",
						arg(2, "i"),
						literal(0),
						scope,
					),
					scope,
				), scope),
				blockStatement(
					ignore(arrayBoundsFailed(scope), scope),
				),
				blockStatement(
					ignore(call(
						// TODO: Remove use of splice, since it's slow
						member(arg(0, "array"), "splice", scope),
						[
							arg(2, "i"),
							literal(0),
							arg(1, "newElement"),
						],
						[
							"Int",
							"Int",
							"Any",
						],
						scope,
					), scope),
				),
			),
		]);
	}, "(inout Self, Self.Element, Int) -> Void"),
	"Swift.(swift-to-js).arrayRemoveAt()": noinline((scope, arg) => {
		return statements([
			ifStatement(
				read(logical("||",
					binary(">=",
						arg(1, "i"),
						member(arg(0, "array"), "length", scope),
						scope,
					),
					binary("<",
						arg(1, "i"),
						literal(0),
						scope,
					),
					scope,
				), scope),
				blockStatement(
					ignore(arrayBoundsFailed(scope), scope),
				),
			),
			// TODO: Remove use of splice, since it's slow
			returnStatement(
				read(member(
					call(
						member(arg(0, "array"), "splice", scope),
						[
							arg(1, "i"),
							literal(1),
						],
						[
							"Int",
							"Int",
						],
						scope,
					),
					literal(0),
					scope,
				), scope),
			),
		]);
	}, "(inout Self, Int) -> Self.Element"),
	"Sequence.reduce": (scope, arg, type) => callable((innerScope, innerArg) => {
		return call(expr(identifier("Sequence$reduce")), [arg(0), arg(1)], [dummyType, dummyType], scope);
	}, "(Result, (Result, Self.Element) -> Result) -> Result"),
	"??": (scope, arg, type) => {
		const typeArg = arg(0, "type");
		if (typeArg.kind !== "type") {
			throw new TypeError(`Expected a type, got a ${typeArg.kind}`);
		}
		return reuseArgs(arg, 1, scope, ["lhs"], (lhs) => {
			return conditional(
				optionalIsSome(lhs, typeArg, scope),
				unwrapOptional(lhs, typeArg, scope),
				call(arg(2, "rhs"), [], [], scope),
				scope,
			);
		});
	},
	"~=": (scope, arg) => {
		const T = arg(0, "T");
		const result = call(functionValue("~=", conformance(T, "Equatable", scope), "(T.Type) -> (T, T) -> Bool"), [T], [dummyType], scope);
		return call(result, [arg(1, "pattern"), arg(2, "value")], [T, T], scope);
	},
	"print(_:separator:terminator:)": (scope, arg, type) => call(member("console", "log", scope), [arg(0, "items")], [dummyType], scope),
	"precondition(_:_:file:line:)": (scope, arg, type) => statements([
		ifStatement(
			read(unary("!", call(arg(0, "condition"), [], [], scope), scope), scope),
			blockStatement([
				expressionStatement(identifier("debugger")),
				throwStatement(newExpression(identifier("Error"), [
					read(call(arg(1, "message"), [], [], scope), scope),
					read(arg(2, "file"), scope),
					read(arg(3, "line"), scope),
				])),
			]),
		),
	]),
	"preconditionFailed(_:file:line:)": (scope, arg, type) => statements([
		expressionStatement(identifier("debugger")),
		throwStatement(newExpression(identifier("Error"), [
			read(call(arg(0, "message"), [], [], scope), scope),
			read(arg(1, "file"), scope),
			read(arg(2, "line"), scope),
		])),
	]),
	"fatalError(_:file:line:)": (scope, arg, type) => statements([
		expressionStatement(identifier("debugger")),
		throwStatement(newExpression(identifier("Error"), [
			read(call(arg(0, "message"), [], [], scope), scope),
			read(arg(1, "file"), scope),
			read(arg(2, "line"), scope),
		])),
	]),
	"isKnownUniquelyReferenced": () => literal(false),
	"withExtendedLifetime": (scope, arg) => call(arg(3, "body"), [
		arg(2, "preserve"),
	], ["Any"], scope),
	"withUnsafePointer": unavailableFunction,
	"withUnsafeMutablePointer": unavailableFunction,
	"withUnsafeBytes": unavailableFunction,
	"withUnsafeMutableBytes": unavailableFunction,
	"unsafeDowncast(to:)": unavailableFunction,
	"unsafeBitCast(to:)": unavailableFunction,
	"withVaList": unavailableFunction,
	"getVaList": unavailableFunction,
	"swap": (scope, arg) => {
		const type = arg(0, "type");
		const a = arg(1, "a");
		const b = arg(2, "b");
		const temp = uniqueName(scope, "temp");
		return statements(concat(
			[addVariable(scope, temp, type, a, DeclarationFlags.Const)],
			ignore(set(a, b, scope), scope),
			ignore(set(b, lookup(temp, scope), scope), scope),
		));
	},
};

export function newScopeWithBuiltins(): Scope {
	return {
		name: "global",
		declarations: Object.create(null),
		types: defaultTypes({
			checkedIntegers: false,
			simpleStrings: true,
		}),
		functions: Object.assign(Object.create(null), functions),
		functionUsage: Object.create(null),
		mapping: Object.create(null),
		parent: undefined,
	};
}
