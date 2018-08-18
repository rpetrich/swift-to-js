import { ArgGetter, Value } from "./values";
import { Type } from "./types";
import { Scope } from "./scope";

export type FunctionBuilder = (scope: Scope, arg: ArgGetter, type: Type, name: string) => Value;
