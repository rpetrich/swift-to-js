var js = require("./estree.js");
var esprima = require("esprima");

const structType = fields => ({ personality: "struct", fields: fields });
const enumType = cases => ({ personality: "enum", cases: cases });
const classType = () => ({ personality: "class" });
const protocolType = () => ({ personality: "protocol" });
const field = (name, type) => ({ name: name, type: type });

const functionBuiltin = definition => {
	return (input, functionContext) => {
		var codegen = functionContext.codegen;
		if (!codegen.emittedFunctions[input.builtinName]) {
			codegen.emittedFunctions[input.builtinName] = true;
			codegen.body.push(esprima.parse("function " + input.builtinName + definition).body[0]);
		}
		return js.call(js.identifier(input.builtinName), input.localNames.map(js.mangledLocal));
	};
}

const truncateToInt1 = result => js.binary("!=", result, js.literal(0));
const truncateToInt8 = result => js.binary("&", result, js.literal(0xFF));
const truncateToInt16 = result => js.binary("&", result, js.literal(0xFFFF));
const truncateToInt32 = result => js.binary("|", result, js.literal(0));
//const truncateToInt64 = result => js.binary("%", result, js.literal(Number.MAX_SAFE_INTEGER)); // 53 bit integers? o_O
const truncateToInt64 = result => result;

const truncateToFloat32 = (result, functionContext) => {
	var codegen = functionContext.codegen;
	if (!codegen.emittedFunctions["fround"]) {
		codegen.emittedFunctions["fround"] = true;
		var nativeImplementation = js.member(js.identifier("Math"), js.literal("fround"));
		var valueIdentifier = js.identifier("value");
		// Polyfill doesn't technically perform the float truncation, but there's not much we can do about that
		var polyfillImplementation = js.functionExpression([valueIdentifier], [js.returnStatement(valueIdentifier)]);
		codegen.body.push(js.declaration(js.identifier("fround"), js.binary("||", nativeImplementation, polyfillImplementation)));
	}
	return js.call(js.identifier("fround"), [result]);
};
const truncateToFloat64 = result => result;

const wrapInOverflowCheck = (expression, truncate, functionContext) => {
	const resultVar = functionContext.tempVariable();
	const truncatedVar = functionContext.tempVariable();
	const arithmeticOperation = js.assignment(resultVar, expression);
	const truncateOperation = js.assignment(truncatedVar, truncate(resultVar, functionContext));
	const checkOperation = js.binary("!=", truncatedVar, resultVar);
	return js.sequence([arithmeticOperation, truncateOperation, js.array([truncatedVar, checkOperation])]);
}

const unaryOperation = operation => (input, functionContext) => js.unary(operation, js.mangledLocal(input.localNames[0]));
const binaryOperation = operation => (input, functionContext) => js.binary(operation, js.mangledLocal(input.localNames[0]), js.mangledLocal(input.localNames[1]));

const checkedForOverflow = (operation, truncate) => (input, functionContext) => wrapInOverflowCheck(operation(input, functionContext), truncate, functionContext);

const truncateOnOverflow = (operation, truncate) => (input, functionContext) => truncate(operation(input, functionContext), functionContext);

const asPure = builtin => {
	builtin.pure = true;
	return builtin;
}

const passthrough = asPure((input, functionContext) => js.mangledLocal(input.localNames[0]));

module.exports = {
	"types": {
		"Int": structType([field("_value")]),
		"Int8": structType([field("_value")]),
		"Int16": structType([field("_value")]),
		"Int32": structType([field("_value")]),
		"Int64": structType([field("_value")]),
		"UInt": structType([field("_value")]),
		"UInt8": structType([field("_value")]),
		"UInt16": structType([field("_value")]),
		"UInt32": structType([field("_value")]),
		"UInt64": structType([field("_value")]),
		"Bool": structType([field("_value")]),
		"UTF16": structType([field("_value")]),
		"Float": structType([field("_value")]),
		"Double": structType([field("_value")]),
		"UnicodeScalar": structType([field("_value")]),
		"COpaquePointer": structType([field("_value")]),
		"_GraphemeClusterBreakPropertyRawValue": structType([field("rawValue")]),
		"_StringCore": structType([field("_baseAddress"), field("_countAndFlags"), field("_owner")]),
		"String": structType([field("_core")]),
		"StaticString": structType([field("_startPtrOrData"), field("_utf8CodeUnitCount"), field("_flags")]),
		"UnsafePointer": structType([field("_rawValue")]),
		"UnsafeMutablePointer": structType([field("_rawValue")]),
		"UnsafeMutableRawPointer": structType([field("_rawValue")]),
		"UnsafeBufferPointer": structType([field("_position"), field("_end")]),
		"UnsafeRawPointer": structType([field("_rawValue")]),
		"AutoreleasingUnsafeMutablePointer": structType([field("_rawValue")]),
		"ManagedBufferPointer": structType([field("_nativeBuffer")]),
		"ContiguousArray": structType([field("_buffer")]),
		"_ContiguousArrayBuffer": structType([field("__bufferPointer")]),
		"_HeapBuffer": structType([field("_storage")]),
		"_StringBuffer": structType([field("_storage")]),
		"_SwiftArrayBodyStorage": structType([field("count")]),
		"_ArrayBody": structType([field("_storage")]),
		"_BridgeStorage": structType([field("rawValue")]),
		"_ArrayBuffer": structType([field("_storage")]),
		"_StringBufferIVars": structType([field("usedEnd"), field("capacityAndElementShift")]),
		"Array": structType([field("_buffer")]),
		"_DependenceToken": structType([]),
		"Range": structType([field("startIndex"), field("endIndex")]),
		"AnyHashable": structType([field("_box")]),
		"_HasCustomAnyHashableRepresentation": protocolType(),
		"_AnyHashableBox": protocolType(),
		"Any": protocolType(),
		"ObjectIdentifier": structType([field("_rawValue")]),
		"_ConcreteHashableBox": structType([field("_baseHashable")]),
		"Base": protocolType(), // Generics fail :'(
		"T": protocolType(), // Generics fail :'(
		"Optional": enumType(["none", "some"]),
		"ImplicitlyUnwrappedOptional": enumType(["none", "some"]),
		"_ClosedRangeIndexRepresentation": enumType(["pastEnd", "inRange"]),
		"FloatingPointSign": enumType(["minus", "plus"]),
		"FloatingPointRoundingRule": enumType(["awayFromZero", "down", "toNearestOrAwayFromZero", "toNearestOrEven", "towardZero", "up"]),
		"FloatingPointClassification": enumType(["negativeInfinity", "negativeNormal", "negativeSubnormal", "negativeZero", "positiveInfinity", "positiveNormal", "positiveSubnormal", "positiveZero", "quietNaN", "signalingNaN"]),
	},
	"builtins": {
		"passthrough": passthrough,
		// Integer
		"_TFSdCfT22_builtinIntegerLiteralBi2048__Sd": functionBuiltin("(val, metatype) { return val }"),
		// Int32
		"sadd_with_overflow_Int32": asPure(checkedForOverflow(binaryOperation("+"), truncateToInt32)),
		"sadd_with_truncate_Int32": asPure(truncateOnOverflow(binaryOperation("+"), truncateToInt32)),
		"uadd_with_overflow_Int32": asPure(checkedForOverflow(binaryOperation("+"), truncateToInt32)), // TODO: Implement unsigned
		"uadd_with_truncate_Int32": asPure(truncateOnOverflow(binaryOperation("+"), truncateToInt32)), // TODO: Implement unsigned
		"ssub_with_overflow_Int32": asPure(checkedForOverflow(binaryOperation("-"), truncateToInt32)),
		"ssub_with_truncate_Int32": asPure(truncateOnOverflow(binaryOperation("-"), truncateToInt32)),
		"usub_with_overflow_Int32": asPure(checkedForOverflow(binaryOperation("-"), truncateToInt32)), // TODO: Implement unsigned
		"usub_with_truncate_Int32": asPure(truncateOnOverflow(binaryOperation("-"), truncateToInt32)), // TODO: Implement unsigned
		"smul_with_overflow_Int32": asPure(checkedForOverflow(binaryOperation("*"), truncateToInt32)),
		"smul_with_truncate_Int32": asPure(truncateOnOverflow(binaryOperation("*"), truncateToInt32)),
		"sdiv_Int32": asPure(functionBuiltin("(left, right) { return (left / right) | 0 }")),
		"srem_Int32": asPure(binaryOperation("%")), // Returns modulus, not remainder. Close enough for now
		"cmp_sgt_Int32": asPure(binaryOperation(">")),
		"cmp_sge_Int32": asPure(binaryOperation(">=")),
		"cmp_slt_Int32": asPure(binaryOperation("<")),
		"cmp_sle_Int32": asPure(binaryOperation("<=")),
		"cmp_ule_Int32": asPure(binaryOperation("<=")),
		"cmp_eq_Int32": asPure(binaryOperation("==")),
		"cmp_ne_Int32": asPure(binaryOperation("!=")),
		"shl_Int32": asPure(binaryOperation("<<")),
		"lshr_Int32": asPure(binaryOperation(">>")), // TODO: Implement shift right correctly
		"ashr_Int32": asPure(binaryOperation(">>")), // TODO: Implement shift right correctly
		"and_Int32": asPure(binaryOperation("&")),
		"or_Int32": asPure(binaryOperation("|")),
		"xor_Int32": asPure(binaryOperation("^")),
		"truncOrBitCast_Word_Int32": passthrough,
		"zext_Int8_Int32": passthrough,
		"zext_Int16_Int32": passthrough,
		"s_to_u_checked_conversion_Int32": asPure(checkedForOverflow(passthrough, truncateToInt32)), // TODO: Implement checked conversions
		"s_to_u_unchecked_conversion_Int32": asPure(truncateOnOverflow(passthrough, truncateToInt32)),
		"u_to_s_checked_conversion_Int32": asPure(checkedForOverflow(passthrough, truncateToInt32)), // TODO: Implement checked conversions
		"u_to_s_unchecked_conversion_Int32": asPure(truncateOnOverflow(passthrough, truncateToInt32)),
		"truncOrBitCast_Int64_Word": asPure(truncateOnOverflow(passthrough, truncateToInt32)),
		"assumeNonNegative_Int32": passthrough,
		// Int64
		"zext_Int32_Int64": passthrough,
		"sext_Int32_Int64": passthrough,
		"sadd_with_overflow_Int64": asPure(checkedForOverflow(binaryOperation("+"), truncateToInt64)),
		"sadd_with_truncate_Int64": asPure(truncateOnOverflow(binaryOperation("+"), truncateToInt64)),
		"uadd_with_overflow_Int64": asPure(checkedForOverflow(binaryOperation("+"), truncateToInt64)),
		"ssub_with_overflow_Int64": asPure(checkedForOverflow(binaryOperation("-"), truncateToInt64)),
		"ssub_with_truncate_Int64": asPure(truncateOnOverflow(binaryOperation("-"), truncateToInt64)),
		"usub_with_overflow_Int64": asPure(checkedForOverflow(binaryOperation("-"), truncateToInt64)),
		"s_to_s_checked_trunc_Int64_Int32": asPure(checkedForOverflow(passthrough, truncateToInt32)),
		"s_to_s_unchecked_trunc_Int64_Int32": asPure(truncateOnOverflow(passthrough, truncateToInt32)),
		"bitcast_FPIEEE64_Int64": passthrough, // TODO: Implement bit casts
		"s_to_u_checked_conversion_Int64": passthrough,
		"and_Int64": asPure(binaryOperation("&")), // Not 64-bit
		"or_Int64": asPure(binaryOperation("|")), // Not 64-bit
		"lshr_Int64": asPure(binaryOperation(">>")), // Not 64-bit
		"shl_Int64": asPure(binaryOperation("<<")), // Not 64-bit
		"srem_Int64": asPure(binaryOperation("%")), // Returns modulus, not remainder. Close enough for now
		"cmp_ugt_Int64": asPure(binaryOperation(">")),
		"cmp_uge_Int64": asPure(binaryOperation(">=")),
		"cmp_ult_Int64": asPure(binaryOperation("<")),
		"cmp_eq_Int64": asPure(binaryOperation("==")),
		"cmp_ne_Int64": asPure(binaryOperation("!=")),
		"cmp_slt_Int64": asPure(binaryOperation("<")),
		"cmp_sge_Int64": asPure(binaryOperation(">=")),
		"cmp_sgt_Int64": asPure(binaryOperation(">")),
		"int_ctlz_Int64": passthrough, // TODO: Implement count leading zeros
		// Int16
		"zext_Int8_Int16": passthrough,
		"cmp_ugt_Int16": asPure(binaryOperation(">")),
		"cmp_eq_Int16": asPure(binaryOperation("==")),
		"shl_Int16": asPure(functionBuiltin("(left, right) { return (left << right) & 0xFF }")),
		"and_Int16": asPure(binaryOperation("&")),
		"s_to_u_checked_trunc_Int32_Int16": asPure(checkedForOverflow(passthrough, truncateToInt16)),
		"uadd_with_overflow_Int16": asPure(checkedForOverflow(binaryOperation("+"), truncateToInt16)),
		"uadd_with_truncate_Int16": asPure(truncateOnOverflow(binaryOperation("+"), truncateToInt16)),
		"umul_with_overflow_Int16": asPure(checkedForOverflow(binaryOperation("*"), truncateToInt16)),
		"umul_with_truncate_Int16": asPure(truncateOnOverflow(binaryOperation("*"), truncateToInt16)),
		// Int8
		"u_to_u_checked_trunc_Int16_Int8": asPure(checkedForOverflow(passthrough, truncateToInt8)),
		"cmp_eq_Int8": asPure(binaryOperation("==")),
		"cmp_ne_Int8": asPure(binaryOperation("!=")),
		"and_Int8": asPure(binaryOperation("&")),
		"or_Int8": asPure(binaryOperation("|")),
		// Float32
		"fcmp_oeq_FPIEEE32": asPure(binaryOperation("==")),
		"fcmp_one_FPIEEE32": asPure(binaryOperation("!=")),
		"fadd_FPIEEE32": asPure(truncateOnOverflow(binaryOperation("+"), truncateToFloat32)),
		"fsub_FPIEEE32": asPure(truncateOnOverflow(binaryOperation("-"), truncateToFloat32)),
		"fmul_FPIEEE32": asPure(truncateOnOverflow(binaryOperation("*"), truncateToFloat32)),
		// Float64
		"fcmp_oeq_FPIEEE64": asPure(binaryOperation("==")),
		"fcmp_one_FPIEEE64": asPure(binaryOperation("!=")),
		"fcmp_olt_FPIEEE64": asPure(binaryOperation("<")),
		"fcmp_ole_FPIEEE64": asPure(binaryOperation("<=")),
		"fcmp_ogt_FPIEEE64": asPure(binaryOperation(">")),
		"fadd_FPIEEE64": asPure(truncateOnOverflow(binaryOperation("+"), truncateToFloat64)),
		"fsub_FPIEEE64": asPure(truncateOnOverflow(binaryOperation("-"), truncateToFloat64)),
		"fmul_FPIEEE64": asPure(truncateOnOverflow(binaryOperation("*"), truncateToFloat64)),
		"fadd_FPIEEE64": asPure(truncateOnOverflow(binaryOperation("+"), truncateToFloat64)),
		"fsub_FPIEEE64": asPure(truncateOnOverflow(binaryOperation("-"), truncateToFloat64)),
		"fmul_FPIEEE64": asPure(truncateOnOverflow(binaryOperation("*"), truncateToFloat64)),
		"fneg_FPIEEE64": asPure(unaryOperation("-")),
		"fdiv_FPIEEE64": asPure(truncateOnOverflow(binaryOperation("/"), truncateToFloat64)),
		"frem_FPIEEE64": asPure(truncateOnOverflow(binaryOperation("%"), truncateToFloat64)),
		"int_fma_FPIEEE64": asPure((input, functionContext) => js.binary("+", js.binary("*", js.mangledLocal(input.localNames[0]), js.mangledLocal(input.localNames[1])), js.mangledLocal(input.localNames[2]))),
		"int_fabs_FPIEEE64": asPure((input, functionContext) => js.call(js.property(js.identifier("Math"), "abs"), [js.mangledLocal(input.localNames[0])])),
		"int_round_FPIEEE64": asPure((input, functionContext) => js.call(js.property(js.identifier("Math"), "round"), [js.mangledLocal(input.localNames[0])])),
		"int_rint_FPIEEE64": asPure((input, functionContext) => js.call(js.property(js.identifier("Math"), "round"), [js.mangledLocal(input.localNames[0])])),
		"int_trunc_FPIEEE64": asPure((input, functionContext) => js.call(js.property(js.identifier("Math"), "trunc"), [js.mangledLocal(input.localNames[0])])),
		"int_floor_FPIEEE64": asPure((input, functionContext) => js.call(js.property(js.identifier("Math"), "floor"), [js.mangledLocal(input.localNames[0])])),
		"int_ceil_FPIEEE64": asPure((input, functionContext) => js.call(js.property(js.identifier("Math"), "ceil"), [js.mangledLocal(input.localNames[0])])),
		"_TZFsoi2eeFTSdSd_Sb": asPure(binaryOperation("==")),
		"_TZFsoi1pFTSdSd_Sd": asPure(binaryOperation("+")),
		"_TZFsoi1sFTSdSd_Sd": asPure(binaryOperation("-")),
		"_TZFsoi1mFTSdSd_Sd": asPure(binaryOperation("*")),
		"uitofp_Int8_FPIEEE64": passthrough,
		"sitofp_Int8_FPIEEE64": passthrough,
		"uitofp_Int16_FPIEEE64": passthrough,
		"sitofp_Int16_FPIEEE64": passthrough,
		"uitofp_Int32_FPIEEE64": passthrough,
		"sitofp_Int32_FPIEEE64": passthrough,
		"uitofp_Int64_FPIEEE64": passthrough,
		"sitofp_Int64_FPIEEE64": passthrough,
		"bitcast_Int64_FPIEEE64": passthrough, // TODO: Implement bit casts
		// Pointers (unsound!)
		"inttoptr_Int8": passthrough,
		"cmp_eq_RawPointer": asPure(binaryOperation("==")), // TODO: To different pointers derived from the same field of the same object should resolve to equal
		"strideof_nonzero": asPure(input => js.literal(1)),
		"sizeof": asPure(input => js.literal(1)),
		"alignof": asPure(input => js.literal(1)),
		"ptrtoint_Word": asPure(input => js.literal(0)), // Our pointers don't cast to integers!
		"cmpxchg_seqcst_seqcst_RawPointer": functionBuiltin("(target, expected, desired) { var oldValue = target[0]; var won = oldValue == expected; if (won) { target[0] = desired; } return won }"),
		"cmpxchg_seqcst_seqcst_Word": functionBuiltin("(target, expected, desired) { var oldValue = target.ref[target.field]; var success = oldValue === expected; if (success) { target.ref[target.field] = desired; } return [ oldValue, success ]; }"),
		"int_memcpy_RawPointer_RawPointer_Int64": functionBuiltin("(dest, src, size, alignment, volatile) { }"),
		"_swift_stdlib_malloc_size": asPure(input => js.literal(0)), // WAT
		// Booleans
		"xor_Int1": asPure(functionBuiltin("(left, right) { return (left ^ right) != 0 }")),
		"or_Int1": asPure(functionBuiltin("(left, right) { return left || right }")),
		"and_Int1": asPure(functionBuiltin("(left, right) { return left && right }")),
		"int_expect_Int1": passthrough,
		"_TZFsoi2aauRxs11BooleanTyperFzTxKzT_Sb_Sb": functionBuiltin("(left, right) { return left && right }"),
		// Words,
		"sub_Word": functionBuiltin("(left, right) { return (left - right) | 0 }"),
		"zextOrBitCast_Int32_Word": passthrough,
		// Functions
		"onFastPath": asPure(input => js.literal(undefined)),
		"once": (input, functionContext) => {
			const token = js.unbox(js.mangledLocal(input.localNames[0]));
			return js.binary("||", token, js.sequence([assignment(token, literal(true)), js.call(js.mangledLocal(input.localNames[1]))]));
		},
		"swift_bufferAllocate": functionBuiltin("(bufferType, size, alignMask) { return { ref:[], field:0 } }"),
		"_TTSf4g_n___TFs19_cocoaStringReadAllFTPs9AnyObject_GSpVs6UInt16__T_": functionBuiltin("(source, dest) { }"), // TODO
		"_TTSfq4g_n___TFs19_cocoaStringReadAllFTPs9AnyObject_GSpVs6UInt16__T_": functionBuiltin("(source, dest) { }"), // TODO
		"_TF10ObjectiveC22_convertObjCBoolToBoolFVS_8ObjCBoolSb": functionBuiltin("(value) { return this }"),
		"_TF10ObjectiveC22_convertBoolToObjCBoolFSbVS_8ObjCBool": functionBuiltin("(value) { return value }"),
		"_swift_stdlib_makeAnyHashableUpcastingToHashableBaseType": functionBuiltin("(value, result) {}"),
		// Int
		"_TZFsoi1pFTSiSi_Si": functionBuiltin("(left, right) { return (left + right) | 0 }"),
		// Generic numeric types
		"_TZFsop1suRxs16SignedNumberTyperFxx": functionBuiltin("(outNumber, inNumber) { outNumber.ref[outNumber.field] = -inNumber.ref[inNumber.field] }"),
		"copyArray": functionBuiltin("(type, dest, source, count) {}"),
		// Error handling
		"willThrow": functionBuiltin("(error) { throw error }"),
		"trap": functionBuiltin("() { throw \"Runtime error!\" }"),
		"unexpectedError": functionBuiltin("(error) { throw error }"),
		"_TFs18_fatalErrorMessageFTVs12StaticStringS_S_Su5flagsVs6UInt32_Os5Never": functionBuiltin("(prefix, message, file, line, flags) { throw console.log(prefix + message + \" in \" + file + \":\" + line) }"),
	},
	functions: {
		"_swift_stdlib_squareRoot": js.declaration(js.identifier("_swift_stdlib_squareRoot"), js.property(js.identifier("Math"), "sqrt")),
		"_swift_stdlib_remainder": js.functionDeclaration(js.identifier("_swift_stdlib_remainder"), [js.identifier("a"), js.identifier("b")], [js.returnStatement(js.binary("%", js.identifier("a"), js.identifier("b")))]),
		"_swift_stdlib_makeAnyHashableUpcastingToHashableBaseType": js.functionDeclaration(js.identifier("_swift_stdlib_makeAnyHashableUpcastingToHashableBaseType"), [js.identifier("value"), js.identifier("result")], []),
		"_TFE10FoundationSS19_bridgeToObjectiveCfT_CSo8NSString": js.functionDeclaration(js.identifier("_TFE10FoundationSS19_bridgeToObjectiveCfT_CSo8NSString"), [], [js.returnStatement(js.identifier("this"))]),
		"_TZFE10FoundationSS36_unconditionallyBridgeFromObjectiveCfGSqCSo8NSString_SS": js.functionDeclaration(js.identifier("_TZFE10FoundationSS36_unconditionallyBridgeFromObjectiveCfGSqCSo8NSString_SS"), [js.identifier("string")], [js.returnStatement(js.identifier("string"))]),
		"_getDocument": js.functionDeclaration(js.identifier("_getDocument"), [], [js.returnStatement(js.identifier("document"))]),
		"swift_convertNSErrorToError": js.functionDeclaration(js.identifier("swift_convertNSErrorToError"), [js.identifier("error")], [js.returnStatement(js.identifier("error"))]),
		"swift_bufferAllocate": js.functionDeclaration(js.identifier("swift_bufferAllocate"), [js.identifier("type"), js.identifier("size"), js.identifier("alignmentMask")], [js.returnStatement(js.array([]))]),
		"_TTSfq4g__swiftweb_bufferSize": js.functionDeclaration(js.identifier("_TTSfq4g__swiftweb_bufferSize"), [js.identifier("buffer")], [js.returnStatement(js.property(js.identifier("buffer"), "length"))]),
		"swiftweb_stringConcat": js.functionDeclaration(js.identifier("swiftweb_stringConcat"), [js.identifier("left"), js.identifier("right")], [js.returnStatement(js.binary("+", js.identifier("left"), js.identifier("right")))]),
		"swiftweb_stringToLowerCase": js.functionDeclaration(js.identifier("swiftweb_stringToLowerCase"), [], [js.returnStatement(js.call(js.property(js.identifier("this"), "toLowerCase"), []))]),
		"swiftweb_stringToUpperCase": js.functionDeclaration(js.identifier("swiftweb_stringToUpperCase"), [], [js.returnStatement(js.call(js.property(js.identifier("this"), "toUpperCase"), []))]),
		"swiftweb_stringLength": js.functionDeclaration(js.identifier("swiftweb_stringLength"), [], [js.returnStatement(js.property(js.identifier("this"), "length"))]),
		// "swiftweb_arrayAllocate": js.functionDeclaration(js.identifier("swiftweb_arrayAllocate"), [js.identifier("count")], [js.expressionStatement(js.assignment(js.identifier("count"), js.call(js.identifier("Array"), [js.identifier("count")]))), js.returnStatement(js.array([js.identifier("count"), js.box(js.identifier("count"), js.literal(0))]))]),
		// "swiftweb_arrayLength": js.functionDeclaration(js.identifier("swiftweb_arrayLength"), [], [js.returnStatement(js.property(js.identifier("this"), "length"))]),
		"_swift_stdlib_strlen": js.functionDeclaration(js.identifier("_swift_stdlib_strlen"), [js.identifier("string")], [js.returnStatement(js.property(js.identifier("string"), "length"))]),
	},
};
