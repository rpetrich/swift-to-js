var stdlib = require("./stdlib.js");
var types = stdlib.types;
var enums = stdlib.enums;
var builtins = stdlib.builtins;

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
var box = (struct, quotedFieldName) => "{ \"ref\": " + struct + ", \"field\": " + quotedFieldName + " }";
var unboxRef = struct => struct + "[\"ref\"]";
var unboxField = struct => struct + "[\"field\"]";
var unbox = struct => unboxRef(struct) + "[" + unboxField(struct) + "]";
var caseNameForEnum = fullEnumName => fullEnumName.match(/^\w+\.(\w+)\!/)[1];

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
		case "enum":
			var enumName = input.type;
			var enumLayout = enums[enumName];
			if (!enumLayout) {
				throw "Unable to find enum: " + enumName;
			}
			if (input.localNames.length) {
				return "[" + enumLayout.indexOf(input.caseName) + ", " + mangleLocal(input.localNames[0]) + "]";
			} else {
				return "[" + enumLayout.indexOf(input.caseName) + "]";
			}
		case "struct":
			var structName = input.type;
			var structType = types[structName];
			if (!structType) {
				throw "No type for " + structName;
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
			return mangleLocal(input.localNames[0]) + "(" + input.localNames.slice(1).map(mangleLocal).join(", ") + ")";
		case "partial_apply":
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
			return box("{}", 0);
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
		case "index_raw_pointer":
		case "index_addr":
			return box(unboxRef(mangleLocal(input.localNames[0])), unboxField(mangleLocal(input.localNames[0])) + " + " + mangleLocal(input.localNames[1]));
		case "metatype":
			return "void 0";
		case "class_method":
			return "undefined"; // TODO: Figure out class methods
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
			case "store":
				this.buffer.write(this.lValueForInput(instruction.inputs[1]) + " = " + this.rValueForInput(instruction.inputs[0]) + ";");
				break;
			case "copy_addr":
				this.buffer.write(this.lValueForInput(instruction.inputs[1]) + " = " + this.rValueForInput(instruction.inputs[0]) + ";");
				break;
			case "switch_enum":
				this.buffer.write("switch (" + this.rValueForInput(instruction.inputs[0]) + ") {")
				var args = instruction.cases;
				var enumName = args[0].case;
				var enumLayout = enums[enumName];
				if (!enumLayout) {
					throw "Unable to find enum: " + enumName;
				}
				for (var k = 0; k < args.length; k++) {
					var caseName = caseNameForEnum(args[k].case);
					if (caseName) {
						this.buffer.write("case " + enumLayout.indexOf(caseName) + ":");
					} else {
						this.buffer.write("default:");
					}
					this.buffer.indent(1);
					var targetBlock = findBasicBlock(siblingBlocks, args[k].basicBlock);
					if (targetBlock.arguments.length > 0) {
						this.buffer.write("var " + mangleLocal(targetBlock.arguments[0].localName) + " = " + value + "[1];");
					}
					this.writeBranchToBlock(args[k].basicBlock, siblingBlocks);
					this.buffer.indent(-1);
				}
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
	this.buffer.write("function " + declaration.name + "(" + basicBlocks[0].arguments.map(arg => mangleLocal(arg.localName)).join(", ") + ") {");
	this.buffer.indent(1);
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
			if (basicBlocks[0].hasBackReferences) {
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
				this.buffer.write("}");
			}
		}
	}
	this.buffer.indent(-1);
	this.buffer.write("}");
	var beautifulName = declaration.beautifulName;
	if (beautifulName) {
		this.buffer.write("window[\"" + beautifulName + "\"] = " + declaration.name + ";");
	}
}

module.exports = CodeGen;
