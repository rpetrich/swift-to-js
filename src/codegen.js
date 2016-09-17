var stdlib = require("./stdlib.js");
var enums = stdlib.enums;
var builtins = stdlib.builtins;

var Parser = require("./parser.js");
var esmangle = require("esmangle");
var escodegen = require("escodegen");

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

const identifier = name => ({
	type: "Identifier",
	name: name,
});

var mangledLocal = local => identifier("_" + local);

function literal(value) {
	if (typeof value == "undefined") {
		return unary("void", literal(0));
	}
	if (typeof value == "number" && value < 0) {
		return unary("-", literal(-value));
	}
	return {
		type: "Literal",
		value: value,
	};
}

const array = elements => ({
	type: "ArrayExpression",
	elements: elements,
});

const call = (callee, args) => ({
	type: "CallExpression",
	callee: callee,
	arguments: args,
});

const member = (object, property) => ({
	type: "MemberExpression",
	object: object,
	property: property,
	computed: true,
});

const box = (parent, field) => ({
	type: "ObjectExpression",
	properties: [{
		type: "Property",
		key: literal("ref"),
		kind: "init",
		value: parent,
	}, {
		type: "Property",
		key: literal("field"),
		kind: "init",
		value: field,
	}]
});

const unboxRef = boxed => member(boxed, literal("ref"));
const unboxField = boxed => member(boxed, literal("field"));
const unbox = boxed => member(unboxRef(boxed), unboxField(boxed));

const unary = (operator, value) => ({
	type: "UnaryExpression",
	prefix: true,
	operator: operator,
	argument: value,
});

const binary = (operator, left, right) => ({
	type: "BinaryExpression",
	operator: operator,
	left: left,
	right: right,
});

const ternary = (test, consequent, alternate) => ({
	type: "ConditionalExpression",
	test: test,
	alternate: alternate,
	consequent: consequent,
});

const assignment = (left, right) => ({
	type: "AssignmentExpression",
	operator: "=",
	left: left,
	right: right,
});

const assignments = pairs => pairs.map(pair => expressionStatement(assignment(pair[0], pair[1])));

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

const withSource = (node, source) => {
	if (source) {
		var comment = " sil:" + source.sil;
		if (source.file) {
			comment = " " + source.file + ":" + source.line + comment;
		}
		withAddedComment(node, comment);
	}
	return node;
};

const expressionStatement = expression => ({
	type: "ExpressionStatement",
	expression: expression,
})

const declarator = (id, init) => ({
	type: "VariableDeclarator",
	id: id,
	init: init,
});

const declaration = (id, init) => ({
	type: "VariableDeclaration",
	kind: "var",
	declarations: [declarator(id, init)],
});

const declarations = declarations => declarations.length == 0 ? [] : [{
	type: "VariableDeclaration",
	kind: "var",
	declarations: declarations.map(declaration => declarator(declaration[0], declaration[1])),
}];

const switchCase = (test, consequents) => ({
	type: "SwitchCase",
	test: test,
	consequent: consequents,
});

const assignPrototype = (type, key, value) => expressionStatement(assignment(member(member(type, literal("prototype")), key), value));

function CodeGen(parser) {
	this.buffer = new IndentedBuffer();
	this.body = [];
	this.types = parser.types;
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

const hasVariable = (functionContext, variable) => {
	return functionContext.variables.indexOf(variable.name) != -1;
};

const addVariable = (functionContext, newVariable) => {
	if (hasVariable(functionContext, newVariable)) {
		return false;
	}
	functionContext.variables.push(newVariable.name);
	return true;
}

CodeGen.prototype.branchToBlockNodes = function (descriptor, siblingBlocks, functionContext) {
	if (descriptor.reference) {
		for (var i = 0; i < siblingBlocks.length; i++) {
			if (siblingBlocks[i].name == descriptor.reference) {
				if (functionContext.nextBlock == siblingBlocks[i]) {
					// Optimization to avoid writing a switch = ... and break when we don't have to
					return [];
				}
				addVariable(functionContext, identifier("state"));
				var jump = expressionStatement(assignment(identifier("state"), literal(i)));
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

CodeGen.prototype.rValueForInput = function(input) {
	switch (input.interpretation) {
		case "contents":
			return mangledLocal(input.localNames[0]);
		case "integer_literal":
		case "float_literal":
		case "string_literal":
			return literal(input.value);
		case "undefined_literal":
			return unary("void", literal(0));
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
			var elements = [literal(index)];
			if (input.localNames.length) {
				elements.push(mangledLocal(input.localNames[0]));
			}
			return array(elements);
		case "struct":
			var structName = input.type;
			var structType = this.types[structName];
			if (!structType) {
				throw new Error("No type for " + structName);
			}
			if (structType.length != input.localNames.length) {
				throw new Error("Definition of " + structName + " does specifiy " + input.localNames.length + " fields: " + structType.join(", "));
			}
			return {
				type: "ObjectExpression",
				properties: input.localNames.map((localName, index) => ({
					type: "Property",
					key: literal(structType[index]),
					kind: "init",
					value: mangledLocal(localName),
				}))
			};
		case "tuple":
			if (input.localNames.length == 0) {
				return unary("void", literal(0));
			}
			return array(input.localNames.map(localName => mangledLocal(localName)));
		case "struct_extract":
			return member(mangledLocal(input.localNames[0]), literal(input.fieldName));
		case "tuple_extract":
			return member(mangledLocal(input.localNames[0]), literal(input.fieldName | 0));
		case "builtin":
			var builtinName = input.builtinName;
			if (!this.writeBuiltIn(builtinName)) {
				throw new Error("No builtin available for " + builtinName + " (expects " + (input.localNames.length - 1) + " arguments)");
			}
			return call(identifier(builtinName), input.localNames.map(localName => mangledLocal(localName)));
		case "function_ref":
			this.writeBuiltIn(input.functionName);
			return identifier(input.functionName);
		case "apply":
			var args = input.localNames.slice(1);
			var callee = mangledLocal(input.localNames[0]);
			if ("fieldName" in input) {
				callee = member(callee, literal(input.fieldName));
			}
			if (input.convention == "method") {
				var hiddenThisArg = args.pop();
				if ((hiddenThisArg != input.localNames[0]) || !input.fieldName) {
					args.unshift(hiddenThisArg);
					callee = member(callee, literal("call"));
				}
			}
			return call(callee, args.map(localName => mangledLocal(localName)));
		case "partial_apply":
			throw new Error("partial_apply not supported!");
		case "alloc_stack":
			return box(array(input.localNames.map(localName => mangledLocal(localName))), literal(0));
		case "alloc_box":
			return array([{
				type: "ObjectExpression",
				properties: []
			}]);
		case "alloc_ref":
			return {
				type: "NewExpression",
				callee: identifier(input.type),
				arguments: [],
			};
		case "project_box":
			return box(mangledLocal(input.localNames[0]), literal(0));
		case "struct_element_addr":
			return box(unbox(mangledLocal(input.localNames[0])), literal(input.fieldName));
		case "ref_element_addr":
			return box(mangledLocal(input.localNames[0]), literal(input.fieldName));
		case "global_addr":
			return box(identifier(input.globalName), literal(0));
		case "load":
			return unbox(mangledLocal(input.localNames[0]));
		case "unchecked_enum_data":
			return {
				type: "MemberExpression",
				object: mangledLocal(input.localNames[0]),
				property: literal(1),
				computed: true,
			};
		case "select_enum":
			throw new Error("select_enum is not supported yet!");
		case "select_value":
			if (input.values.length == 2) {
				var comparison;
				if ("value" in input.values[0]) {
					comparison = binary("===", mangledLocal(input.localNames[0]), literal(input.values[0].value));
				} else {
					comparison = binary("!==", mangledLocal(input.localNames[0]), literal(input.values[1].value));
				}
				return ternary(comparison, mangledLocal(input.localNames[1]), mangledLocal(input.localNames[2]));
			} else {
				throw new Error("select_value with more than two arguments is not supported yet!");
			}
		case "index_raw_pointer":
		case "index_addr":
			var address = mangledLocal(input.localNames[0]);
			return box(unboxRef(address), binary("+", unboxField(address), mangledLocal(input.localNames[1])));
		case "metatype":
			return unary("void", literal(0));
		case "class_method":
			return member(mangledLocal(input.localNames[0]), literal(input.entry));
		case "open_existential_ref":
			return box(array([]), literal(0));
	}
	throw new Error("Unable to interpret rvalue as " + input.interpretation + " from " + input.line);
}

CodeGen.prototype.lValueForInput = function (input) {
	switch (input.interpretation) {
		case "contents":
			return unbox(mangledLocal(input.localNames[0]));
		case "ref_element_addr":
		case "struct_element_addr":
			return member(mangledLocal(input.localNames[0]), literal(input.fieldName));
		case "index_raw_pointer":
		case "index_addr":
			var address = mangledLocal(input.localNames[0]);
			return member(unboxRef(address), binary("+", unboxField(address), mangledLocal(input.localNames[1])))
		case "struct_extract":
			return member(mangledLocal(input.localNames[0]), literal(input.fieldName));
		case "tuple_extract":
			return member(mangledLocal(input.localNames[0]), literal(input.fieldName | 0));
	}
	throw new Error("Unable to interpret lvalue as " + input.interpretation + " with " + input.line);
}

CodeGen.prototype.nodesForInstruction = function (instruction, basicBlock, siblingBlocks, functionContext) {
	switch (instruction.operation) {
		case "assignment":
			var init = this.rValueForInput(instruction.inputs[0]);
			addVariable(functionContext, mangledLocal(instruction.destinationLocalName));
			return [expressionStatement(assignment(mangledLocal(instruction.destinationLocalName), init))];
		case "return":
			return [{
				type: "ReturnStatement",
				argument: this.rValueForInput(instruction.inputs[0]),
			}];
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
				addVariable(functionContext, mangledLocal(arg.localName));
				var argumentDeclaration = [mangledLocal(arg.localName), this.rValueForInput(instruction.inputs[index])];
				if (instruction.inputs.some(input => input.localNames.indexOf(arg.localName) != -1)) {
					conflictingArguments.push(argumentDeclaration);
				} else {
					nonConflictingArguments.push(argumentDeclaration);
				}
			});
			var result = assignments(nonConflictingArguments.concat(conflictingArguments));
			return result.concat(this.branchToBlockNodes(instruction.block, siblingBlocks, functionContext));
		case "conditional_branch":
			return [{
				type: "IfStatement",
				test: this.rValueForInput(instruction.inputs[0]),
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
			var targetBlock = findBasicBlock(siblingBlocks, instruction.trueBlock);
			var value = this.rValueForInput(instruction.inputs[0]);
			targetBlock.arguments.forEach(arg => addVariable(functionContext, mangledLocal(arg.localName)));
			return [{
				type: "IfStatement",
				test: instruction.exact ? binary("==", member(value, literal("constructor")), identifier(instruction.type)) : binary("instanceof", value, identifier(instruction.type)),
				consequent: {
					type: "BlockStatement",
					body: assignments(targetBlock.arguments.map((arg, index) => [mangledLocal(arg.localName), this.rValueForInput(instruction.inputs[index])])).concat(this.branchToBlockNodes(instruction.trueBlock, siblingBlocks, functionContext)),
				},
				alternate: {
					type: "BlockStatement",
					body: this.branchToBlockNodes(instruction.falseBlock, siblingBlocks, functionContext),
				},
			}];
		case "conditional_defined_branch":
			var targetBlock = findBasicBlock(siblingBlocks, instruction.trueBlock);
			var value = this.rValueForInput(instruction.inputs[0]);
			targetBlock.arguments.forEach(arg => addVariable(functionContext, mangledLocal(arg.localName)));
			return [{
				type: "IfStatement",
				test: binary("!==", value, literal(undefined)),
				consequent: {
					type: "BlockStatement",
					body: assignments(targetBlock.arguments.map((arg, index) => [mangledLocal(arg.localName), this.rValueForInput(instruction.inputs[index])])).concat(this.branchToBlockNodes(instruction.trueBlock, siblingBlocks, functionContext)),
				},
				alternate: {
					type: "BlockStatement",
					body: this.branchToBlockNodes(instruction.falseBlock, siblingBlocks, functionContext),
				},
			}];
		case "store":
		case "copy_addr":
			return [expressionStatement(assignment(this.lValueForInput(instruction.inputs[1]), this.rValueForInput(instruction.inputs[0])))];
		case "switch_enum":
			var args = instruction.cases;
			var enumName = instruction.type;
			var enumLayout = enums[enumName];
			if (!enumLayout) {
				throw "Unable to find enum: " + enumName;
			}
			var value = member(this.rValueForInput(instruction.inputs[0]), literal(0));
			var resultNode;
			var currentNode;
			var elseCase;
			instruction.cases.forEach(enumCase => {
				var caseName = Parser.caseNameForEnum(enumCase.case);
				if (typeof caseName == "undefined") {
					elseCase = caseName;
				} else {
					var newNode = {
						type: "IfStatement",
						test: binary("==", value, literal(enumLayout.indexOf(caseName))),
						consequent: {
							type: "BlockStatement",
							body: this.branchToBlockNodes(enumCase.basicBlock, siblingBlocks, functionContext),
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
			var errorBasicBlock = findBasicBlock(siblingBlocks, instruction.errorBlock);
			errorBasicBlock.arguments.forEach(arg => addVariable(functionContext, mangledLocal(arg.localName)));
			return [{
				type: "TryStatement",
				block: {
					type: "BlockStatement",
					body: this.branchToBlockNodes(instruction.normalBlock, siblingBlocks, functionContext),
				},
				handler: {
					type: "CatchClause",
					param: identifier("e"),
					body: {
						type: "BlockStatement",
						body: [expressionStatement(assignment(mangledLocal(errorBasicBlock.arguments[0].localName), identifier("e")))].concat(this.branchToBlockNodes(instruction.errorBlock, siblingBlocks, functionContext)),
					}
				}
			}];
			break;
		case "conditional_fail":
			this.writeBuiltIn("trap");
			return [{
				type: "IfStatement",
				test: this.rValueForInput(instruction.inputs[0]),
				consequent: expressionStatement(call(identifier("trap"), [])),
			}];
		case "unreachable":
			this.writeBuiltIn("trap");
			return [expressionStatement(call(identifier("trap"), []))];
		case "throw":
			return [{
				type: "ThrowStatement",
				argument: this.rValueForInput(instruction.inputs[0]),
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
	//headerNodes.push(expressionStatement(call(member(identifier("console"), literal("log")), [literal(basicBlock.name)].concat(basicBlock.arguments.map(arg => mangledLocal(arg.localName))))))
	return withAddedComment(basicBlock.instructions.reduce((nodes, instruction) => {
		var newNodes = this.nodesForInstruction(instruction, basicBlock, siblingBlocks, functionContext);
		if (newNodes.length > 0) {
			withSource(newNodes[0], instruction.source);
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
	this.body.push(declaration(identifier(global.name), array([])));
}

CodeGen.prototype.ensureExports = function() {
	if (!this.hasWrittenExports) {
		this.hasWrittenExports = true;
		// Regular declaration isn't well supported by closure compiler
		//this.body.push(declaration(identifier("exports"), ternary(binary("==", unary("typeof", identifier("module")), literal("undefined")), identifier("window"), member(identifier("module"), literal("exports")))));
		this.body.push(declaration(identifier("exports")));
		this.body.push({
			type: "IfStatement",
			test: binary("==", unary("typeof", identifier("module")), literal("undefined")),
			consequent: expressionStatement(assignment(identifier("exports"), identifier("window"))),
			alternate: expressionStatement(assignment(identifier("exports"), member(identifier("module"), literal("exports")))),
		})
	}
}

CodeGen.prototype.export = function(publicName, internalName) {
	this.ensureExports();
	this.body.push(expressionStatement(assignment(member(identifier("exports"), literal(publicName)), identifier(internalName))));	
}

CodeGen.prototype.consumeFunction = function(fn) {
	var basicBlocks = fn.basicBlocks;
	if (basicBlocks.length == 0) {
		// No basic blocks, some kind of weird declaration we don't support yet
		return;
	}
	var body = [];
	var functionContext = {
		variables: [],
	};
	// Apply calling convention to the argument list
	var args = basicBlocks[0].arguments;
	var useMethodCallingConvention = fn.convention == "method";
	if (useMethodCallingConvention) {
		var hiddenThisArg = args[args.length - 1];
		args = args.slice(0, args.length - 1);
	}
	// Convert the this argument to a variable
	if (useMethodCallingConvention) {
		body.push(expressionStatement(assignment(mangledLocal(hiddenThisArg.localName), { type: "ThisExpression" })));
		addVariable(functionContext, mangledLocal(hiddenThisArg.localName));
	}
	// Setup the JavaScript AST
	var cases;
	fn.basicBlocks.forEach((basicBlock, index) => {
		functionContext.nextBlock = fn.basicBlocks[index + 1];
		if (cases) {
			cases.push(switchCase(literal(index), this.nodesForBasicBlock(basicBlock, basicBlocks, functionContext)));
		} else if (basicBlock.hasBackReferences) {
			body.push(expressionStatement(assignment(identifier("state"), literal(index))));
			functionContext.insideSwitch = true;
			cases = [switchCase(literal(index), this.nodesForBasicBlock(basicBlock, basicBlocks, functionContext))];
			body.push({
				type: "ForStatement",
				body: {
					type: "SwitchStatement",
					discriminant: identifier("state"),
					cases: cases,
				}
			});
		} else if (hasVariable(functionContext, identifier("state"))) {
			body.push(expressionStatement(assignment(identifier("state"), literal(index + 1))));
			// Recreate the block with the "insideSwitch" flag set, so that break statements work correctly
			functionContext.insideSwitch = true;
			body.push.apply(body, this.nodesForBasicBlock(basicBlock, basicBlocks, functionContext));
			cases = [];
			body.push({
				type: "ForStatement",
				body: {
					type: "SwitchStatement",
					discriminant: identifier("state"),
					cases: cases,
				}
			});
		} else {
			body.push.apply(body, this.nodesForBasicBlock(basicBlock, basicBlocks, functionContext));
		}
	});
	// Write the arguments
	body = declarations(functionContext.variables.map(variableName => [identifier(variableName)])).concat(body);
	// Create the function
	this.body.push({
		type: "FunctionDeclaration",
		id: identifier(fn.name),
		params: args.map(arg => mangledLocal(arg.localName)),
		body: {
			type: "BlockStatement",
			body: body,
		},
		loc: null,
	});
	// Assign the public name
	var beautifulName = fn.beautifulName;
	if (beautifulName) {
		this.export(beautifulName, fn.name);
	}
}

CodeGen.prototype.consumeVTable = function(declaration) {
	if (!/^_/.test(declaration.name)) {
		this.body.push(withAddedComment({
			type: "FunctionDeclaration",
			id: identifier(declaration.name),
			params: [],
			body: {
				type: "BlockStatement",
				body: [],
			}
		}, "* @constructor", false, true));
		this.export(declaration.name, declaration.name);
		for (var key in declaration.entries) {
			if (declaration.entries.hasOwnProperty(key)) {
				this.body.push(assignPrototype(identifier(declaration.name), literal(key), literal(declaration.entries[key])));
			}
		}
	}
}

CodeGen.prototype.end = function() {
	var program = {
		type: "Program",
		body: this.body,
	};
	// console.log(JSON.stringify(program, null, 2));
	if (false) {
		this.buffer.write(escodegen.generate(esmangle.mangle(program), {
			format: {
				renumber: true,
				hexadecimal: true,
				escapeless: true,
				compact: true,
				semicolons: false,
				parentheses: false,
			},
		}));
	} else {
		this.buffer.write(escodegen.generate(program, {
			format: {
				json: true,
				quotes: "double",
			},
			comment: true,
		}));
	}
}

module.exports = CodeGen;
