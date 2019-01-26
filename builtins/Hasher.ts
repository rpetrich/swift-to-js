import { wrapped } from "../functions";
import { primitive, PossibleRepresentation } from "../reified";
import { array, binary, literal, member, set } from "../values";
import { cachedBuilder, reuseArgs } from "./common";

export const Hasher = cachedBuilder((globalScope) => primitive(PossibleRepresentation.Array, array([literal(0)], globalScope), {
	"combine()": wrapped((scope, arg) => {
		return reuseArgs(arg, 0, scope, ["hasher"], (hasher) => {
			return set(
				member(hasher, 0, scope),
				binary("-",
					binary("+",
						binary("<<",
							member(hasher, 0, scope),
							literal(5),
							scope,
						),
						arg(1, "value"), // TODO: Call hashValue
						scope,
					),
					member(hasher, 0, scope),
					scope,
				),
				scope,
			);
		});
	}, "(inout Hasher, Int) -> Void"),
	"finalize()": wrapped((scope, arg) => {
		return binary("|", member(arg(0, "hasher"), 0, scope), literal(0), scope);
	}, "(Hasher) -> Int"),
}));
