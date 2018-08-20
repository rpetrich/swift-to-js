Top
  = _ type:Type _ { return type; }

Type
  = Function / NamespacedType / MetaType / Optional / Generic / Dictionary / Array / Tuple / Modified / Name

Types
  = head:Type tail:CommaType * { return [head].concat(tail) }
CommaType
  = ',' _ value:Type { return value; }

Optional
  = type:(Function / NamespacedType / Generic / Dictionary / Array / Tuple / Modified / Name) depth:[?!]+ { return depth.reduce(function (type) { return { kind: "optional", type: type, location: location() } }, type); }

Generic
  = base:Name '<' typeArgs:Types '>' {
  if (base.kind === "name") {
    if (base.name === "Array" && typeArgs.length === 1) {
      return { kind: "array", type: typeArgs[0], location: location() };
    }
    if (base.name === "Dictionary" && typeArgs.length === 2) {
      return { kind: "dictionary", keyType: typeArgs[0], valueType: typeArgs[1], location: location() };
    }
  }
  return { kind: "generic", base: base, arguments: typeArgs, location: location() };
}

Function
  = attributes:FunctionAttribute* argTypes:Tuple _ throws:('throws' / "rethrows")? _ '->' _ returnType:Type { return { kind: "function", arguments: argTypes, return: returnType, throws: throws === "throws", rethrows: throws === "rethrows", attributes: attributes, location: location() }; }
FunctionAttribute
  = content:('@autoclosure' / ('@convention(' ('swift' / 'block' / 'c') ')') / '@escaping') _ { return content; }

Tuple
  = '(' types:(TupleContents / _) ')' { return { kind: "tuple", types: types, location: location() }; }
TupleContents
  = _ (Name ':' _)? head:(Variadic / Type) tail:TupleTerm* _ { return typeof tail !== "undefined" ? [head].concat(tail) : [head]; }
TupleTerm
  = _ ',' _ (Name ':' _)? type:(Variadic / Type) { return type; }

Variadic
  = type:Type '...' { return { kind: "array", type: type, location: location() } }

Array
  = '[' _ type:Type _ ']' { return { kind: "array", type: type, location: location() }; }

Dictionary
  = '[' _ keyType:Type _ ':' _ valueType:Type _ ']' { return { kind: "dictionary", keyType: keyType, valueType: valueType, location: location() }; }

MetaType
  = base:(Generic / Optional / Name) '.' as:("Type" / "Protocol") { return { kind: "metatype", base: base, as: as, location: location() }; }

NamespacedType
  = namespace:Name '.' type:Type { return { kind: "namespaced", namespace: namespace, type: type, location: location() }; }

Modified
  = modifier:("inout" / "@lvalue") " " _ type:Type { return { kind: "modified", modifier: modifier, type: type, location: location() }; }

Name
  = head:[a-zA-Z_] tail:[a-zA-Z0-9_\-]* { return { kind: "name", name: head + tail.join(""), location: location() }; }

_ "whitespace"
  = [ \t\n\r]* { return []; }
