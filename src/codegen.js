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
		throw "Unable to find block with name: " + descriptor.reference;
	}
	if (descriptor.inline) {
		this.buffer.write("// " + descriptor.inline.name);
		this.writeBasicBlock(descriptor.inline, siblingBlocks);
	} else {
		throw "Neither a reference to a basic block nor inline!";
	}
}

function findBasicBlock(blocks, descriptor) {
	if (descriptor.reference) {
		for (var i = 0; i < blocks.length; i++) {
			if (blocks[i].name == descriptor.reference) {
				return blocks[i];
			}
		}
		throw "Unable to find basic block: " + descriptor.reference;
	}
	if (descriptor.inline) {
		return descriptor.inline;
	}
	throw "Neither a reference nor an inline block!";
}

CodeGen.prototype.writeBasicBlock = function (basicBlock, siblingBlocks) {
	for (var j = 0; j < basicBlock.instructions.length; j++) {
		var instruction = basicBlock.instructions[j];
		if (instruction.inputs && instruction.inputs.length) {
			var value = mangleLocal(instruction.inputs[0].localName);
		}
		if ("instruction" in instruction) {
			this.buffer.write("// " + instruction.operation + " from " + instruction.instruction);
			switch (instruction.instruction) {
			case "register":
				break;
			case "integer_literal":
			case "float_literal":
				value = instruction.value;
				break;
			case "string_literal":
				value = instruction.value;
				break;
			case "enum":
				var enumName = instruction.type;
				var enumLayout = enums[enumName];
				if (!enumLayout) {
					throw "Unable to find enum: " + enumName;
				}
				if (instruction.inputs.length) {
					value = "[" + enumLayout.indexOf(instruction.caseName) + ", " + mangleLocal(instruction.inputs[0].localName) + "]";
				} else {
					value = "[" + enumLayout.indexOf(instruction.caseName) + "]";
				}
				break;
			case "struct":
				var structName = instruction.type;
				var structType = types[structName];
				if (!structType) {
					throw "No type for " + structName;
				}
				value = "{ " + instruction.inputs.map((arg, index) => "\"" + structType[index] + "\": " + mangleLocal(arg.localName)).join(", ") + " }";
				break;
			case "tuple":
				value = "[ " + instruction.inputs.map(arg => mangleLocal(arg.localName)).join(", ") + " ]";
				break;
			case "struct_extract":
				value = mangleLocal(instruction.inputs[0].localName) + JSON.stringify([instruction.fieldName]);
				break;
			case "tuple_extract":
				value = mangleLocal(instruction.inputs[0].localName) + JSON.stringify([instruction.fieldName | 0]);
				break;
			case "builtin":
				var builtinName = instruction.builtinName;
				value = builtinName + "(" + instruction.inputs.map(arg => mangleLocal(arg.localName)).join(", ") + ")";
				if (!this.writeBuiltIn(builtinName)) {
					throw "No builtin available for " + builtinName + " (expects " + (instruction.inputs.length - 1) + " arguments)";
				}
				break;
			case "function_ref":
				var functionName = instruction.functionName;
				value = functionName;
				this.writeBuiltIn(functionName);
				break;
			case "apply":
				value = mangleLocal(instruction.inputs[0].localName) + "(" + instruction.inputs.slice(1).map(input => mangleLocal(input.localName)).join(", ") + ")";
				break;
			case "partial_apply":
				value = mangleLocal(instruction.inputs[0].localName) + ".bind(this, " + instruction.inputs.slice(1).map(input => mangleLocal(input.localName)).join(", ") + ")";
				break;
			case "alloc_stack":
				if (instruction.inputs.length) {
					value = box("[" + mangleLocal(instruction.inputs[0].localName) + "]", 0);
				} else {
					value = box("[]", 0);
				}
				break;
			case "alloc_box":
				value = "[]";
				break;
			case "project_box":
				value = box(mangleLocal(instruction.inputs[0].localName), 0);
				break;
			case "struct_element_addr":
				value = box(mangleLocal(instruction.inputs[0].localName), "\"" + instruction.fieldName + "\"");
				break;
			case "global_addr":
				value = box(instruction.globalName, 0);
				break;
			case "load":
				value = unbox(mangleLocal(instruction.inputs[0].localName));
				break;
			case "unchecked_enum_data":
				value = mangleLocal(instruction.inputs[0].localName) + "[1]";
				break;
			case "unchecked_addr_cast":
			case "unchecked_ref_cast":
			case "pointer_to_address":
			case "address_to_pointer":
			case "ref_to_raw_pointer":
			case "raw_pointer_to_ref":
				value = mangleLocal(instruction.inputs[0].localName);
				break;
			case "index_raw_pointer":
				//value = mangleLocal(instruction.localName);
				//value = "; if (" + mangleLocal(instruction.offsetLocalName) + ") throw \"Pointer arithmetic disallowed!\"";
				//break;
			case "index_addr":
				value = box(unboxRef(mangleLocal(instruction.inputs[0].localName)), unboxField(mangleLocal(instruction.inputs[0].localName)) + " + " + mangleLocal(instruction.offsetLocalName));
				break;
			case "thin_to_thick_function":
			case "convert_function":
				break;
			default:
				throw "undefined /* unknown instruction " + instruction.instruction + ": " + instruction.unparsedArguments + " */";
				//value = "undefined /* unknown instruction " + instruction.instruction + ": " + instruction.arguments + " */";
				//break;
			}
		} else {
			this.buffer.write("// " + instruction.operation);			
		}
		this.buffer.write("// " + JSON.stringify(instruction));
		switch (instruction.operation) {
			case "assignment":
				this.buffer.write("var " + mangleLocal(instruction.destinationLocalName) + " = " + value + ";");
				break;
			case "return":
				this.buffer.write("return " + value + ";");
				break;
			case "branch":
				var targetBlock = findBasicBlock(siblingBlocks, instruction.block);
				targetBlock.arguments.forEach((arg, index) => {
					this.buffer.write("var " + mangleLocal(arg.localName) + " = " + ((index == 0) ? value : mangleLocal(instruction.inputs[index].localName)) + ";");
				});
				this.writeBranchToBlock(instruction.block, siblingBlocks);
				break;
			case "conditional_branch":
				this.buffer.write("if (" + value + ") {");
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
				this.buffer.write(unbox(mangleLocal(instruction.inputs[1].localName)) + " = " + value + ";");
				break;
			case "copy_addr":
				this.buffer.write(unbox(mangleLocal(instruction.inputs[1].localName)) + " = " + value + ";");
				break;
			case "switch_enum":
				this.buffer.write("switch (" + value + ") {")
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
				this.buffer.write("var " + mangleLocal(normalBasicBlock.arguments[0].localName) + " = " + value + "(" + instruction.inputs.slice(1).map(arg => mangleLocal(arg.localName)).join(", ") + ");");
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
				this.buffer.write("if (" + value + ") {");
				this.buffer.write("trap();", 1)
				this.buffer.write("}");
				break;
			case "unreachable":
				this.writeBuiltIn("trap");
				this.buffer.write("trap();")
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
		var firstBlockHasBackreferences = basicBlocks[0].referencesFrom.length > 0;
		if (firstBlockHasBackreferences) {
			this.buffer.write("var state = 0;");
		} else {
			this.buffer.write("var state;");
			this.buffer.write("// " + basicBlocks[0].name);
			this.writeBasicBlock(basicBlocks[0], basicBlocks);
		}
		if (!firstBlockHasBackreferences && basicBlocks.length == 2) {
			this.buffer.write("for (;;) {")
			this.buffer.indent(1);
			this.buffer.write("// " + basicBlocks[1].name);
			this.writeBasicBlock(basicBlocks[1], basicBlocks);
			this.buffer.indent(-1);
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
		}
		this.buffer.write("}");
	}
	this.buffer.indent(-1);
	this.buffer.write("}");
	var beautifulName = declaration.beautifulName;
	if (beautifulName) {
		this.buffer.write("window[\"" + beautifulName + "\"] = " + declaration.name + ";");
	}
}

module.exports = CodeGen;
