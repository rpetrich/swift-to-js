var stdlib = require("./stdlib.js");
var types = stdlib.types;
var enums = stdlib.enums;
var builtins = stdlib.builtins;

var Parser = require("./parser.js");

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

var mangleLocal = local => "_" + local;
var box = (struct, quotedFieldName) => "({ \"ref\": " + struct + ", \"field\": " + quotedFieldName + " })";
var unboxRef = struct => struct + "[\"ref\"]";
var unboxField = struct => struct + "[\"field\"]";
var unbox = struct => unboxRef(struct) + "[" + unboxField(struct) + "]";

function CodeGen(parser) {
	this.buffer = new IndentedBuffer();
	this.usedBuiltins = {};
}

CodeGen.prototype.writeBuiltIn = function (name) {
	if (!this.usedBuiltins[name]) {
		var builtin = builtins[name];
		if (!builtin) {
			return false;
		}
		this.usedBuiltins[name] = true;
		if (/^\(/.test(builtin)) {
			this.buffer.lines.unshift("function " + name + builtin);
		} else {
			this.buffer.lines.unshift("var " + name + " = " + builtin + ";");
		}
	}
	return true;
}

CodeGen.prototype.writeBranchToBlock = function (descriptor, siblingBlocks) {
	if (descriptor.reference) {
		for (var i = 0; i < siblingBlocks.length; i++) {
			if (siblingBlocks[i].name == descriptor.reference) {
				this.buffer.write("state = " + i + ";");
				return;
			}
		}
		throw new Error("Unable to find block with name: " + descriptor.reference);
	}
	if (descriptor.inline) {
		this.buffer.write("// " + descriptor.inline.name);
		this.writeBasicBlock(descriptor.inline, siblingBlocks);
	} else {
		throw new Error("Neither a reference to a basic block nor inline!");
	}
}

function findBasicBlock(blocks, descriptor) {
	if (descriptor.reference) {
		for (var i = 0; i < blocks.length; i++) {
			if (blocks[i].name == descriptor.reference) {
				return blocks[i];
			}
		}
		throw new Error("Unable to find basic block: " + descriptor.reference);
	}
	if (descriptor.inline) {
		return descriptor.inline;
	}
	throw new Error("Neither a reference nor an inline block!");
}

CodeGen.prototype.rValueForInput = function(input) {
	switch (input.interpretation) {
		case "contents":
			return mangleLocal(input.localNames[0]);
		case "integer_literal":
		case "float_literal":
		case "string_literal":
			return input.value;
		case "undefined_literal":
			return "void 0";
		case "enum":
			var enumName = input.type;
			var enumLayout = enums[enumName];
			if (!enumLayout) {
				throw new Error("Unable to find enum: " + enumName);
			}
			var index = enumLayout.indexOf(input.caseName);
			if (index == -1) {
				throw new Error("Unable to find case: " + input.caseName + " in " + enumName);
			}
			if (input.localNames.length) {
				return "[" + index + ", " + mangleLocal(input.localNames[0]) + "]";
			} else {
				return "[" + index + "]";
			}
		case "struct":
			var structName = input.type;
			var structType = types[structName];
			if (!structType) {
				throw new Error("No type for " + structName);
			}
			return "{ " + input.localNames.map((localName, index) => "\"" + structType[index] + "\": " + mangleLocal(localName)).join(", ") + " }";
		case "tuple":
			if (input.localNames.length == 0) {
				return "void 0";
			} else {
				return "[" + input.localNames.map(mangleLocal).join(", ") + "]";
			}
		case "struct_extract":
			return mangleLocal(input.localNames[0]) + JSON.stringify([input.fieldName]);
		case "tuple_extract":
			return mangleLocal(input.localNames[0]) + JSON.stringify([input.fieldName | 0]);
		case "builtin":
			var builtinName = input.builtinName;
			if (!this.writeBuiltIn(builtinName)) {
				throw new Error("No builtin available for " + builtinName + " (expects " + (input.localNames.length - 1) + " arguments)");
			}
			return builtinName + "(" + input.localNames.map(mangleLocal).join(", ") + ")";
		case "function_ref":
			this.writeBuiltIn(input.functionName);
			return input.functionName;
		case "apply":
			var args = input.localNames.slice(1);
			var result = mangleLocal(input.localNames[0]);
			if (input.fieldName) {
				result += JSON.stringify([input.fieldName]);
			}
			if (input.convention == "method") {
				var hiddenThisArg = args.pop();
				if ((hiddenThisArg != input.localNames[0]) || !input.fieldName) {
					args.unshift(hiddenThisArg);
					result += ".call";
				}
			}
			return result + "(" + args.map(mangleLocal).join(", ") + ")";
		case "partial_apply":
			// TODO: Support method calling convention on partial application
			return mangleLocal(input.localNames[0]) + ".bind(this, " + input.localNames.slice(1).map(mangleLocal).join(", ") + ")";
		case "alloc_stack":
			if (input.localNames.length) {
				return box("[" + mangleLocal(input.localNames[0]) + "]", 0);
			} else {
				return box("[]", 0);
			}
		case "alloc_box":
			return box("[{}]", 0);
		case "alloc_ref":
			return "new " + input.type;
		case "project_box":
			return box(mangleLocal(input.localNames[0]), 0);
		case "struct_element_addr":
			return box(unbox(mangleLocal(input.localNames[0])), "\"" + input.fieldName + "\"");
		case "ref_element_addr":
			return box(mangleLocal(input.localNames[0]), "\"" + input.fieldName + "\"");
		case "global_addr":
			return box(input.globalName, 0);
		case "load":
			if ("fieldName" in input) {
				return mangleLocal(input.localNames[0]) + JSON.stringify([input.fieldName]);
			} else {
				return unbox(mangleLocal(input.localNames[0]));
			}
		case "unchecked_enum_data":
			return mangleLocal(input.localNames[0]) + "[1]";
		case "select_enum":
			var enumName = input.type;
			var enumLayout = enums[enumName];
			if (!enumLayout) {
				throw "Unable to find enum: " + enumName;
			}
			var prefix = "(function(value";
			var contents = "){switch(value){";
			var suffix = "}})(" + mangleLocal(input.localNames[0]) + "[0]";
			input.cases.forEach((enumCase, index) => {
				prefix += ",$" + index;
				var caseName = Parser.caseNameForEnum(enumCase.case);
				if (caseName) {
					contents += "case " + enumLayout.indexOf(caseName) + ":return $" + index + ";";
				} else {
					contents += "default:return $" + index + ";";
				}
				suffix += ", " + mangleLocal(input.localNames[index + 1]);
			});
			return prefix + contents + suffix + ")";
		case "select_value":
			if (input.values.length == 2) {
				if ("value" in input.values[0]) {
					return "(" + mangleLocal(input.localNames[0]) + " === " + input.values[0].value + " ? " + mangleLocal(input.localNames[1]) + " : " + mangleLocal(input.localNames[2]) + ")";
				} else {
					return "(" + mangleLocal(input.localNames[0]) + " !== " + input.values[1].value + " ? " + mangleLocal(input.localNames[1]) + " : " + mangleLocal(input.localNames[2]) + ")";
				}
			} else {
				var prefix = "(function(value";
				var contents = "){switch(value){";
				var suffix = "}})(" + mangleLocal(input.localNames[0]);
				input.values.forEach((object, index) => {
					prefix += ",$" + index;
					if ("value" in object) {
						contents += "case " + object.value + ":return $" + index + ";";
					} else {
						contents += "default:return $" + index + ";";
					}
					suffix += ", " + mangleLocal(input.localNames[index + 1]);
				});
			}
			return prefix + contents + suffix + ")";
		case "index_raw_pointer":
		case "index_addr":
			return box(unboxRef(mangleLocal(input.localNames[0])), unboxField(mangleLocal(input.localNames[0])) + " + " + mangleLocal(input.localNames[1]));
		case "metatype":
			return "void 0";
		case "class_method":
			return mangleLocal(input.localNames[0]) + JSON.stringify([input.entry]);
		case "open_existential_ref":
			return "{ \"ref\": [], \"field\": 0 }";
		default:
			throw new Error("Unable to interpret rvalue as " + input.interpretation + " from " + input.line);
	}
}

CodeGen.prototype.lValueForInput = function (input) {
	switch (input.interpretation) {
		case "contents":
			return unbox(mangleLocal(input.localNames[0]));
		case "ref_element_addr":
		case "struct_element_addr":
			return mangleLocal(input.localNames[0]) + JSON.stringify([input.fieldName]);
		case "index_raw_pointer":
		case "index_addr":
			return unboxRef(mangleLocal(input.localNames[0])) + "[" + unboxField(mangleLocal(input.localNames[0])) + " + " + mangleLocal(input.localNames[1]) + "]";
		case "struct_extract":
			return mangleLocal(input.localNames[0]) + JSON.stringify([input.fieldName]);
		case "tuple_extract":
			return mangleLocal(input.localNames[0]) + JSON.stringify([input.fieldName | 0]);
		default:
			throw new Error("Unable to interpret lvalue as " + input.interpretation + " with " + input.line);
	}
}

CodeGen.prototype.writeBasicBlock = function (basicBlock, siblingBlocks) {
	for (var j = 0; j < basicBlock.instructions.length; j++) {
		var instruction = basicBlock.instructions[j];
		if (instruction.inputs.length) {
			this.buffer.write("// " + instruction.operation + " from " + instruction.inputs.map(i => i.interpretation).join(", "));
		} else {
			this.buffer.write("// " + instruction.operation);
		}
		this.buffer.write("// " + JSON.stringify(instruction));
		switch (instruction.operation) {
			case "assignment":
				this.buffer.write("var " + mangleLocal(instruction.destinationLocalName) + " = " + this.rValueForInput(instruction.inputs[0]) + ";");
				break;
			case "return":
				this.buffer.write("return " + this.rValueForInput(instruction.inputs[0]) + ";");
				break;
			case "branch":
				var targetBlock = findBasicBlock(siblingBlocks, instruction.block);
				targetBlock.arguments.forEach((arg, index) => {
					this.buffer.write("var " + mangleLocal(arg.localName) + " = " + this.rValueForInput(instruction.inputs[index]) + ";");
				});
				this.writeBranchToBlock(instruction.block, siblingBlocks);
				break;
			case "conditional_branch":
				this.buffer.write("if (" + this.rValueForInput(instruction.inputs[0]) + ") {");
				this.buffer.indent(1);
				this.writeBranchToBlock(instruction.trueBlock, siblingBlocks);
				this.buffer.indent(-1);
				this.buffer.write("} else {");
				this.buffer.indent(1);
				this.writeBranchToBlock(instruction.falseBlock, siblingBlocks);
				this.buffer.indent(-1);
				this.buffer.write("}");
				break;
			case "checked_cast_branch":
				var comparison = instruction.exact ? ".constructor == " : " instanceof ";
				this.buffer.write("if (" + this.rValueForInput(instruction.inputs[0]) + comparison + instruction.type + ") {");
				this.buffer.indent(1);
				var targetBlock = findBasicBlock(siblingBlocks, instruction.trueBlock);
				targetBlock.arguments.forEach((arg, index) => {
					this.buffer.write("var " + mangleLocal(arg.localName) + " = " + this.rValueForInput(instruction.inputs[index]) + ";");
				});
				this.writeBranchToBlock(instruction.trueBlock, siblingBlocks);
				this.buffer.indent(-1);
				this.buffer.write("} else {");
				this.buffer.indent(1);
				this.writeBranchToBlock(instruction.falseBlock, siblingBlocks);
				this.buffer.indent(-1);
				this.buffer.write("}");
				break;
			case "conditional_defined_branch":
				this.buffer.write("if (" + this.rValueForInput(instruction.inputs[0]) + " === void 0) {");
				this.buffer.indent(1);
				findBasicBlock(siblingBlocks, instruction.trueBlock).arguments.forEach((arg, index) => {
					this.buffer.write("var " + mangleLocal(arg.localName) + " = " + this.rValueForInput(instruction.inputs[index]) + ";");
				});
				this.writeBranchToBlock(instruction.trueBlock, siblingBlocks);
				this.buffer.indent(-1);
				this.buffer.write("} else {");
				this.buffer.indent(1);
				this.writeBranchToBlock(instruction.falseBlock, siblingBlocks);
				this.buffer.indent(-1);
				this.buffer.write("}");
				break;
			case "store":
				this.buffer.write(this.lValueForInput(instruction.inputs[1]) + " = " + this.rValueForInput(instruction.inputs[0]) + ";");
				break;
			case "copy_addr":
				this.buffer.write(this.lValueForInput(instruction.inputs[1]) + " = " + this.rValueForInput(instruction.inputs[0]) + ";");
				break;
			case "switch_enum":
				this.buffer.write("switch (" + this.rValueForInput(instruction.inputs[0]) + ") {")
				var args = instruction.cases;
				var enumName = instruction.type;
				var enumLayout = enums[enumName];
				if (!enumLayout) {
					throw "Unable to find enum: " + enumName;
				}
				instruction.cases.forEach(enumCase => {
					var caseName = Parser.caseNameForEnum(enumCase.case);
					if (caseName) {
						this.buffer.write("case " + enumLayout.indexOf(caseName) + ":");
					} else {
						this.buffer.write("default:");
					}
					this.buffer.indent(1);
					var targetBlock = findBasicBlock(siblingBlocks, enumCase.basicBlock);
					if (targetBlock.arguments.length > 0) {
						this.buffer.write("var " + mangleLocal(targetBlock.arguments[0].localName) + " = " + this.rValueForInput(instruction.inputs[0]) + "[1];");
					}
					this.writeBranchToBlock(enumCase.basicBlock, siblingBlocks);
					this.buffer.indent(-1);
				});
				this.buffer.write("}");
				break;
			case "try_apply":
				this.buffer.write("try {");
				var normalBasicBlock = findBasicBlock(siblingBlocks, instruction.normalBlock);
				this.buffer.indent(1);
				this.buffer.write("var " + mangleLocal(normalBasicBlock.arguments[0].localName) + " = " + this.rValueForInput(instruction.inputs[0]) + "(" + instruction.inputs.slice(1).map(input => this.rValueForInput(input)).join(", ") + ");");
				this.writeBranchToBlock(instruction.normalBlock, siblingBlocks);
				this.buffer.indent(-1);
				this.buffer.write("} catch (e) {");
				var errorBasicBlock = findBasicBlock(siblingBlocks, instruction.errorBlock);
				this.buffer.indent(1);
				this.buffer.write("var " + mangleLocal(errorBasicBlock.arguments[0].localName) + " = e;");
				this.writeBranchToBlock(instruction.errorBlock, siblingBlocks);
				this.buffer.indent(-1);
				this.buffer.write("}");
				break;
			case "conditional_fail":
				this.writeBuiltIn("trap");
				this.buffer.write("if (" + this.rValueForInput(instruction.inputs[0]) + ") {");
				this.buffer.write("trap();", 1)
				this.buffer.write("}");
				break;
			case "unreachable":
				this.writeBuiltIn("trap");
				this.buffer.write("trap();")
				break;
			case "throw":
				this.buffer.write("throw " + this.rValueForInput(instruction.inputs[0]) + ";");
				break;
			default:
				this.buffer.write("// Unhandled instruction type: " + instruction.operation + ": " + JSON.stringify(instruction));
				break;
		}
	}
}

CodeGen.prototype.consume = function(declaration) {
	switch (declaration.type) {
		case "function":
			this.consumeFunction(declaration);
			break;
		case "global":
			this.consumeGlobal(declaration);
			break;
		case "vtable":
			this.consumeVTable(declaration);
			break;
	}
}

CodeGen.prototype.consumeGlobal = function(declaration) {
	this.buffer.write("var " + declaration.name + " = []");
}

CodeGen.prototype.consumeFunction = function(declaration) {
	var basicBlocks = declaration.basicBlocks;
	if (basicBlocks.length == 0) {
		// No basic blocks, some kind of weird declaration we don't support yet
		return;
	}
	var args = basicBlocks[0].arguments;
	var useMethodCallingConvention = declaration.convention == "method";
	if (useMethodCallingConvention) {
		var hiddenThisArg = args[args.length - 1];
		args = args.slice(0, args.length - 1);
	}
	this.buffer.write("function " + declaration.name + "(" + args.map(arg => mangleLocal(arg.localName)).join(", ") + ") {");
	this.buffer.indent(1);
	if (useMethodCallingConvention) {
		this.buffer.write("var " + mangleLocal(hiddenThisArg.localName) + " = this;");
		hiddenThisArg.localName = "this";
	}
	if (basicBlocks.length == 1) {
		this.writeBasicBlock(basicBlocks[0], basicBlocks);
	} else {
		var firstBlockHasBackreferences = basicBlocks[0].hasBackReferences;
		if (firstBlockHasBackreferences) {
			this.buffer.write("var state = 0;");
		} else {
			this.buffer.write("var state;");
			this.buffer.write("// " + basicBlocks[0].name);
			this.writeBasicBlock(basicBlocks[0], basicBlocks);
		}
		if (!firstBlockHasBackreferences && basicBlocks.length == 2) {
			if (basicBlocks[1].hasBackReferences) {
				this.buffer.write("for (;;) {")
				this.buffer.indent(1);
				this.buffer.write("// " + basicBlocks[1].name);
				this.writeBasicBlock(basicBlocks[1], basicBlocks);
				this.buffer.indent(-1);
				this.buffer.write("}");
			} else {
				this.buffer.write("// " + basicBlocks[1].name);
				this.writeBasicBlock(basicBlocks[1], basicBlocks);
			}
		} else {
			this.buffer.write("for (;;) switch(state) {")
			for (var i = firstBlockHasBackreferences ? 0 : 1; i < basicBlocks.length; i++) {
				var basicBlock = basicBlocks[i];
				this.buffer.write("case " + i + ": // " + basicBlock.name);
				this.buffer.indent(1);
				this.writeBasicBlock(basicBlocks[i], basicBlocks);
				this.buffer.write("break;");
				this.buffer.indent(-1);
			}
			this.buffer.write("}");
		}
	}
	this.buffer.indent(-1);
	this.buffer.write("}");
	var beautifulName = declaration.beautifulName;
	if (beautifulName) {
		this.buffer.write("window[\"" + beautifulName + "\"] = " + declaration.name + ";");
	}
}

CodeGen.prototype.consumeVTable = function(declaration) {
	if (!/^_/.test(declaration.name)) {
		this.buffer.write("/** @constructor */");
		this.buffer.write("function " + declaration.name + "() {}");
		this.buffer.write("window[\"" + declaration.name + "\"] = " + declaration.name + ";");
		for (var key in declaration.entries) {
			if (declaration.entries.hasOwnProperty(key)) {
				this.buffer.write(declaration.name + ".prototype" + JSON.stringify([key]) + " = " + declaration.entries[key] + ";");
			}
		}
	}
}

module.exports = CodeGen;
