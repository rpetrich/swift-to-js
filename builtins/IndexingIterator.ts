import { wrapped } from "../functions";
import { withPossibleRepresentations, PossibleRepresentation, ReifiedType, TypeParameterHost } from "../reified";
import { Scope } from "../scope";
import { lookupForMap } from "../utils";
import { binary, call, conditional, conformance, expr, functionValue, literal, member, read, reuse, transform, tuple } from "../values";
import { applyDefaultConformances } from "./common";
import { emptyOptional, wrapInOptional } from "./Optional";

import { identifier, objectExpression, objectProperty, updateExpression } from "@babel/types";

export function IndexingIterator(globalScope: Scope, typeParameters: TypeParameterHost): ReifiedType {
	const [ elementsType ] = typeParameters("Elements");
	return {
		functions: lookupForMap({
			"init(_elements:)": wrapped((scope, arg) => {
				const collectionConformance = conformance(elementsType, "Collection", scope);
				const startIndexFunction = call(functionValue("startIndex", collectionConformance, "(Type) -> (Self) -> Self.Index"), [elementsType], ["Type"], scope);
				return transform(arg(0, "elements"), scope, (elementsValue) => {
					return expr(objectExpression([
						objectProperty(identifier("elements"), elementsValue),
						objectProperty(identifier("position"), read(call(startIndexFunction, [expr(elementsValue)], [elementsType], scope), scope)),
					]));
				});
			}, "(Self.Elements) -> Self"),
			"init(_elements:_position:)": wrapped((scope, arg) => {
				return transform(arg(0, "elements"), scope, (elementsValue) => {
					return transform(arg(1, "position"), scope, (positionValue) => {
						return expr(objectExpression([
							objectProperty(identifier("elements"), elementsValue),
							objectProperty(identifier("position"), positionValue),
						]));
					});
				});
			}, "(Self.Elements, Self.Elements.Index) -> Self"),
		}),
		conformances: withPossibleRepresentations(applyDefaultConformances({
			IteratorProtocol: {
				functions: {
					"next()": wrapped((scope, arg) => {
						return reuse(arg(0, "iterator"), scope, "iterator", (iterator) => {
							const collectionConformance = conformance(elementsType, "Collection", scope);
							const elementTypeFunction = call(functionValue("Element", collectionConformance, "(Type) -> () -> Type"), [elementsType], ["Type"], scope);
							const elementType = call(elementTypeFunction, [], [], scope);
							const endIndexFunction = call(functionValue("endIndex", collectionConformance, "(Type) -> (Self) -> Self.Index"), [elementsType], ["Type"], scope);
							return conditional(
								binary("===",
									member(iterator, "position", scope),
									call(endIndexFunction, [member(iterator, "elements", scope)], [elementsType], scope),
									scope,
								),
								emptyOptional(elementType, scope),
								wrapInOptional(member(member(iterator, "elements", scope), expr(updateExpression("++", read(member(iterator, "position", scope), scope))), scope), elementType, scope),
								scope,
							);
						});
					}, "(inout Self) -> Self.Element?"),
				},
				requirements: [],
			},
		}, globalScope), PossibleRepresentation.Object),
		defaultValue() {
			return tuple([]);
		},
		copy(value, scope) {
			return call(member(expr(identifier("Object")), "assign", scope), [literal({}), value], ["Self", "Self"], scope);
		},
		innerTypes: {},
	};
}
