var stdlib = require("./stdlib.js");
var types = stdlib.types;
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

const ternary = (test, alternate, consequent) => ({
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

const withAddedComment = (node, comment, isTrailing, isMultiLine) => {
	var key = isTrailing ? "trailingComments" : "leadingComments";
	var value = [{
		type: isMultiLine ? "Multiline" : "Line",
		value: comment,
	}];
	if (node[key]) {
		node[key] = node[key].concat(value);
	} else {
		node[key] = value;
	}
	return node;
}

const withSource = (node, source) => {
	if (source) {
		var comment = " sil:" + source.sil;
		if (source.file) {
			comment = " " + source.file + ":" + source.line + comment;
		}
		withAddedComment(comment);
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
	consequent: consequents.concat([{
		type: "BreakStatement",
	}]),
});

const assignPrototype = (type, key, value) => expressionStatement(assignment(member(member(type, literal("prototype")), key), value));

function CodeGen(parser) {
	this.buffer = new IndentedBuffer();
	this.body = [];
	this.program = {
		type: "Program",
		body: this.body,
	};
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
				return [expressionStatement(assignment(identifier("state"), literal(i)))]
			}
		}
		throw new Error("Unable to find block with name: " + descriptor.reference);
	}
	if (descriptor.inline) {
		return this.writeBasicBlock(descriptor.inline, siblingBlocks);
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
			var elements = [literal(0)];
			if (input.localNames.length) {
				elements.push(identifier(input.localNames[0]));
			}
			return array(elements);
		case "struct":
			var structName = input.type;
			var structType = types[structName];
			if (!structType) {
				throw new Error("No type for " + structName);
			}
			return {
				type: "ObjectExpression",
				properties: input.localNames.map((localName, index) => ({
					type: "Property",
					key: identifier(structType[index]),
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
			return array(input.localNames.map(localName => mangledLocal(localName)))
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
			return box(identifier(input.globalName), 0);
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

CodeGen.prototype.nodesForInstruction = function (instruction, basicBlock, siblingBlocks) {
	switch (instruction.operation) {
		case "assignment":
			var init = this.rValueForInput(instruction.inputs[0]);
			return [declaration(mangledLocal(instruction.destinationLocalName), init)];
		case "return":
			return [{
				type: "ReturnStatement",
				argument: this.rValueForInput(instruction.inputs[0]),
			}];
		case "branch":
			var targetBlock = findBasicBlock(siblingBlocks, instruction.block);
			var result = declarations(targetBlock.arguments.map((arg, index) => [mangledLocal(arg.localName), this.rValueForInput(instruction.inputs[index])]));
			return result.concat(this.writeBranchToBlock(instruction.block, siblingBlocks));
		case "conditional_branch":
			return [{
				type: "IfStatement",
				test: this.rValueForInput(instruction.inputs[0]),
				consequent: {
					type: "BlockStatement",
					body: this.writeBranchToBlock(instruction.trueBlock, siblingBlocks),
				},
				alternate: {
					type: "BlockStatement",
					body: this.writeBranchToBlock(instruction.falseBlock, siblingBlocks),
				},
			}];
		case "checked_cast_branch":
			var targetBlock = findBasicBlock(siblingBlocks, instruction.trueBlock);
			var value = this.rValueForInput(instruction.inputs[0]);
			return[{
				type: "IfStatement",
				test: instruction.exact ? binary("==", member(value, literal("constructor")), identifier(instruction.type)) : binary("instanceof", value, identifier(instruction.type)),
				consequent: {
					type: "BlockStatement",
					body: declarations(targetBlock.arguments.map((arg, index) => [mangledLocal(arg.localName), this.rValueForInput(instruction.inputs[index])])).concat(this.writeBranchToBlock(instruction.trueBlock, siblingBlocks)),
				},
				alternate: {
					type: "BlockStatement",
					body: this.writeBranchToBlock(instruction.falseBlock, siblingBlocks),
				},
			}];
		case "conditional_defined_branch":
			var targetBlock = findBasicBlock(siblingBlocks, instruction.trueBlock);
			var value = this.rValueForInput(instruction.inputs[0]);
			return [{
				type: "IfStatement",
				test: binary("!==", value, literal(undefined)),
				consequent: {
					type: "BlockStatement",
					body: declarations(targetBlock.arguments.map((arg, index) => [mangledLocal(arg.localName), this.rValueForInput(instruction.inputs[index])])).concat(this.writeBranchToBlock(instruction.trueBlock, siblingBlocks)),
				},
				alternate: {
					type: "BlockStatement",
					body: this.writeBranchToBlock(instruction.falseBlock, siblingBlocks),
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
			var value = this.rValueForInput(instruction.inputs[0]);
			return [{
				type: "SwitchStatement",
				discriminant: value,
				cases: instruction.cases.map(enumCase => {
					var caseName = Parser.caseNameForEnum(enumCase.case);
					var targetBlock = findBasicBlock(siblingBlocks, enumCase.basicBlock);
					return switchCase(
						literal(caseName.enumLayout ? enumLayout.indexOf(caseName) : null),
						declarations(targetBlock.arguments.map((arg, index) => [mangledLocal(arg.localName), this.rValueForInput(instruction.inputs[index])]))
							.concat(this.writeBranchToBlock(enumCase.basicBlock, siblingBlocks))
					);
				}),
			}];
		case "try_apply":
			var errorBasicBlock = findBasicBlock(siblingBlocks, instruction.errorBlock);
			return [{
				type: "TryStatement",
				block: {
					type: "BlockStatement",
					body: this.writeBranchToBlock(instruction.normalBlock, siblingBlocks),
				},
				handler: {
					type: "CatchClause",
					param: identifier("e"),
					body: {
						type: "BlockStatement",
						body: [declaration(mangledLocal(errorBasicBlock.arguments[0].localName), identifier("e"))].concat(this.writeBranchToBlock(instruction.errorBlock, siblingBlocks)),
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

CodeGen.prototype.writeBasicBlock = function (basicBlock, siblingBlocks) {
	return basicBlock.instructions.reduce((nodes, instruction) => {
		var newNodes = this.nodesForInstruction(instruction, basicBlock, siblingBlocks);
		if (newNodes.length > 0) {
			withSource(newNodes[0], instruction.source);
		}
		// newNodes.forEach(node => { console.log(JSON.stringify(node)), escodegen.generate(node) });
		return nodes.concat(newNodes);
	}, []);
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

CodeGen.prototype.consumeFunction = function(fn) {
	var basicBlocks = fn.basicBlocks;
	if (basicBlocks.length == 0) {
		// No basic blocks, some kind of weird declaration we don't support yet
		return;
	}
	// Apply calling convention to the argument list
	var args = basicBlocks[0].arguments;
	var useMethodCallingConvention = fn.convention == "method";
	if (useMethodCallingConvention) {
		var hiddenThisArg = args[args.length - 1];
		args = args.slice(0, args.length - 1);
	}
	// Setup the JavaScript AST
	var body = [];
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
	// Convert the this argument to a variable
	if (useMethodCallingConvention) {
		body.push(declaration(mangledLocal(hiddenThisArg.localName), { type: "ThisExpression" }));
		hiddenThisArg.localName = "this";
	}
	if (basicBlocks.length == 1) {
		body.push.apply(body, this.writeBasicBlock(basicBlocks[0], basicBlocks));
	} else {
		var firstBlockHasBackreferences = basicBlocks[0].hasBackReferences;
		if (firstBlockHasBackreferences) {
			body.push(declaration(identifier("state"), literal(0)));
		} else {
			body.push(declaration(identifier("state")));
			body.push.apply(body, this.writeBasicBlock(basicBlocks[0], basicBlocks));
		}
		if (!firstBlockHasBackreferences && basicBlocks.length == 2) {
			if (basicBlocks[1].hasBackReferences) {
				body.push({
					type: "ForStatement",
					body: {
						type: "BlockStatement",
						body: this.writeBasicBlock(basicBlocks[1], basicBlocks),
					}
				});
			} else {
				body.push.apply(body, this.writeBasicBlock(basicBlocks[1], basicBlocks));
			}
		} else {
			var offset = firstBlockHasBackreferences ? 0 : 1;
			body.push({
				type: "ForStatement",
				body: {
					type: "SwitchStatement",
					discriminant: identifier("state"),
					cases: basicBlocks.slice(offset).map((basicBlock, i) => switchCase(literal(i + offset), this.writeBasicBlock(basicBlock, basicBlocks))),
				}
			});
		}
	}
	var beautifulName = fn.beautifulName;
	if (beautifulName) {
		this.body.push(expressionStatement(assignment(member(identifier("window"), literal(beautifulName)), identifier(fn.name))));
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
		for (var key in declaration.entries) {
			if (declaration.entries.hasOwnProperty(key)) {
				this.body.push(assignPrototype(identifier(declaration.name), literal(key), literal(declaration.entries[key])));
			}
		}
	}
}

CodeGen.prototype.end = function() {
	//console.log(JSON.stringify(this.program, null, 2));
	this.buffer.write(escodegen.generate(this.program, {
		format: {
			json: true,
			quotes: "double",
		},
		comment: true,
	}));
}

module.exports = CodeGen;
