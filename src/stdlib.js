module.exports = {
	"types": {
		"Int": ["_value"],
		"UInt": ["_value"],
		"UInt8": ["_value"],
		"UInt16": ["_value"],
		"UInt32": ["_value"],
		"Int32": ["_value"],
		"Bool": ["_value"],
		"UTF16": ["_value"],
		"Float": ["_value"],
		"Double": ["_value"],
		"UnicodeScalar": ["_value"],
		"COpaquePointer": ["_value"],
		"_GraphemeClusterBreakPropertyRawValue": ["rawValue"],
		"_StringCore": ["_baseAddress", "_countAndFlags", "_owner"],
		"String": ["_core"],
		"UnsafePointer": ["_rawValue"],
		"UnsafeMutablePointer": ["_rawValue"],
		"UnsafeMutableRawPointer": ["_rawValue"],
		"UnsafeBufferPointer": ["_position", "_end"],
		"UnsafeRawPointer": ["_rawValue"],
		"_HeapBuffer": ["_storage"],
		"_StringBuffer": ["_storage"],
		"_SwiftArrayBodyStorage": ["count", "_capacityAndFlags"],
		"_ArrayBody": ["_storage"],
		"_BridgeStorage": ["rawValue"],
		"_ArrayBuffer": ["_storage"],
		"_StringBufferIVars": ["usedEnd", "capacityAndElementShift"],
		"Array": ["_buffer"],
		"Range": ["startIndex", "endIndex"],
		"Point": ["x", "y"],
	},
	"enums": {
		"Optional": ["none", "some", "None", "Some"], // Temporary to support both Swift 2 and Swift 3
		"ImplicitlyUnwrappedOptional": ["none", "some"],
	},
	"builtins": {
		// Int32
		"sadd_with_overflow_Int32": "(left, right, overflow_check) { var result = left + right; var truncated = result | 0; return [truncated, false] }",
		"uadd_with_overflow_Int32": "(left, right, overflow_check) { var result = left + right; var truncated = result | 0; return [truncated, false] }", // TODO: Implement unsigned
		"ssub_with_overflow_Int32": "(left, right, overflow_check) { var result = left - right; var truncated = result | 0; return [truncated, false] }",
		"usub_with_overflow_Int32": "(left, right, overflow_check) { var result = left - right; var truncated = result | 0; return [truncated, false] }", // TODO: Implement unsigned
		"smul_with_overflow_Int32": "(left, right, overflow_check) { var result = left * right; var truncated = result | 0; return [truncated, false] }",
		// "sadd_with_overflow_Int32": "(left, right, overflow_check) { var result = left + right; var truncated = result | 0; return [truncated, result != truncated] }",
		// "uadd_with_overflow_Int32": "(left, right, overflow_check) { var result = left + right; var truncated = result | 0; return [truncated, result != truncated] }", // TODO: Implement unsigned
		// "ssub_with_overflow_Int32": "(left, right, overflow_check) { var result = left - right; var truncated = result | 0; return [truncated, result != truncated] }",
		// "usub_with_overflow_Int32": "(left, right, overflow_check) { var result = left - right; var truncated = result | 0; return [truncated, result != truncated] }", // TODO: Implement unsigned
		// "smul_with_overflow_Int32": "(left, right, overflow_check) { var result = left * right; var truncated = result | 0; return [truncated, result != truncated] }",
		"sdiv_Int32": "(left, right) { return (left / right) | 0 }",
		"cmp_sgt_Int32": "(left, right) { return left > right }",
		"cmp_sge_Int32": "(left, right) { return left >= right }",
		"cmp_slt_Int32": "(left, right) { return left < right }",
		"cmp_sle_Int32": "(left, right) { return left <= right }",
		"cmp_ule_Int32": "(left, right) { return left <= right }",
		"cmp_eq_Int32": "(left, right) { return left == right }",
		"cmp_ne_Int32": "(left, right) { return left != right }",
		"shl_Int32": "(value, count) { return value << count }",
		"lshr_Int32": "(value, count) { return value >> count }", // TODO: Implement shift right correctly
		"ashr_Int32": "(value, count) { return value >> count }", // TODO: Implement shift right correctly
		"and_Int32": "(left, right) { return left & right }",
		"or_Int32": "(left, right) { return left | right }",
		"xor_Int32": "(left, right) { return left ^ right }",
		"truncOrBitCast_Word_Int32": "(value) { return value }",
		"zext_Int8_Int32": "(value) { return value }",
		"zext_Int16_Int32": "(value) { return value }",
		"s_to_u_checked_conversion_Int32": "(value) { return [value, false] }",
		"u_to_s_checked_conversion_Int32": "(value) { return [value, false] }",
		"assumeNonNegative_Int32": "(value) { return value }",
		// Int64
		"zext_Int32_Int64": "(value) { return value }",
		"sext_Int32_Int64": "(value) { return value }",
		"sadd_with_overflow_Int64": "(left, right, overflow) { return [left + right, false] }",
		"s_to_s_checked_trunc_Int64_Int32": "(value) { return [value | 0, 0] }",
		// Int16
		"zext_Int8_Int16": "(value) { return value }",
		"cmp_ugt_Int16": "(left, right) { return left > right }",
		"cmp_eq_Int16": "(left, right) { return left == right }",
		"shl_Int16": "(left, right) { return (left << right) & 0xFF }",
		"and_Int16": "(left, right) { return left & right }",
		"s_to_u_checked_trunc_Int32_Int16": "(value) { return value & 0xFFFF }",
		"uadd_with_overflow_Int16": "(left, right, overflow) { return [(left + right) & 0xFFFF, 0] }",
		"umul_with_overflow_Int16": "(left, right, overflow) { return [(left * right) & 0xFFFF, 0] }",
		// Int8
		"u_to_u_checked_trunc_Int16_Int8": "(value) { return value & 0xFF }",
		"cmp_eq_Int8": "(left, right) { return left == right }",
		"cmp_ne_Int8": "(left, right) { return left != right }",
		"and_Int8": "(left, right) { return left & right }",
		"or_Int8": "(left, right) { return left | right }",
		// Float64
		"fcmp_oeq_FPIEEE64": "(left, right) { return left == right }",
		"fadd_FPIEEE64": "(left, right) { return left - right }",
		"fsub_FPIEEE64": "(left, right) { return left - right }",
		"fmul_FPIEEE64": "(left, right) { return left * right }",
		"_TZFsoi2eeFTSdSd_Sb": "(left, right) { return left == right }",
		"_TZFsoi1pFTSdSd_Sd": "(left, right) { return left + right }",
		"_TZFsoi1sFTSdSd_Sd": "(left, right) { return left - right }",
		"_TZFsoi1mFTSdSd_Sd": "(left, right) { return left * right }",
		"sqrt": "Math.sqrt",
		// Pointers (unsound!)
		"inttoptr_Int8": "(value) { return value }",
		"cmp_eq_RawPointer": "(left, right) { return left == right }",
		"strideof_nonzero": "(type) { return 1 }",
		"sizeof": "(type) { return 1 }",
		"alignof": "(type) { return 1 }",
		"ptrtoint_Word": "(pointer) { return 0 }",
		"cmpxchg_seqcst_seqcst_RawPointer": "(target, expected, desired) { var oldValue = target[0]; var won = oldValue == expected; if (won) { target[0] = desired; } return won }",
		"cmpxchg_seqcst_seqcst_Word": "(target, expected, desired) { var oldValue = target[\"ref\"][target[\"field\"]]; var success = oldValue === expected; if (success) { target[\"ref\"][target[\"field\"]] = desired; } return [ oldValue, success ]; }",
		"int_memcpy_RawPointer_RawPointer_Int64": "(dest, src, size, alignment, volatile) { }",
		"_swift_stdlib_malloc_size": "(buffer) { return 0 }",
		// Booleans
		"xor_Int1": "(left, right) { return left ^ right }",
		"or_Int1": "(left, right) { return left | right }",
		"int_expect_Int1": "(value, expected) { return value }",
		"_TZFsoi2aauRxs11BooleanTyperFzTxKzT_Sb_Sb": "(left, right) { return left && right }",
		// Words,
		"sub_Word": "(left, right) { return (left - right) | 0 }",
		"zextOrBitCast_Int32_Word": "(value) { return value }",
		// Functions
		"onFastPath": "() {}",
		"swift_bufferAllocate": "(bufferType, size, alignMask) { return { \"ref\":[], \"field\":0 } }",
		"_TTSf4g_n___TFs19_cocoaStringReadAllFTPs9AnyObject_GSpVs6UInt16__T_": "(source, dest) { }", // TODO
		"_TTSfq4g_n___TFs19_cocoaStringReadAllFTPs9AnyObject_GSpVs6UInt16__T_": "(source, dest) { }", // TODO
		// Int
		"_TZFsoi1pFTSiSi_Si": "(left, right) { return (left + right) | 0 }",
		// Generic numeric types
		"_TZFsop1suRxs16SignedNumberTyperFxx": "(outNumber, inNumber) { outNumber[\"ref\"][outNumber[\"field\"]] = -inNumber[\"ref\"][inNumber[\"field\"]] }",
		// Error handling
		"willThrow": "(error) { throw error }",
		"trap": "() { throw \"Runtime error!\" }",
	}
};
