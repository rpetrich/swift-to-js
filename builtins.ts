import { read, unbox, call, functionize, expr, callable, variable, structField, functionValue, tuple, ArgGetter, Value, StructField, ExpressionValue } from "./values";
import { emitScope, mangleName, newScope, rootScope, Scope } from "./scope";
import { FunctionBuilder } from "./functions";
import { parse, Type } from "./types";
import { assignmentExpression, booleanLiteral, binaryExpression, callExpression, stringLiteral, newExpression, logicalExpression, variableDeclaration, variableDeclarator, numericLiteral, returnStatement, functionExpression, blockStatement, unaryExpression, identifier, nullLiteral, arrayExpression, memberExpression, thisExpression, Identifier, NullLiteral, Expression } from "babel-types";

function returnType(type: Type) {
	if (type.kind === "function") {
		return type.return;
	}
	throw new Error(`Expected a function type, got a ${type.kind} type`);
}

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

function wrapped(fn: FunctionBuilder): FunctionBuilder {
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

export const structTypes: { [name: string]: Array<StructField> } = {
	"String": [
		structField("unicodeScalars", "UTF32View", (value, scope) => expr(callExpression(memberExpression(identifier("Array"), identifier("from")), [read(value, scope)]))),
		structField("utf16", "UTF16View", (value) => value),
		structField("utf8", "UTF8View", (value, scope) => expr(callExpression(memberExpression(newExpression(identifier("TextEncoder"), [stringLiteral("utf-8")]), identifier("encode")), [read(value, scope)]))),
	],
	"UTF32View": [
		structField("count", "Int", (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
		structField("startIndex", "Int64", (value: Value, scope: Scope) => expr(numericLiteral(0))),
		structField("endIndex", "Int64", (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length"))))
	],
	"UTF16View": [
		structField("count", "Int", (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
		structField("startIndex", "Int64", (value: Value, scope: Scope) => expr(numericLiteral(0))),
		structField("endIndex", "Int64", (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length"))))
	],
	"UTF8View": [
		structField("count", "Int", (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
		structField("startIndex", "Int64", (value: Value, scope: Scope) => expr(numericLiteral(0))),
		structField("endIndex", "Int64", (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length"))))
	],
	"Collection": [
		structField("count", "Int", (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length"))))
	],
	"Array": [
		structField("count", "Int", (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length"))))
	],
};

export const defaultValues: { [name: string]: Expression } = {
	"Bool": booleanLiteral(false),
	"Int": numericLiteral(0),
	"Int64": numericLiteral(0),
	"Float": numericLiteral(0),
	"Double": numericLiteral(0),
	"String": stringLiteral(""),
	"UTF16View": stringLiteral(""),
	"Optional": nullLiteral(),
	"Array": arrayExpression([]),
};

export const functions: { [name: string]: FunctionBuilder } = {
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
	"Swift.(file).Bool.&&": wrapped((scope, arg, type) => expr(logicalExpression("&&", read(arg(0), scope), read(call(arg(1), [], scope), scope)))),
	"Swift.(file).Bool.||": wrapped((scope, arg, type) => expr(logicalExpression("||", read(arg(0), scope), read(call(arg(1), [], scope), scope)))),
	"Swift.(file).Optional.none": () => expr(nullLiteral()),
	"Swift.(file).Optional.==": binaryBuiltin("==="), // TODO: Fix to use proper comparator for internal type
	"Swift.(file).Optional.!=": binaryBuiltin("!=="), // TODO: Fix to use proper comparator for internal type
	"Swift.(file).Optional.flatMap": returnTodo,
	"Swift.(file)._OptionalNilComparisonType.init(nilLiteral:)": wrapped(() => expr(nullLiteral())),
	"Swift.(file).Collection.count": returnLength,
	"Swift.(file).Collection.map": (scope, arg) => expr(callExpression(memberExpression(memberExpression(arrayExpression([]), identifier("map")), identifier("bind")), [read(arg(0), scope)])),
	"Swift.(file).BidirectionalCollection.joined(separator:)": (scope, arg) => expr(callExpression(memberExpression(read(arg("this"), scope), identifier("join")), [read(arg(0), scope)])),
	"Swift.(file).String.init": wrapped((scope, arg) => expr(callExpression(identifier("String"), [read(arg(0), scope)]))),
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
	"Swift.(file).FloatingPoint.==": binaryBuiltin("==="),
	"Swift.(file).FloatingPoint.!=": binaryBuiltin("!=="),
	"Swift.(file).FloatingPoint.squareRoot()": (scope, arg, type) => callable(() => expr(arrayExpression([callExpression(memberExpression(identifier("Math"), identifier("sqrt")), [read(arg(0), scope)])])), returnType(type)),
};
