var Parser = require("./parser.js");
var esmangle = require("esmangle");
var escodegen = require("escodegen");
var functions = require("./stdlib.js").functions;
var js = require("./estree.js");

function CodeGen(parser) {
	this.body = [];
	this.deferredBody = [];
	this.types = parser.types;
	this.globals = parser.globals;
	this.builtins = parser.builtins;
	this.emittedFunctions = {};
}

const withAddedComment = (nodeOrNodeList, comment, isTrailing, isMultiLine) => {
	var key = isTrailing ? "trailingComments" : "leadingComments";
	var value = [{
		type: isMultiLine ? "Multiline" : "Line",
		value: comment,
	}];
	var dest = "0" in nodeOrNodeList ? nodeOrNodeList[isTrailing ? nodeOrNodeList.length - 1 : 0] : nodeOrNodeList;
	if (dest[key]) {
		dest[key] = isTrailing ? dest[key].concat(value) : value.concat(dest[key]);
	} else {
		dest[key] = value;
	}
	return nodeOrNodeList;
}

const withSource = (node, source, additionalComment) => {
	if (source) {
		var comment = " sil:" + source.sil;
		if (source.file) {
			comment = " " + source.file + ":" + source.line + comment;
			node.loc = { start: { line: source.line, column: source.column }, source: source.file };
		}
		if (additionalComment) {
			comment += " " + additionalComment;
		}
		withAddedComment(node, comment);
	}
	return node;
};

function FunctionContext(codegen) {
	this.variables = [];
	this.codegen = codegen;
}

FunctionContext.prototype.hasVariable = function (variable) {
	return this.variables.indexOf(variable.name) != -1;
};

FunctionContext.prototype.addVariable = function (newVariable) {
	if (this.hasVariable(newVariable)) {
		return false;
	}
	this.variables.push(newVariable.name);
	return true;
}

FunctionContext.prototype.tempVariable = function () {
	var i = 0;
	while (!this.addVariable(js.identifier("$" + i))) {
		i++;
	}
	return js.identifier("$" + i);
}

CodeGen.prototype.branchToBlockNodes = function (descriptor, siblingBlocks, functionContext) {
	if (descriptor.reference) {
		for (var i = 0; i < siblingBlocks.length; i++) {
			if (siblingBlocks[i].name == descriptor.reference) {
				if (functionContext.nextBlock == siblingBlocks[i]) {
					// Optimization to avoid writing a switch = ... and break when we don't have to
					return [];
				}
				functionContext.addVariable(js.identifier("state"));
				var jump = js.expressionStatement(js.assignment(js.identifier("state"), js.literal(i)));
				return functionContext.insideSwitch ? [jump, { type: "BreakStatement" }] : [jump];
			}
		}
		throw new Error("Unable to find block with name: " + descriptor.reference);
	}
	if (descriptor.inline) {
		return this.nodesForBasicBlock(descriptor.inline, siblingBlocks, functionContext);
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

CodeGen.prototype.findType = function(name, personality) {
	var type = this.types[name];
	if (!type) {
		throw new Error("Unable to find type: " + name);
	}
	if (personality) {
		if (type.personality !== personality) {
			throw new Error("Expected " + name + " to be a " + personality + ", is a " + type.personality + " instead!");
		}
	}
	return type;
}

CodeGen.prototype.nodesForStoreDeep = function (dest, source, typeName, functionContext) {
	var type = this.types[typeName];
	if (type) {
		switch (type.personality) {
			case "struct":
				var nodes = [];
				if (type.fields.length > 1) {
					if (source.type != "Identifier") {
						var temp = functionContext.tempVariable();
						nodes.push(js.expressionStatement(js.assignment(temp, source)));
						source = temp;
					}
					if (dest.type != "Identifier") {
						var temp = functionContext.tempVariable();
						nodes.push(js.expressionStatement(js.assignment(temp, dest)));
						dest = temp;
					}
				}
				return type.fields.reduce((nodes, field) => nodes.concat(this.nodesForStoreDeep(js.member(dest, js.literal(field.name)), js.member(source, js.literal(field.name)), field.type, functionContext)), nodes);
			case "enum":
				// TODO: Store the value field of the enum type, based on the tag
				return [js.expressionStatement(js.assignment(js.member(dest, js.literal(0)), js.member(source, js.literal(0))))];
		}
	}
	return [js.expressionStatement(js.assignment(dest, source))];
}

CodeGen.prototype.nodeForAllocDeep = function (type) {
	if (type) {
		switch (type.personality) {
			case "struct":
				var properties = [];
				type.fields.forEach(field => {
					var subNode = this.nodeForAllocDeep(this.types[field.type]);
					if (subNode) {
						properties.push({
							type: "Property",
							key: js.identifier(field.name),
							kind: "init",
							value: subNode
						});
					}
				});
				return { type: "ObjectExpression", properties: properties };
			case "enum":
				return js.array([]);
		}
	}
}

CodeGen.prototype.nodeForCopyDeep = function (source, type, functionContext) {
	if (type) {
		switch (type.personality) {
			case "struct":
				const copyFrom = source => ({
					type: "ObjectExpression",
					properties: type.fields.map(field => ({
						type: "Property",
						key: js.literal(field.name),
						kind: "init",
						value: this.nodeForCopyDeep(js.member(source, js.literal(field.name)), this.types[field.type], functionContext),
					}))
				});
				if (type.fields.length > 1) {
					var temp = functionContext.tempVariable();
					return js.sequence([js.assignment(temp, source), copyFrom(temp)]);
				}
				return copyFrom(source);
			case "enum":
				// TODO: Copy the value field of the enum type, based on the tag
				return js.array([js.member(source, js.literal(0))]);
		}
	}
	return source;
}

CodeGen.prototype.rValueForInput = function(input, functionContext) {
	switch (input.interpretation) {
		case "contents":
			return this.nodeForCopyDeep(js.mangledLocal(input.localNames[0]), this.types[input.type], functionContext);
		case "ref_to_raw_pointer":
			return js.box(js.mangledLocal(input.localNames[0]), js.literal(0));
		case "raw_pointer_to_ref":
			return js.unboxRef(js.mangledLocal(input.localNames[0]));
		case "integer_literal":
		case "float_literal":
		case "string_literal":
			return js.literal(input.value);
		case "undefined_literal":
			return js.unary("void", js.literal(0));
		case "null_literal":
			return js.literal(null);
		case "enum":
			var type = this.findType(input.type, "enum");
			var index = type.cases.indexOf(input.caseName);
			if (index == -1) {
				throw new Error("Unable to find case: " + input.caseName + " in " + input.type);
			}
			var elements = [js.literal(index)];
			if (input.localNames.length) {
				elements.push(js.mangledLocal(input.localNames[0]));
			}
			return js.array(elements);
		case "struct":
			var type = this.findType(input.type, "struct");
			if (type.fields.length != input.localNames.length) {
				throw new Error("Definition of " + input.type + " specified " + input.localNames.length + " fields: " + type.fields.map(field => field.name).join(", "));
			}
			return {
				type: "ObjectExpression",
				properties: input.localNames.map((localName, index) => ({
					type: "Property",
					key: js.literal(type.fields[index].name),
					kind: "init",
					value: js.mangledLocal(localName),
				}))
			};
		case "tuple":
			if (input.localNames.length == 0) {
				return js.unary("void", js.literal(0));
			}
			return js.array(input.localNames.map(localName => js.mangledLocal(localName)));
		case "struct_extract":
			var fieldName = input.fieldName;
			var field = this.findType(input.type).fields.find(field => field.name == fieldName);
			var fieldType = field ? this.types[field.type] : undefined;
			return this.nodeForCopyDeep(js.member(js.mangledLocal(input.localNames[0]), js.literal(fieldName)), fieldType, functionContext);
		case "tuple_extract":
			return this.nodeForCopyDeep(js.member(js.mangledLocal(input.localNames[0]), js.literal(input.fieldName | 0)), this.types[input.type], functionContext);
		case "builtin":
			var builtinName = input.builtinName;
			if (!(builtinName in this.builtins)) {
				throw new Error("No builtin available for " + builtinName + " (expects " + input.localNames.length + " arguments)");
			}
			return this.builtins[input.builtinName](input, functionContext);
		case "function_ref":
			var functionName = input.functionName;
			if (functionName in functions && !this.emittedFunctions[functionName]) {
				this.emittedFunctions[functionName] = true;
				this.body.push(functions[functionName]);
			}
			return js.identifier(functionName);
		case "apply":
			var args = input.localNames.slice(1);
			var callee = js.mangledLocal(input.localNames[0]);
			if ("fieldName" in input) {
				var fieldName = input.fieldName;
				if (/\.foreign$/.test(fieldName)) {
					var match = fieldName.match(/\.(\w+)\!(getter|setter)?/);
					fieldName = match[1];
					if (match[2] == "getter") {
						return js.member(js.mangledLocal(args[args.length-1]), js.literal(fieldName));
					}
					if (match[2] == "setter") {
						return js.sequence([js.assignment(js.member(callee, js.literal(fieldName)), js.mangledLocal(args[args.length-2])), js.literal(undefined)]);
					}
				}
				callee = js.member(callee, js.literal(fieldName));
			}
			if (input.convention == "method" || input.convention == "objc_method") {
				var hiddenThisArg = args.pop();
				if ((hiddenThisArg != input.localNames[0]) || !input.fieldName) {
					args.unshift(hiddenThisArg);
					callee = js.property(callee, "call");
				}
			}
			return js.call(callee, args.map(js.mangledLocal));
		case "partial_apply":
			throw new Error("partial_apply not supported!");
		case "alloc_stack":
			var type = this.findType(input.type);
			var node = this.nodeForAllocDeep(type);
			return js.box(js.array(input.localNames.map(localName => js.mangledLocal(localName))), js.literal(0));
		case "alloc_ref":
			return js.newExpression(js.identifier(input.type), []);
		case "alloc_box":
			var type = this.findType(input.type);
			var node = this.nodeForAllocDeep(type);
			return js.box(js.array(node ? [node] : []), js.literal(0));
		case "project_box":
			return js.mangledLocal(input.localNames[0]);;
		case "struct_element_addr":
			return js.box(js.unbox(js.mangledLocal(input.localNames[0])), js.literal(input.fieldName));
		case "ref_element_addr":
			return js.box(js.mangledLocal(input.localNames[0]), js.literal(input.fieldName));
		case "init_enum_data_addr":
			// TODO: Call nodeForAllocDeep
			return js.box(js.unbox(js.mangledLocal(input.localNames[0])), js.literal(1));
		case "global_addr":
			var global = this.globals[input.globalName];
			if (global.beautifulName) {
				return js.box(js.identifier("exports"), js.literal(global.beautifulName));
			} else {
				return js.box(js.identifier(input.globalName), js.literal(0));
			}
		case "load":
			return this.nodeForCopyDeep(js.unbox(js.mangledLocal(input.localNames[0])), this.types[input.type], functionContext);
		case "unchecked_enum_data":
			return js.member(js.mangledLocal(input.localNames[0]), js.literal(1));
		case "unchecked_take_enum_data_addr":
			return js.box(js.unbox(js.mangledLocal(input.localNames[0])), js.literal(1));
		case "select_enum":
		case "select_enum_addr":
			var value = js.unboxIfAddr(input.interpretation, js.mangledLocal(input.localNames[0]));
			var caseField = js.member(value, js.literal(0));
			var type = this.findType(input.type, "enum");
			var caseLocals = input.localNames.slice(1);
			var elseIndex = input.cases.findIndex(descriptor => !"case" in descriptor);
			if (elseIndex == -1) {
				elseIndex = input.cases.length - 1;
			}
			var elseValue = js.mangledLocal(caseLocals[elseIndex]);
			caseLocals.splice(elseIndex, 1);
			var cases = input.cases.slice();
			cases.splice(elseIndex, 1);
			return cases.reduceRight((result, descriptor, index) => js.ternary(js.binary("==", caseField, js.literal(type.cases.indexOf(Parser.caseNameForEnum(descriptor.case)))), js.mangledLocal(caseLocals[index]), result), elseValue);
		case "select_value":
			var valueLocal = js.mangledLocal(input.localNames[0]);
			var result = js.mangledLocal(input.localNames[input.localNames.length - 1]);
			var localPairs = input.localNames.slice(1, input.localNames.length - 1).reverse();
			for (var i = 0; i < localPairs.length; i += 2) {
				result = js.ternary(js.binary("===", valueLocal, js.mangledLocal(localPairs[i + 1])), localPairs[i], result);
			}
			return result;
		case "select_nonnull":
		case "select_nonnull_addr":
			var value = js.unboxIfAddr(input.interpretation, js.mangledLocal(input.localNames[0]));
			return js.ternary(js.binary("!==", value, js.literal(null)), js.mangledLocal(input.localNames[1]), js.mangledLocal(input.localNames[2]));
		case "index_raw_pointer":
		case "index_addr":
			var address = js.mangledLocal(input.localNames[0]);
			return js.box(js.unboxRef(address), js.binary("+", js.unboxField(address), js.mangledLocal(input.localNames[1])));
		case "metatype":
			return js.unary("void", js.literal(0));
		case "class_method":
			var fieldName = input.entry;
			if (input.convention == "objc_method") {
				fieldName = fieldName.match(/\.(\w+)\!/)[1];
			}
			return js.member(js.mangledLocal(input.localNames[0]), js.literal(fieldName));
	}
	throw new Error("Unable to interpret rvalue as " + input.interpretation + " from " + input.line);
}

CodeGen.prototype.nodeForGlobal = function (globalName) {
	var global = this.globals[globalName];
	if (global.beautifulName) {
		return js.member(js.identifier("exports"), js.literal(global.beautifulName));
	} else {
		return js.member(js.identifier(globalName), js.literal(0));
	}
}

CodeGen.prototype.lValueForInput = function (input, functionContext) {
	switch (input.interpretation) {
		case "contents":
			return js.unbox(js.mangledLocal(input.localNames[0]));
		case "ref_element_addr":
		case "struct_element_addr":
			return js.member(js.mangledLocal(input.localNames[0]), js.literal(input.fieldName));
		case "index_raw_pointer":
		case "index_addr":
			var address = js.mangledLocal(input.localNames[0]);
			return js.member(js.unboxRef(address), js.binary("+", js.unboxField(address), js.mangledLocal(input.localNames[1])))
		case "struct_extract":
			return js.member(js.mangledLocal(input.localNames[0]), js.literal(input.fieldName));
		case "tuple_extract":
			return js.unbox(js.member(js.mangledLocal(input.localNames[0]), js.literal(input.fieldName | 0)));
		case "global_addr":
			var result = this.nodeForGlobal(input.globalName);
			if (input.alloc) {
				var type = this.findType(input.type);
				var node = this.nodeForAllocDeep(type);
				if (node) {
					return js.assignment(result, node);
				}
			}
			return result;
		case "alloc_stack":
			// Why do we need this?
			var type = this.findType(input.type);
			var node = this.nodeForAllocDeep(type);
			return js.member(js.array(input.localNames.map(localName => js.mangledLocal(localName))), js.literal(0));
		case "ref_to_raw_pointer":
			return js.member(js.mangledLocal(input.localNames[0]), js.literal(0));
	}
	throw new Error("Unable to interpret lvalue as " + input.interpretation + " with " + input.line);
}

CodeGen.prototype.nodesForInstruction = function (instruction, basicBlock, siblingBlocks, functionContext) {
	switch (instruction.operation) {
		case "assignment":
			var init = this.rValueForInput(instruction.inputs[0], functionContext);
			functionContext.addVariable(js.mangledLocal(instruction.destinationLocalName));
			return [js.expressionStatement(js.assignment(js.mangledLocal(instruction.destinationLocalName), init))];
		case "return":
			var input = instruction.inputs[0];
			if (input.interpretation == "tuple" && input.localNames.length == 0) {
				return [js.returnStatement()];
			}
			return [js.returnStatement(this.rValueForInput(input, functionContext))];
		case "branch":
			var targetBlock = findBasicBlock(siblingBlocks, instruction.block);
			// Branch instruction with arguments expects to be able to thread one argument into another
			// real world example:
			//	var _16 = _23, _17 = _32, _18 = _17;
			// needs to be reordered to:
			//	var _16 = _23, _18 = _17, _17 = _32;
			// to avoid clobbering _17 before it gets passed into _18
			var nonConflictingArguments = [];
			var conflictingArguments = [];
			targetBlock.arguments.forEach((arg, index) => {
				functionContext.addVariable(js.mangledLocal(arg.localName));
				var argumentDeclaration = [js.mangledLocal(arg.localName), this.rValueForInput(instruction.inputs[index], functionContext)];
				if (instruction.inputs.some(input => input.localNames.indexOf(arg.localName) != -1)) {
					conflictingArguments.push(argumentDeclaration);
				} else {
					nonConflictingArguments.push(argumentDeclaration);
				}
			});
			var result = js.assignments(nonConflictingArguments.concat(conflictingArguments));
			return result.concat(this.branchToBlockNodes(instruction.block, siblingBlocks, functionContext));
		case "conditional_branch":
			return [{
				type: "IfStatement",
				test: this.rValueForInput(instruction.inputs[0], functionContext),
				consequent: {
					type: "BlockStatement",
					body: this.branchToBlockNodes(instruction.trueBlock, siblingBlocks, functionContext),
				},
				alternate: {
					type: "BlockStatement",
					body: this.branchToBlockNodes(instruction.falseBlock, siblingBlocks, functionContext),
				},
			}];
		case "checked_cast_branch":
		case "checked_cast_addr_br":
			var value = this.rValueForInput(instruction.inputs[0], functionContext);
			var typeName = instruction.type;
			if (instruction.operation == "checked_cast_addr_br") {
				value = js.unbox(value);
				typeName = Parser.removePointer(typeName);
			}
			var type = this.findType(typeName);
			var test;
			if (type.personality == "protocol") {
				test = js.member(value, js.literal(typeName));
			} else if (instruction.exact) {
				test = js.binary("==", js.member(value, js.literal("constructor")), js.identifier(typeName));
			} else {
				test = js.binary("instanceof", value, js.identifier(typeName));
			}
			var targetBlock = findBasicBlock(siblingBlocks, instruction.trueBlock);
			targetBlock.arguments.forEach(arg => functionContext.addVariable(js.mangledLocal(arg.localName)));
			return [{
				type: "IfStatement",
				test: test,
				consequent: {
					type: "BlockStatement",
					body: js.assignments(targetBlock.arguments.map((arg, index) => [js.mangledLocal(arg.localName), this.rValueForInput(instruction.inputs[index], functionContext)])).concat(this.branchToBlockNodes(instruction.trueBlock, siblingBlocks, functionContext)),
				},
				alternate: {
					type: "BlockStatement",
					body: this.branchToBlockNodes(instruction.falseBlock, siblingBlocks, functionContext),
				},
			}];
		case "conditional_nonnull_branch":
			var targetBlock = findBasicBlock(siblingBlocks, instruction.trueBlock);
			var value = this.rValueForInput(instruction.inputs[0], functionContext);
			targetBlock.arguments.forEach(arg => functionContext.addVariable(js.mangledLocal(arg.localName)));
			return [{
				type: "IfStatement",
				test: js.binary("!==", value, js.literal(null)),
				consequent: {
					type: "BlockStatement",
					body: js.assignments(targetBlock.arguments.map((arg, index) => [js.mangledLocal(arg.localName), this.rValueForInput(instruction.inputs[index], functionContext)])).concat(this.branchToBlockNodes(instruction.trueBlock, siblingBlocks, functionContext)),
				},
				alternate: {
					type: "BlockStatement",
					body: this.branchToBlockNodes(instruction.falseBlock, siblingBlocks, functionContext),
				},
			}];
		case "alloc_global":
			var type = this.findType(instruction.type);
			var node = this.nodeForAllocDeep(type);
			if (node) {
				return [js.expressionStatement(js.assignment(this.nodeForGlobal(instruction.name), node))]
			}
			return [];
		case "store":
		case "copy_addr":
			var lValue = this.lValueForInput(instruction.inputs[1], functionContext);
			var rValue = this.rValueForInput(instruction.inputs[0], functionContext);
			if (instruction.initializes) {
				return [js.expressionStatement(js.assignment(lValue, this.nodeForCopyDeep(rValue, instruction.type, functionContext)))];
			} else {
				return this.nodesForStoreDeep(lValue, rValue, instruction.type, functionContext);
			}
		case "inject_enum_addr":
			var type = this.findType(instruction.type, "enum");
			return [js.expressionStatement(js.assignment(js.member(this.lValueForInput(instruction.inputs[0], functionContext), js.literal(0)), js.literal(type.cases.indexOf(instruction.caseName))))];
		case "switch_enum":
		case "switch_enum_addr":
			var args = instruction.cases;
			var type = this.findType(instruction.type, "enum");
			var value = js.unboxIfAddr(instruction.operation, this.rValueForInput(instruction.inputs[0], functionContext));
			var caseField = js.member(value, js.literal(0));
			var valueField = js.member(value, js.literal(1));
			var resultNode;
			var currentNode;
			var elseCase;
			instruction.cases.forEach(enumCase => {
				var caseName = Parser.caseNameForEnum(enumCase.case);
				if (typeof caseName == "undefined") {
					elseCase = caseName;
				} else {
					var targetBlock = findBasicBlock(siblingBlocks, enumCase.basicBlock);
					targetBlock.arguments.forEach(arg => functionContext.addVariable(js.mangledLocal(arg.localName)));
					var newNode = {
						type: "IfStatement",
						test: js.binary("==", caseField, js.literal(type.cases.indexOf(caseName))),
						consequent: {
							type: "BlockStatement",
							body: js.assignments(targetBlock.arguments.map((arg, index) => [js.mangledLocal(arg.localName), valueField])).concat(this.branchToBlockNodes(enumCase.basicBlock, siblingBlocks, functionContext))
						},
					};
					if (currentNode) {
						currentNode.alternate = newNode;
					} else {
						resultNode = newNode;
					}
					currentNode = newNode;
				}
			});
			if (elseCase) {
				currentNode.consequent = {
					type: "BlockStatement",
					body: this.branchToBlockNodes(elseCase.basicBlock, siblingBlocks, functionContext),
				};
			}
			return [resultNode];
		case "try_apply":
			var rValues = instruction.inputs.map(input => this.rValueForInput(input));
			var callee = rValues[0];
			var args = rValues.slice(1);
			if (instruction.convention == "method" || instruction.convention == "objc_method") {
				callee = js.property(callee, "call");
				args.unshift(args.pop());
			}
			var call = js.call(callee, args);
			var normalBasicBlock = findBasicBlock(siblingBlocks, instruction.normalBlock);
			normalBasicBlock.arguments.forEach(arg => functionContext.addVariable(js.mangledLocal(arg.localName)));
			if (normalBasicBlock.arguments.length > 0) {
				call = js.assignment(js.mangledLocal(normalBasicBlock.arguments[0].localName), call);
			}
			var errorBasicBlock = findBasicBlock(siblingBlocks, instruction.errorBlock);
			errorBasicBlock.arguments.forEach(arg => functionContext.addVariable(js.mangledLocal(arg.localName)));
			var errorTemp = js.identifier("e");
			recover = js.assignment(js.mangledLocal(errorBasicBlock.arguments[0].localName), errorTemp);
			// TODO: Place the normalBlock outside the try, that way throws from inside it will bubble up instead of be caught by our catch clause
			return [{
				type: "TryStatement",
				block: {
					type: "BlockStatement",
					body: [js.expressionStatement(call)].concat(this.branchToBlockNodes(instruction.normalBlock, siblingBlocks, functionContext)),
				},
				handler: {
					type: "CatchClause",
					param: errorTemp,
					body: {
						type: "BlockStatement",
						body: [js.expressionStatement(recover)].concat(this.branchToBlockNodes(instruction.errorBlock, siblingBlocks, functionContext)),
					}
				}
			}];
			break;
		case "conditional_fail":
			this.builtins.trap({builtinName: "trap", localNames: []}, functionContext);
			return [{
				type: "IfStatement",
				test: this.rValueForInput(instruction.inputs[0], functionContext),
				consequent: js.expressionStatement(js.call(js.identifier("trap"), [])),
			}];
		case "unreachable":
			//this.builtins.trap({builtinName: "trap", localNames: []}, functionContext);
			//return [js.expressionStatement(js.call(js.identifier("trap"), []))];
			return [];
		case "throw":
			return [{
				type: "ThrowStatement",
				argument: this.rValueForInput(instruction.inputs[0], functionContext),
			}];
		// default:
		// 	// TODO: Add comment
		// 	result.push({
		// 		type: "EmptyStatement",
		// 	});
		// 	break;
	}
	throw new Error("Unknown instruction operation: " + instruction.operation);
}

CodeGen.prototype.nodesForBasicBlock = function (basicBlock, siblingBlocks, functionContext) {
	var headerNodes = [];
	//headerNodes.push(js.expressionStatement(js.call(js.member(js.identifier("console"), js.literal("log")), [js.literal(basicBlock.name)].concat(basicBlock.arguments.map(arg => js.mangledLocal(arg.localName))))))
	return withAddedComment(basicBlock.instructions.reduce((nodes, instruction) => {
		var newNodes = this.nodesForInstruction(instruction, basicBlock, siblingBlocks, functionContext);
		if (newNodes.length > 0) {
			withSource(newNodes[0], instruction.source, JSON.stringify(instruction));
		}
		// newNodes.forEach(node => { console.log(JSON.stringify(node)), escodegen.generate(node) });
		return nodes.concat(newNodes);
	}, headerNodes), " " + basicBlock.name);
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

CodeGen.prototype.consumeGlobal = function(global) {
	if (global.beautifulName) {
		// this.body.push(js.expressionStatement(js.assignment(js.member(js.identifier("exports"), js.literal(global.beautifulName)), js.array([]))));
	} else {
		this.body.push(js.declaration(js.identifier(global.name), js.array([])));
	}
	if (global.initializer) {
		this.deferredBody.push(js.expressionStatement(js.call(js.identifier(global.initializer), [])))
	}
}

CodeGen.prototype.ensureExports = function() {
	if (!this.hasWrittenExports) {
		this.hasWrittenExports = true;
		// Regular declaration isn't well supported by closure compiler
		//this.body.push(js.declaration(js.identifier("exports"), js.ternary(js.binary("==", js.unary("typeof", js.identifier("module")), js.literal("undefined")), js.identifier("window"), js.member(js.identifier("module"), js.literal("exports")))));
		this.body.push(js.declaration(js.identifier("exports")));
		this.body.push({
			type: "IfStatement",
			test: js.binary("==", js.unary("typeof", js.identifier("module")), js.literal("undefined")),
			consequent: js.expressionStatement(js.assignment(js.identifier("exports"), js.identifier("window"))),
			alternate: js.expressionStatement(js.assignment(js.identifier("exports"), js.member(js.identifier("module"), js.literal("exports")))),
		})
	}
}

CodeGen.prototype.export = function(publicName, internalName) {
	this.ensureExports();
	this.body.push(js.expressionStatement(js.assignment(js.member(js.identifier("exports"), js.literal(publicName)), js.identifier(internalName))));	
}

CodeGen.prototype.consumeFunction = function(fn) {
	var basicBlocks = fn.basicBlocks;
	if (basicBlocks.length == 0) {
		// No basic blocks, some kind of weird declaration we don't support yet
		return;
	}
	if (this.emittedFunctions[fn.name]) {
		return;
	}
	var body = [];
	var functionContext = new FunctionContext(this);
	// Apply calling convention to the argument list
	var args = basicBlocks[0].arguments;
	var useMethodCallingConvention = fn.convention == "method" || fn.convention == "objc_method";
	if (useMethodCallingConvention) {
		var hiddenThisArg = args[args.length - 1];
		args = args.slice(0, args.length - 1);
	}
	// Convert the this argument to a variable
	if (useMethodCallingConvention) {
		body.push(js.expressionStatement(js.assignment(js.mangledLocal(hiddenThisArg.localName), { type: "ThisExpression" })));
		functionContext.addVariable(js.mangledLocal(hiddenThisArg.localName));
	}
	// Setup the JavaScript AST
	var cases;
	fn.basicBlocks.forEach((basicBlock, index) => {
		functionContext.nextBlock = fn.basicBlocks[index + 1];
		if (cases) {
			cases.push(js.switchCase(js.literal(index), this.nodesForBasicBlock(basicBlock, basicBlocks, functionContext)));
		} else if (basicBlock.hasBackReferences) {
			if (index == fn.basicBlocks.length - 1) {
				functionContext.nextBlock = basicBlock;
				cases = [js.switchCase(js.literal(index), this.nodesForBasicBlock(basicBlock, basicBlocks, functionContext))];
				body.push({
					type: "ForStatement",
					body: {
						type: "BlockStatement",
						body: this.nodesForBasicBlock(basicBlock, basicBlocks, functionContext),
					}
				});
			} else {
				body.push(js.expressionStatement(js.assignment(js.identifier("state"), js.literal(index))));
				functionContext.insideSwitch = true;
				cases = [js.switchCase(js.literal(index), this.nodesForBasicBlock(basicBlock, basicBlocks, functionContext))];
				body.push({
					type: "ForStatement",
					body: {
						type: "SwitchStatement",
						discriminant: js.identifier("state"),
						cases: cases,
					}
				});
			}
		} else if (functionContext.hasVariable(js.identifier("state"))) {
			body.push(js.expressionStatement(js.assignment(js.identifier("state"), js.literal(index + 1))));
			// Recreate the block with the "insideSwitch" flag set, so that break statements work correctly
			body.push.apply(body, this.nodesForBasicBlock(basicBlock, basicBlocks, functionContext));
			functionContext.insideSwitch = true;
			cases = [];
			body.push({
				type: "ForStatement",
				body: {
					type: "SwitchStatement",
					discriminant: js.identifier("state"),
					cases: cases,
				}
			});
		} else {
			body.push.apply(body, this.nodesForBasicBlock(basicBlock, basicBlocks, functionContext));
		}
	});
	// Write the arguments
	body = js.declarations(functionContext.variables.map(variableName => [js.identifier(variableName)])).concat(body);
	// Create the function
	this.body.push(js.functionDeclaration(js.identifier(fn.name), args.map(arg => js.mangledLocal(arg.localName)), body));
	// Assign the public name
	var beautifulName = fn.beautifulName;
	if (beautifulName) {
		this.export(beautifulName, fn.name);
	}
}

CodeGen.prototype.consumeVTable = function(classDeclaration) {
	if (!/^_/.test(classDeclaration.name)) {
		var classIdentifier = js.identifier(classDeclaration.name);
		var prototypeMember = js.member(classIdentifier, js.literal("prototype"));
		// Declare class
		this.body.push(withAddedComment(js.functionDeclaration(classIdentifier, [], []), "* @constructor", false, true));
		// Expose publicly
		if (classDeclaration.beautifulName) {
			this.export(classDeclaration.name, classDeclaration.beautifulName);
		}
		// Declare superclass, if any
		var type = this.findType(classDeclaration.name, "class");
		var prototypeIdentifier = js.identifier(classDeclaration.name + "__prototype");
		var prototypeAssignment;
		if (type && type.superclass) {
			var prototypeAssignment = js.assignment(prototypeMember, js.newExpression(js.identifier(type.superclass)));
			this.body.push(js.declaration(prototypeIdentifier, prototypeAssignment));
			this.body.push(js.expressionStatement(js.assignment(js.member(prototypeIdentifier, js.literal("constructor")), classIdentifier)));
		} else {
			this.body.push(js.declaration(prototypeIdentifier, prototypeMember));
		}
		// Write method table
		for (var key in classDeclaration.entries) {
			if (classDeclaration.entries.hasOwnProperty(key)) {
				this.body.push(js.expressionStatement(js.assignment(js.member(prototypeIdentifier, js.literal(key)), js.identifier(classDeclaration.entries[key]))));
			}
		}
	}
}

CodeGen.prototype.end = function() {
	var program = {
		type: "Program",
		body: this.body.concat(this.deferredBody),
	};
	// console.log(JSON.stringify(program, null, 2));
	var result;
	if (false) {
		result = escodegen.generate(esmangle.mangle(program), {
			format: {
				renumber: true,
				hexadecimal: true,
				escapeless: true,
				compact: true,
				semicolons: false,
				parentheses: false,
			},
			sourceMap: true,
			sourceMapWithCode: true,
		});
	} else {
		result = escodegen.generate(program, {
			format: {
				json: true,
				quotes: "double",
			},
			comment: true,
			sourceMap: true,
			sourceMapWithCode: true,
		});
	}
	this.output = result.code;
	this.sourceMap = result.map;
}

module.exports = CodeGen;
