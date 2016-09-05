var readline = require("readline");
var fs = require("fs");

var out = fs.openSync(process.argv[2], "w");
var print = function(text) {
	fs.write(out, text);
	fs.write(out, "\n");
}

var types = {
	"Int": ["_value"],
	"UInt": ["_value"],
	"UInt8": ["_value"],
	"UInt16": ["_value"],
	"UInt32": ["_value"],
	"Int32": ["_value"],
	"Bool": ["_value"],
	"UTF16": ["_value"],
	"UnicodeScalar": ["_value"],
	"COpaquePointer": ["_value"],
	"_GraphemeClusterBreakPropertyRawValue": ["rawValue"],
	"_StringCore": ["_baseAddress", "_countAndFlags", "_owner"],
	"String": ["_core"],
	"UnsafePointer": ["_rawValue"],
	"UnsafeMutablePointer": ["_rawValue"],
	"UnsafeBufferPointer": ["_position", "_end"],
	"_HeapBuffer": [],
	"_StringBuffer": ["_storage"],
};

var enums = {
	"Optional": ["None", "Some"]
};

var builtins = {
	// Int32
	"sadd_with_overflow_Int32": "(left, right, overflow_check) { return [(left + right) | 0, 0] }",
	"uadd_with_overflow_Int32": "(left, right, overflow_check) { return [(left + right) | 0, 0] }", // TODO: Implement unsigned
	"ssub_with_overflow_Int32": "(left, right, overflow_check) { return [(left - right) | 0, 0] }",
	"smul_with_overflow_Int32": "(left, right, overflow_check) { return [(left * right) | 0, 0] }",
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
	"s_to_u_checked_conversion_Int32": "(value) { return value }",
	// Int64
	"zext_Int32_Int64": "(value) { return value }",
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
	// Pointers (unsound!)
	"inttoptr_Int8": "(value) { return value }",
	"cmp_eq_RawPointer": "(left, right) { return left == right }",
	"strideof_nonzero": "(type) { return 1 }",
	"sizeof": "(type) { return 1 }",
	"alignof": "(type) { return 1 }",
	"ptrtoint_Word": "(pointer) { return 0 }",
	"cmpxchg_seqcst_seqcst_RawPointer": "(target, expected, desired) { var oldValue = target[0]; var won = oldValue == expected; if (won) { target[0] = desired; } return won }",
	"int_memcpy_RawPointer_RawPointer_Int64": "(dest, src, size, alignment, volatile) { }",
	"_swift_stdlib_malloc_size": "(buffer) { return 0 }",
	// Booleans
	"xor_Int1": "(left, right) { return left ^ right }",
	"int_expect_Int1": "(value, expected) { return value }",
	// Words,
	"sub_Word": "(left, right) { return (left - right) | 0 }",
	"zextOrBitCast_Int32_Word": "(value) { return value }",
	// Functions
	"swift_bufferAllocate": "(bufferType, size, alignMask) { return {} }",
	"_TTSf4g_n___TFs19_cocoaStringReadAllFTPs9AnyObject_GSpVs6UInt16__T_": "(source, dest) { dest = source }",
};

var usedBuiltins = {};

var declarations = {};
var currentDeclaration;
var currentBasicBlock;

var lookbackLine;

function splitNoParens(s) {
	var parens = /\(|\)|\<|\-?\>/g;
	var result = s.split(",");
	for (var i = 0; i < result.length; i++) {
		do {
			var opens = 0;
			var find = null;
			while ((find = parens.exec(result[i])) !== null) {
				switch (find[0]) {
					case "(":
					case "<":
						opens++;
						break;
					case ")":
					case ">":
						opens--;
						break;
				}
			}
			if (i + 1 >= result.length) {
				break;
			}
			if (opens > 0) {
				result[i] += result.splice(i + 1, 1);
			}
		} while(opens);
		result[i] = result[i].trim();
    }
    return result;
}

function parseSil(line) {
	var name = line.split(/:/)[0].split(/\s+/).filter(part => /^@/.test(part))[0].substring(1);
	var declaration = {
		name: name,
		basicBlocks: [],
	};
	if (!/\b(hidden|shared_external)\b/.test(line)) {
		var beautifulMatch = lookbackLine.match(/^\/\/ \w+\.(\w+)/);
		if (beautifulMatch) {
			declaration.beautifulName = beautifulMatch[1];
		}
	}
	if (/{$/.test(line)) {
		if (currentDeclaration) {
			throw "Already inside a declaration!";
		}
		currentDeclaration = declaration;
		currentBasicBlock = undefined;
	}
	declarations[name] = declaration;
}

function parseBasicBlock(line) {
	if (!currentDeclaration) {
		throw "Found a basic block declaration outside of function declaration!";
	}
	var argMatch = line.match(/\((.*)\)/);
	if (argMatch) {
		var args = splitNoParens(argMatch[1]).map(arg => arg.match(/^%(\d+)/)[1])
	}
	currentBasicBlock = {
		name: line.match(/^\w+\b/)[0],
		arguments: args || [],
		instructions: [],
		references: [],
		backReferences: [],
	}
	currentDeclaration.basicBlocks.push(currentBasicBlock);
}

function parseInstruction(line) {
	if (/^debug_value\s/.test(line)) {
		return;
	}
	if (/^debug_value_addr\s/.test(line)) {
		return;
	}
	if (/^retain_value\s+/.test(line)) {
		return;
	}
	if (/^release_value\s+/.test(line)) {
		return;
	}
	if (/^dealloc_stack\s+/.test(line)) {
		return;
	}
	if (/^strong_retain\s+/.test(line)) {
		return;
	}
	if (/^strong_release\s+/.test(line)) {
		return;
	}
	if (line == "unreachable") {
		return {
			type: "unreachable"
		};
	}
	var match = line.match(/^\%(\w+)\s*=\s*(\w+)\s*(.*)/);
	if (match) {
		var assignment = {
			type: "assignment",
			destinationLocalName: match[1],
			instruction: match[2],
		};
		var args = match[3];
		switch (assignment.instruction) {
			case "integer_literal":
				assignment.value = args.split(",")[1].trim();
				break;
			case "string_literal":
				assignment.value = args.match(/\".*\"/)[0];
				break;
			case "enum":
				var enumMatch = args.match(/^\$(.*),\s+.*?\.(\w+)\!.*(,\s+\%\w+\s+:)?/);
				assignment.enumName = enumMatch[1];
				assignment.caseName = enumMatch[2];
				if (enumMatch[3]) {
					assignment.sourceLocalName = enumMatch[3].match(/^,\s+\%(\w+)\s+:$/)[1];
				}
				break;
			case "struct":
				var structMatch = args.match(/^\$(.*?)\s+\((.*)\)/);
				assignment.structName = basicNameForStruct(structMatch[1]);
				assignment.arguments = splitNoParens(structMatch[2]).map(arg => arg.match(/^%(\d+)/)[1]);
				break;
			case "tuple":
				var match = args.match(/^\((.*)\)/);
				if (match && match[1]) {
					assignment.arguments = splitNoParens(match[1]).map(arg => arg.match(/^%(\d+)/)[1]);
				} else {
					assignment.arguments = [];
				}
				break;
			case "struct_extract":
				var structMatch = args.match(/^%(\d+)\s*:\s*.*\.(.*)$/);
				assignment.sourceLocalName = structMatch[1];
				assignment.fieldName = structMatch[2];
				break;
			case "tuple_extract":
				var tupleMatch = args.match(/^%(\d+)\s*:.*,\s*(\d+)$/);
				assignment.sourceLocalName = tupleMatch[1];
				assignment.fieldIndex = tupleMatch[2];
				break;
			case "builtin":
				var builtinMatch = args.match(/^\"(\w+)\"(<\w+>)?\((.*)\)\s*:/);
				assignment.builtinName = builtinMatch[1];
				assignment.arguments = splitNoParens(builtinMatch[3]).map(arg => arg.match(/^%(\d+)/)[1]);
				break;
			case "function_ref":
				var functionMatch = args.match(/^@(\w+)\s*:/);
				assignment.functionName = functionMatch[1];
				break;
			case "apply":
				var applyMatch = args.match(/^(\[nothrow\]\s+)?%(\d+)\((.*)\)\s*:/);
				assignment.sourceLocalName = applyMatch[2];
				assignment.arguments = splitNoParens(applyMatch[3]).map(arg => arg.match(/^%(\d+)$/)[1]);
				break;
			case "alloc_stack":
				break;
			case "alloc_box":
				break;
			case "project_box":
				var boxMatch = args.match(/^%(\w+)\s+:/);
				assignment.sourceLocalName = boxMatch[1];
				break;
			case "struct_element_addr":
				var structMatch = args.match(/^%(\w+)\s+:\s+.*?#(\w+)\.(\w+)$/);
				assignment.sourceLocalName = structMatch[1];
				assignment.structName = structMatch[2];
				assignment.fieldName = structMatch[3];
				break;
			case "load":
				var loadMatch = args.match(/^%(\w+)\s+:/);
				assignment.sourceLocalName = loadMatch[1];
				break;
			case "unchecked_enum_data":
				var enumMatch = args.match(/^%(\w+)\s+:/);
				assignment.sourceLocalName = enumMatch[1];
				break;
			case "unchecked_addr_cast":
			case "pointer_to_address":
			case "ref_to_raw_pointer":
			case "raw_pointer_to_ref":
				var match = args.match(/^%(\w+)\s+:/);
				assignment.sourceLocalName = match[1];
				break;
			case "index_raw_pointer":
				var match = args.match(/^%(\w+)\s+:.*?,\s+%(\w+)\s+:/)
				assignment.sourceLocalName = match[1];
				assignment.offsetLocalName = match[2];
				break;
			default:
				assignment.unparsedArguments = args;
				break;
		}
		return assignment;
	}
	match = line.match(/^return\s+\%(\w+) :/);
	if (match) {
		return {
			type: "return",
			localName: match[1],
		};
	}
	match = line.match(/^br\s+(\w+)\((.*)\)/) || line.match(/^br\s+(\w+)/);
	if (match) {
		return {
			type: "branch",
			blockName: match[1],
			arguments: match[2] ? splitNoParens(match[2]).map(arg => arg.match(/^%(\d+)/)[1]) : [],
		};
	}
	match = line.match(/^cond_br\s+\%(\w+),\s*(\w+),\s(\w+)/);
	if (match) {
		return {
			type: "conditional_branch",
			localName: match[1],
			trueBlockName: match[2],
			falseBlockName: match[3],
		};
	}
	match = line.match(/^store\s+\%(\w+)\s+to\s+\%(\w+)\s+:/);
	if (match) {
		return {
			type: "store",
			sourceLocalName: match[1],
			destinationLocalName: match[2],
		};
	}
	match = line.match(/^switch_enum\s+\%(\w+)\s+:\s+.*?,\s+(case .*)/);
	if (match) {
		return {
			type: "switch_enum",
			localName: match[1],
			cases: splitNoParens(match[2]).map(arg => {
				var match = arg.match(/^case\s+\#(.*):\s+(.*)$/);
				return {
					"case": match[1],
					"basicBlock": match[2]
				};
			})
		};
	}
	match = line.match(/^try_apply\s+%(\w+)\((.*)\)\s+:.*,\s+normal\s+(\w+),\s+error\s+(\w+)/);
	if (match) {
		return {
			type: "try_apply",
			localName: match[1],
			arguments: splitNoParens(match[2]).map(arg => arg.match(/^%(\d+)$/)[1]),
			normalBlockName: match[3],
			errorBlockName: match[4],
		};
	}
	match = line.match(/^throw\s+%(\w+)\s*:/);
	if (match) {
		return {
			type: "throw",
			name: match[1],
		};
	}
	throw "Unknown instruction: " + line;
}

function parse(originalLine) {
	line = originalLine.replace(/\s*\/\/.*/, "");
	if (line.length != 0) {
		var directive = line.match(/^\w+\b/);
		if (directive) {
			directive = directive[0];
			switch (directive) {
				case "sil_stage":
					// Do nothing with sil_stage directives
					break;
				case "import":
					// Do nothing with import directives
					break;
				case "sil":
					parseSil(line);
					break;
				default:
					if (/^\w+(\(.*\))?:$/.test(line)) {
						// Found basic block!
						parseBasicBlock(line);
					}
					break;
			}
		} else if (/}$/.test(line)) {
			if (currentDeclaration) {
				currentDeclaration = undefined;
				currentBasicBlock = undefined;
			} else {
				// Not inside a declaration!
				// Should be an error, but we aren't even close to understanding Swift's protocols/method tables
			}
		} else if (/^  /.test(line)) {
			if (currentBasicBlock) {
				var instruction = parseInstruction(line.trim());
				if (instruction) {
					currentBasicBlock.instructions.push(instruction);
				}
			} else {
				// Not inside a declaration or basic block!
				// Should be an error, but we aren't even close to understanding Swift's protocols/method tables
			}
		} else {
			console.log("Unknown: " + line);
		}
	}
	lookbackLine = originalLine;
}

function findBasicBlock(blocks, name) {
	for (var i = 0; i < blocks.length; i++) {
		if (blocks[i].name == name) {
			return blocks[i];
		}
	}
}

function basicNameForStruct(structName) {
	return structName.match(/^\w+/)[0];
}

function caseNameForEnum(fullEnumName) {
	return fullEnumName.match(/^\w+\.(\w+)\!/)[1];
}

function IndentedBuffer(){
    this.lines = [];
    this.indentation = 0;
}

IndentedBuffer.prototype.indent = function (amount) {
	this.indentation += amount;
};

IndentedBuffer.prototype.write = function (line, extra) {
	if (extra) {
		this.indent(extra);
	}
	this.lines.push(Array(this.indentation + 1).join("\t") + line);
	if (extra) {
		this.indent(-extra);
	}
};

function writeBranchToBlock(targetBlock, buffer, siblingBlocks) {
	var index = siblingBlocks.indexOf(targetBlock);
	if (targetBlock.backReferences.length > 1) {
		buffer.write("state = " + index + ";");
	} else {
		buffer.write("// " + targetBlock.name);
		writeBasicBlock(targetBlock, buffer, siblingBlocks);
	}
}

var mangleLocal = local => "_" + local;
var box = (struct, quotedFieldName) => "{ \"ref\": " + struct + ", \"field\": " + quotedFieldName + " }";
var unbox = (struct) => struct + "[\"ref\"][" + struct + "[\"field\"]]";

function writeBasicBlock(basicBlock, buffer, siblingBlocks) {
	for (var j = 0; j < basicBlock.instructions.length; j++) {
		var instruction = basicBlock.instructions[j];
		buffer.write("// " + instruction.type);
		switch (instruction.type) {
			case "assignment":
				buffer.write("// of " + instruction.instruction);
				var declaration = "var " + mangleLocal(instruction.destinationLocalName) + " = ";
				switch (instruction.instruction) {
					case "integer_literal":
						declaration += instruction.value;
						break;
					case "string_literal":
						declaration += instruction.value;
						break;
					case "enum":
						var enumName = basicNameForStruct(instruction.enumName);
						var enumLayout = enums[enumName];
						if (!enumLayout) {
							throw "Unable to find enum: " + enumName;
						}
						if ("sourceLocalName" in instruction) {
							declaration += "[" + enumLayout.indexOf(instruction.caseName) + ", " + mangleLocal(instruction.sourceLocalName) + "]";
						} else {
							declaration += "[" + enumLayout.indexOf(instruction.caseName) + "]";
						}
						break;
					case "struct":
						var structName = instruction.structName;
						var structType = types[structName];
						if (!structType) {
							throw "No type for " + structName;
						}
						declaration += "{ " + instruction.arguments.map((arg, index) => "\"" + structType[index] + "\": " + mangleLocal(arg)).join(", ") + " }";
						break;
					case "tuple":
						declaration += "[ " + instruction.arguments.map(mangleLocal).join(", ") + " ]";
						break;
					case "struct_extract":
						declaration += mangleLocal(instruction.sourceLocalName) + JSON.stringify([instruction.fieldName]);
						break;
					case "tuple_extract":
						declaration += mangleLocal(instruction.sourceLocalName) + JSON.stringify([instruction.fieldIndex | 0]);
						break;
					case "builtin":
						var builtinName = instruction.builtinName;
						declaration += builtinName + "(" + instruction.arguments.map(mangleLocal).join(", ") + ")";
						if (!usedBuiltins[builtinName]) {
							usedBuiltins[builtinName] = true;
							var builtin = builtins[builtinName];
							if (!builtin) {
								throw "No builtin available for " + builtinName + " (expects " + args.length + " arguments)";
							}
							print("function " + builtinName + builtin);
						}
						break;
					case "function_ref":
						var functionName = instruction.functionName;
						declaration += functionName;
						if (!usedBuiltins[functionName]) {
							usedBuiltins[functionName] = true;
							var builtin = builtins[functionName];
							if (builtin) {
								print("function " + functionName + builtin);
							}
						}
						break;
					case "apply":
						declaration += mangleLocal(instruction.sourceLocalName) + "(" + instruction.arguments.map(mangleLocal).join(", ") + ")";
						break;
					case "alloc_stack":
						declaration += box("[]", 0);
						break;
					case "alloc_box":
						declaration += "[]";
						break;
					case "project_box":
						declaration += box(mangleLocal(instruction.sourceLocalName), 0);
						break;
					case "struct_element_addr":
						declaration += box(mangleLocal(instruction.sourceLocalName), "\"" + instruction.fieldName + "\"");
						break;
					case "load":
						declaration += unbox(mangleLocal(instruction.sourceLocalName));
						break;
					case "unchecked_enum_data":
						declaration += mangleLocal(instruction.sourceLocalName) + "[1]";
						break;
					case "unchecked_addr_cast":
					case "pointer_to_address":
					case "ref_to_raw_pointer":
					case "raw_pointer_to_ref":
						declaration += mangleLocal(instruction.sourceLocalName);
						break;
					case "index_raw_pointer":
						declaration += mangleLocal(instruction.sourceLocalName);
						declaration += "; if (" + mangleLocal(instruction.offsetLocalName) + ") throw \"Pointer arithmetic disallowed!\"";
						break;
					default:
						declaration += "undefined /* unknown instruction " + instruction.instruction + ": " + instruction.arguments + " */";
						break;
				}
				buffer.write(declaration + ";");
				break;
			case "return":
				buffer.write("return " + mangleLocal(instruction.localName) + ";");
				break;
			case "branch":
				var args = instruction.arguments;
				var targetBlock = findBasicBlock(siblingBlocks, instruction.blockName);
				for (var k = 0; k < args.length; k++) {
					buffer.write("var " + mangleLocal(targetBlock.arguments[k]) + " = " + mangleLocal(args[k]) + ";");
				}
				writeBranchToBlock(targetBlock, buffer, siblingBlocks);
				break;
			case "conditional_branch":
				buffer.write("if (" + mangleLocal(instruction.localName) + ") {");
				buffer.indent(1);
				writeBranchToBlock(findBasicBlock(siblingBlocks, instruction.trueBlockName), buffer, siblingBlocks);
				buffer.indent(-1);
				buffer.write("} else {");
				buffer.indent(1);
				writeBranchToBlock(findBasicBlock(siblingBlocks, instruction.falseBlockName), buffer, siblingBlocks);
				buffer.indent(-1);
				buffer.write("}");
				break;
			case "store":
				buffer.write(unbox(mangleLocal(instruction.destinationLocalName)) + " = " + mangleLocal(instruction.sourceLocalName) + ";");
				break;
			case "switch_enum":
				buffer.write("switch (" + mangleLocal(instruction.localName) + ") {")
				var args = instruction.cases;
				var enumName = basicNameForStruct(args[0].case);
				var enumLayout = enums[enumName];
				if (!enumLayout) {
					throw "Unable to find enum: " + enumName;
				}
				for (var k = 0; k < args.length; k++) {
					buffer.write("case " + enumLayout.indexOf(caseNameForEnum(args[k].case)) + ":");
					buffer.indent(1);
					var targetBlock = findBasicBlock(siblingBlocks, args[k].basicBlock);
					if (targetBlock.arguments.length > 0) {
						buffer.write("var " + mangleLocal(targetBlock.arguments[0]) + " = " + mangleLocal(instruction.localName) + "[1];");
					}
					writeBranchToBlock(targetBlock, buffer, siblingBlocks);
					buffer.indent(-1);
				}
				buffer.write("}");
				break;
			case "try_apply":
				buffer.write("try {");
				var normalBasicBlock = findBasicBlock(siblingBlocks, instruction.normalBlockName);
				buffer.indent(1);
				buffer.write("var " + mangleLocal(normalBasicBlock.arguments[0]) + " = " + mangleLocal(instruction.localName) + "(" + instruction.arguments.map(mangleLocal).join(", ") + ");");
				writeBranchToBlock(findBasicBlock(siblingBlocks, instruction.normalBlockName), buffer, siblingBlocks);
				buffer.indent(-1);
				buffer.write("} catch (e) {");
				var errorBasicBlock = findBasicBlock(siblingBlocks, instruction.errorBlockName);
				buffer.indent(1);
				buffer.write("var " + mangleLocal(errorBasicBlock.arguments[0]) + " = e;");
				writeBranchToBlock(findBasicBlock(siblingBlocks, instruction.errorBlockName), buffer, siblingBlocks);
				buffer.indent(-1);
				buffer.write("}");
				break;
			case "unreachable":
				buffer.write("throw \"Should be unreachable!\";");
				break;
			default:
				buffer.write("// Unhandled instruction type: " + instruction.type + ": " + JSON.stringify(instruction));
				break;
		}
	}
}

function analyzeBlockReferences(basicBlocks) {
	for (var i = 0; i < basicBlocks.length; i++) {
		var basicBlock = basicBlocks[i];
		var lastInstruction = basicBlock.instructions[basicBlock.instructions.length-1];
		switch (lastInstruction.type) {
			case "branch":
				basicBlock.references.push(lastInstruction.blockName);
				findBasicBlock(basicBlocks, lastInstruction.blockName).backReferences.push(basicBlock.name);
				break;
			case "conditional_branch":
				basicBlock.references.push(lastInstruction.trueBlockName);
				findBasicBlock(basicBlocks, lastInstruction.trueBlockName).backReferences.push(basicBlock.name);
				basicBlock.references.push(lastInstruction.falseBlockName);
				findBasicBlock(basicBlocks, lastInstruction.falseBlockName).backReferences.push(basicBlock.name);
				break;
			case "try_apply":
				basicBlock.references.push(lastInstruction.normalBlockName);
				findBasicBlock(basicBlocks, lastInstruction.normalBlockName).backReferences.push(basicBlock.name);
				basicBlock.references.push(lastInstruction.errorBlockName);
				findBasicBlock(basicBlocks, lastInstruction.errorBlockName).backReferences.push(basicBlock.name);
				break;
			case "switch_enum":
				lastInstruction.cases.forEach(switchCase => {
					basicBlock.references.push(switchCase.basicBlock);
					findBasicBlock(basicBlocks, switchCase.basicBlock).backReferences.push(basicBlock.name);
				});
				break;
		}
	}
}

function writeAST(buffer) {
	for (var name in declarations) {
		var basicBlocks = declarations[name].basicBlocks;
		if (basicBlocks.length == 0) {
			// No basic blocks, some kind of weird declaration we don't support yet
			continue;
		}
		buffer.write("function " + name + "(" + basicBlocks[0].arguments.map(mangleLocal).join(", ") + ") {");
		buffer.indent(1);
		analyzeBlockReferences(basicBlocks);
		if (basicBlocks.length == 1) {
			writeBasicBlock(basicBlocks[0], buffer, basicBlocks);
		} else {
			buffer.write("var state = 0;");
			var firstBlockHasBackreferences = basicBlocks[0].backReferences.length > 0;
			if (!firstBlockHasBackreferences) {
				writeBasicBlock(basicBlocks[0], buffer, basicBlocks);
			}
			buffer.write("for (;;) switch(state) {")
			for (var i = firstBlockHasBackreferences ? 0 : 1; i < basicBlocks.length; i++) {
				var basicBlock = basicBlocks[i];
				if (basicBlock.backReferences.length > 1 || i == 0) {
					buffer.write("case " + i + ": // " + basicBlock.name);
					buffer.indent(1);
					writeBasicBlock(basicBlocks[i], buffer, basicBlocks);
					buffer.write("break;");
					buffer.indent(-1);
				}
			}
			buffer.write("}");
		}
		buffer.indent(-1);
		buffer.write("}");
		var beautifulName = declarations[name].beautifulName;
		if (beautifulName) {
			buffer.write("window[\"" + beautifulName + "\"] = " + name + ";");
		}
	}
	//console.log(JSON.stringify(declarations, null, 4));
}

var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false
});

rl.on("line", function(line){
	//try {
		parse(line);
	//} catch (e) {
	//	throw e.toString() + " on line " + line;
	//}
});

rl.on("close", function() {
	var buffer = new IndentedBuffer();
	writeAST(buffer);
	print(buffer.lines.join("\n"));
});
