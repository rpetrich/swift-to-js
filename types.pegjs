Top
  = _ type:Type _ { return type; }

Type "type"
  = Constrained / GenericFunction / Function / NamespacedType / MetaType / Optional / Generic / Dictionary / Array / Tuple / Modified / Name

Types "type list"
  = head:Type tail:CommaType* { return [head].concat(tail) }
CommaType
  = ',' _ value:Type { return value; }

Optional "optional"
  = type:(Constrained / GenericFunction / Function / NamespacedType / Generic / Dictionary / Array / Tuple / Modified / Name) depth:[?!]+ { return depth.reduce(function (type) { return { kind: "optional", type: type, location: location() } }, type); }

Generic "generic"
  = base:Name '<' typeArgs:TypesWithConstraints '>' {
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

TypesWithConstraints
  = head:(TypeWithConstraint / Type) tail:CommaTypeWithConstraint* { return [head].concat(tail) }
CommaTypeWithConstraint
  = ',' _ value:(TypeWithConstraint / Type) { return value; }

TypeWithConstraint
  = type:Type ' ' _ ':' _ constraint:Type {
  return { kind: "constrained", type: type, constraint: constraint, location: location() };
}

GenericFunction "generic function"
  = '<' typeArgs:Types '> ' fn:Function {
  return { kind: "generic", base: fn, arguments: typeArgs, location: location() }
}

Constrained "constrainted name"
  = type:Name ' ' _ 'where ' _ Name _ ':' _ constraint:Type {
  return { kind: "constrained", type: type, constraint: constraint, location: location() };
}

Function "function"
  = attributes:FunctionAttribute* argTypes:Tuple _ throws:('throws' / "rethrows")? _ '->' _ returnType:Type { return { kind: "function", arguments: argTypes, return: returnType, throws: throws === "throws", rethrows: throws === "rethrows", attributes: attributes, location: location() }; }
FunctionAttribute "attribute"
  = content:('@autoclosure' / ('@convention(' ('swift' / 'block' / 'c') ')') / '@escaping') _ { return content; }

Tuple "tuple"
  = '(' types:(TupleContents / _) ')' { return { kind: "tuple", types: types, location: location() }; }
TupleContents
  = _ (Name ':' _)? head:(Variadic / Type) tail:TupleTerm* _ { return typeof tail !== "undefined" ? [head].concat(tail) : [head]; }
TupleTerm
  = _ ',' _ (Name ':' _)? type:(Variadic / Type) { return type; }

Variadic "variadic"
  = type:Type '...' { return { kind: "array", type: type, location: location() } }

Array "array"
  = '[' _ type:Type _ ']' { return { kind: "array", type: type, location: location() }; }

Dictionary "dictionary"
  = '[' _ keyType:Type _ ':' _ valueType:Type _ ']' { return { kind: "dictionary", keyType: keyType, valueType: valueType, location: location() }; }

MetaType "metatype"
  = base:(Generic / Optional / Name) '.' as:("Type" / "Protocol") { return { kind: "metatype", base: base, as: as, location: location() }; }

NamespacedType "namespaced type"
  = namespace:(Generic / Name) '.' !('Type' / 'Protocol') type:Type { return { kind: "namespaced", namespace: namespace, type: type, location: location() }; }

Modified "modifier"
  = modifier:("inout" / "@lvalue") " " _ type:Type { return { kind: "modified", modifier: modifier, type: type, location: location() }; }

Name "name"
  = head:[a-zA-Z_] tail:[a-zA-Z0-9_\-]* { return { kind: "name", name: head + tail.join(""), location: location() }; }

_ "whitespace"
  = [ \t\n\r]* { return []; }
