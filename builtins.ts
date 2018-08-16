import { read, unbox, functionize, expr, callable, variable, builtin, tuple, ArgGetter, Value, ExpressionValue } from "./values";
import { addVariable, emitScope, mangleName, newScope, rootScope, Scope } from "./scope";
import { parse, Type } from "./types";
import { assignmentExpression, binaryExpression, callExpression, variableDeclaration, variableDeclarator, numericLiteral, returnStatement, functionExpression, blockStatement, unaryExpression, identifier, nullLiteral, arrayExpression, memberExpression, thisExpression, Identifier, NullLiteral } from "babel-types";

function returnType(type: Type) {
	if (type.kind === "function") {
		return type.return;
	}
	throw new Error(`Expected a function type, got a ${type.kind} type`);
}

export type BuiltinFunction = (scope: Scope, arg: ArgGetter, type: Type, name: string) => Value;

function returnOnlyArgument(scope: Scope, arg: ArgGetter): Value {
	return arg(0);
}

function returnThis(scope: Scope, arg: ArgGetter): Value {
	return arg("this");
}

function returnTodo(scope: Scope, arg: ArgGetter, type: Type, name: string): Value {
	console.log(name);
	return expr(callExpression(mangleName("todo_missing_builtin$" + name), []));
}

function returnLength(scope: Scope, arg: ArgGetter): Value {
	const arg0 = arg(0);
	return arg0.kind === "direct" ? variable(read(arg0, scope)) : expr(read(arg0, scope));
}

function wrapped(fn: BuiltinFunction): BuiltinFunction {
	return (scope: Scope, arg: ArgGetter, type: Type, name: string): Value => {
		const innerType = returnType(type);
		return callable((innerScope, innerArg) => fn(innerScope, innerArg, innerType, name), innerType);
	}
}

function binaryBuiltin(operator: "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "&" | "|" | "^" | "==" | "===" | "!=" | "!==") {
	return wrapped((scope: Scope, arg: ArgGetter) => expr(binaryExpression(operator, read(arg(0), scope), read(arg(1), scope))));
}

function assignmentBuiltin(operator: "=" | "+=" | "-=" | "*=" | "/=" | "|=" | "&=") {
	return wrapped((scope: Scope, arg: ArgGetter) => expr(assignmentExpression(operator, read(unbox(arg(0), scope), scope), read(arg(1), scope))));
}

export const builtinFunctions: { [name: string]: BuiltinFunction } = {
	"Swift.(file).Int.init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument),
	"Swift.(file).Int.+": binaryBuiltin("+"),
	"Swift.(file).Int.-": binaryBuiltin("-"),
	"Swift.(file).Int.*": binaryBuiltin("*"),
	"Swift.(file).Int./": (scope, arg) => expr(binaryExpression("|", binaryExpression("/", read(arg(0), scope), read(arg(1), scope)), numericLiteral(0))),
	"Swift.(file).Int.%": binaryBuiltin("%"),
	"Swift.(file).Int.<": binaryBuiltin("<"),
	"Swift.(file).Int.>": binaryBuiltin(">"),
	"Swift.(file).Int.<=": binaryBuiltin("<="),
	"Swift.(file).Int.>=": binaryBuiltin(">="),
	"Swift.(file).Int.&": binaryBuiltin("&"),
	"Swift.(file).Int.|": binaryBuiltin("|"),
	"Swift.(file).Int.^": binaryBuiltin("^"),
	"Swift.(file).Int.==": binaryBuiltin("==="),
	"Swift.(file).Int.!=": binaryBuiltin("!=="),
	"Swift.(file).Int.+=": assignmentBuiltin("+="), // TODO: Fix to mutate
	"Swift.(file).Int.-=": assignmentBuiltin("-="), // TODO: Fix to mutate
	"Swift.(file).Int.*=": assignmentBuiltin("*="), // TODO: Fix to mutate
	"Swift.(file).SignedNumeric.-": wrapped((scope, arg) => expr(unaryExpression("-", read(arg(0), scope)))),
	"Swift.(file).Sequence.reduce": (scope, arg, type) => callable((innerScope, innerArg) => {
		return expr(callExpression(identifier("Sequence$reduce"), [read(arg(0), scope)]));
	}, returnType(type)),
	"Swift.(file).Strideable....": wrapped((scope, arg) => expr(arrayExpression([read(arg(0), scope), read(arg(1), scope)]))),
	"Swift.(file).Bool.init(_builtinBooleanLiteral:)": wrapped(returnOnlyArgument),
	"Swift.(file).Bool._getBuiltinLogicValue()": (scope, arg, type) => callable(() => arg(0), returnType(type)),
	"Swift.(file).Optional.none": () => expr(nullLiteral()),
	"Swift.(file).Optional.==": binaryBuiltin("==="), // TODO: Fix to use proper comparator for internal type
	"Swift.(file).Optional.!=": binaryBuiltin("!=="), // TODO: Fix to use proper comparator for internal type
	"Swift.(file).Optional.flatMap": returnTodo,
	"Swift.(file)._OptionalNilComparisonType.init(nilLiteral:)": () => expr(nullLiteral()),
	"Swift.(file).Collection.count": returnLength,
	"Swift.(file).Collection.map": (scope, arg) => expr(callExpression(memberExpression(memberExpression(arrayExpression([]), identifier("map")), identifier("bind")), [read(arg(0), scope)])),
	"Swift.(file).BidirectionalCollection.joined(separator:)": (scope, arg) => expr(callExpression(memberExpression(read(arg("this"), scope), identifier("join")), [read(arg(0), scope)])),
	"Swift.(file).String.init": wrapped((scope, arg) => expr(callExpression(identifier("String"), [read(arg(0), scope)]))),
	"Swift.(file).String.utf16": wrapped(returnOnlyArgument),
	"Swift.(file).String.+": binaryBuiltin("+"),
	"Swift.(file).String.lowercased()": (scope, arg, type) => callable(() => expr(callExpression(memberExpression(read(arg(0), scope), identifier("toLowerCase")), [])), returnType(type)),
	"Swift.(file).String.uppercased()": (scope, arg, type) => callable(() => expr(callExpression(memberExpression(read(arg(0), scope), identifier("toUpperCase")), [])), returnType(type)),
	"Swift.(file).??": returnTodo,
	"Swift.(file).~=": (scope, arg) => expr(binaryExpression("===", read(arg(0), scope), read(arg(1), scope))),
	"Swift.(file).Array.init": wrapped((scope, arg) => expr(callExpression(memberExpression(identifier("Array"), identifier("from")), [read(arg(0), scope)]))),
	"Swift.(file).Array.count": returnLength,
	"Swift.(file).Array.subscript": returnTodo,
	"Swift.(file).Double.init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument),
	"Swift.(file).Double.+": binaryBuiltin("+"),
	"Swift.(file).Double.-": binaryBuiltin("-"),
	"Swift.(file).Double.*": binaryBuiltin("*"),
	"Swift.(file).Double./": binaryBuiltin("/"),
	"Swift.(file).Double.%": binaryBuiltin("%"),
	"Swift.(file).Double.<": binaryBuiltin("<"),
	"Swift.(file).Double.>": binaryBuiltin(">"),
	"Swift.(file).Double.<=": binaryBuiltin("<="),
	"Swift.(file).Double.>=": binaryBuiltin(">="),
	"Swift.(file).Double.&": binaryBuiltin("&"),
	"Swift.(file).Double.|": binaryBuiltin("|"),
	"Swift.(file).Double.^": binaryBuiltin("^"),
	"Swift.(file).Double.==": binaryBuiltin("==="),
	"Swift.(file).Double.!=": binaryBuiltin("!=="),
	"Swift.(file).Double.+=": assignmentBuiltin("+="),
	"Swift.(file).Double.-=": assignmentBuiltin("-="),
	"Swift.(file).Double.*=": assignmentBuiltin("*="),
	"Swift.(file).Double./=": assignmentBuiltin("/="),
	"Swift.(file).Float.init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument),
	"Swift.(file).Float.+": binaryBuiltin("+"),
	"Swift.(file).Float.-": binaryBuiltin("-"),
	"Swift.(file).Float.*": binaryBuiltin("*"),
	"Swift.(file).Float./": binaryBuiltin("/"),
	"Swift.(file).Float.%": binaryBuiltin("%"),
	"Swift.(file).Float.<": binaryBuiltin("<"),
	"Swift.(file).Float.>": binaryBuiltin(">"),
	"Swift.(file).Float.<=": binaryBuiltin("<="),
	"Swift.(file).Float.>=": binaryBuiltin(">="),
	"Swift.(file).Float.&": binaryBuiltin("&"),
	"Swift.(file).Float.|": binaryBuiltin("|"),
	"Swift.(file).Float.^": binaryBuiltin("^"),
	"Swift.(file).Float.==": binaryBuiltin("==="),
	"Swift.(file).Float.!=": binaryBuiltin("!=="),
	"Swift.(file).Float.+=": assignmentBuiltin("+="),
	"Swift.(file).Float.-=": assignmentBuiltin("-="),
	"Swift.(file).Float.*=": assignmentBuiltin("*="),
	"Swift.(file).Float./=": assignmentBuiltin("/="),
	"Swift.(file).FloatingPoint.squareRoot()": (scope, arg, type) => callable(() => expr(arrayExpression([callExpression(memberExpression(identifier("Math"), identifier("sqrt")), [read(arg(0), scope)])])), returnType(type)),
};

export function insertBuiltin(name: string, scope: Scope, type: Type): Identifier | NullLiteral {
	if (name === "Swift.(file).Optional.none") {
		return nullLiteral();
	}
	const mangled = mangleName(name);
	const globalScope = rootScope(scope);
	addVariable(globalScope, mangled, functionize(globalScope, type, (inner, arg) => builtinFunctions[name](inner, arg, type, name)));
	return mangled;
}
