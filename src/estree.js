var estree = {
	identifier: name => ({
		type: "Identifier",
		name: name,
	}),
	mangledLocal: local => {
		if (typeof local == "undefined") {
			throw new Error("undefined passed to mangledLocal!");
		}
		return estree.identifier("_" + local);
	},
	literal: value => {
		if (typeof value == "undefined") {
			return estree.unary("void", estree.literal(0));
		}
		if (typeof value == "number" && value < 0) {
			return estree.unary("-", estree.literal(-value));
		}
		return {
			type: "Literal",
			value: value,
		};
	},
	array: elements => ({
		type: "ArrayExpression",
		elements: elements,
	}),
	call: (callee, args) => ({
		type: "CallExpression",
		callee: callee,
		arguments: args,
	}),
	member: (object, property) => ({
		type: "MemberExpression",
		object: object,
		property: property,
		computed: true,
	}),
	internalMember: (object, internalName) => ({
		type: "MemberExpression",
		object: object,
		property: estree.identifier(internalName),
		computed: false,
	}),
	box: (parent, field) => ({
		type: "ObjectExpression",
		properties: [{
			type: "Property",
			key: estree.identifier("ref"),
			kind: "init",
			value: parent,
		}, {
			type: "Property",
			key: estree.identifier("field"),
			kind: "init",
			value: field,
		}]
	}),
	unboxRef: boxed => estree.internalMember(boxed, "ref"),
	unboxField: boxed => estree.internalMember(boxed, "field"),
	unbox: boxed => estree.member(estree.unboxRef(boxed), estree.unboxField(boxed)),
	unboxIfAddr: (operation, node) => /_addr$/.test(operation) ? estree.unbox(node) : node,
	unary: (operator, value) => ({
		type: "UnaryExpression",
		prefix: true,
		operator: operator,
		argument: value,
	}),
	binary: (operator, left, right) => ({
		type: "BinaryExpression",
		operator: operator,
		left: left,
		right: right,
	}),
	ternary: (test, consequent, alternate) => ({
		type: "ConditionalExpression",
		test: test,
		alternate: alternate,
		consequent: consequent,
	}),
	sequence: expressions => ({
		type: "SequenceExpression",
		expressions: expressions,
	}),
	assignment: (left, right) => ({
		type: "AssignmentExpression",
		operator: "=",
		left: left,
		right: right,
	}),
	assignments: pairs => pairs.map(pair => estree.expressionStatement(estree.assignment(pair[0], pair[1]))),
	newExpression: (type, arguments) => ({
		type: "NewExpression",
		callee: type,
		arguments: arguments || [],
	}),
	expressionStatement: expression => ({
		type: "ExpressionStatement",
		expression: expression,
	}),
	declarator: (id, init) => ({
		type: "VariableDeclarator",
		id: id,
		init: init,
	}),
	declaration: (id, init) => ({
		type: "VariableDeclaration",
		kind: "var",
		declarations: [estree.declarator(id, init)],
	}),
	declarations: declarations => declarations.length == 0 ? [] : [{
		type: "VariableDeclaration",
		kind: "var",
		declarations: declarations.map(declaration => estree.declarator(declaration[0], declaration[1])),
	}],
	switchCase: (test, consequents) => ({
		type: "SwitchCase",
		test: test,
		consequent: consequents,
	}),
	functionDeclaration: (identifier, params, body) => ({
		type: "FunctionDeclaration",
		id: identifier,
		params: params,
		body: {
			type: "BlockStatement",
			body: body,
		},
		loc: null,
	}),
	returnStatement: expression => ({
		type: "ReturnStatement",
		argument: expression || null,
	}),
};
module.exports = estree;
