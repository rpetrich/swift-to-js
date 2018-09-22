Top
  = _ Name '.(file).' body:(FunctionAndLocalReference / TypeAndMemberReference / FunctionReference / Name) specialization:Specialization? PathReference? afterSpecialization:Specialization? _ { return { ...body, ...specialization || afterSpecialization || undefined }; }

FunctionAndLocalReference
  = member:(TypeAndMemberReference / FunctionReference) '.' ('explicit closure discriminator=' [0-9]+ '.')? local:Name { return { type: member.type, member: member.member, local: local }; }

TypeAndMemberReference
  = type:Name (__ 'extension.' / '.') member:(FunctionReference / Name) { return { type: type, member: member.member, local: member.local }; }

FunctionReference
  = name:PermissiveName ('(' NamedArgument* ')')? { return { type: undefined, member: text(), local: undefined }; }

NamedArgument
  = Name? ':'

PathReference
  = '@' [^:]* [:0-9]*

Specialization
  = __ '[with' __ '(substitution_map' __ signature:GenericSignature substitutions:Substitution* ')' _ ']' { return { substitutions: substitutions, signature: signature }; }

GenericSignature
  = 'generic_signature=<' head:ConformanceClause tail:ConformanceClauseTail* '>' { return [head].concat(tail); }

ConformanceClauseTail
  = ',' _ conformance:ConformanceClause { return conformance; }
ConformanceClause
  = ConformanceClauseReal / ConformanceClauseFake

ConformanceClauseReal
  = name:Name predicate:ConformancePredicate? !'.' { return { name, protocol: predicate || undefined }; } 

ConformanceClauseFake
  = [^>,]* { return undefined; }

ConformancePredicate
  = (__ 'where' __ Name)? suffix:ConformanceSuffix? ConformanceClauseFake { return suffix || undefined; }
ConformanceSuffix
  = _ ':' _ value:Name { return value; }

Substitution
  = _ '(substitution' __ from:Name _ '->' _ to:SubstitutionValue _ ')' { return { from: from, to: to }; }

SubstitutionValue
  = [^()@]* SubstitutionValueParameterize* [^()@]* { return text(); }

SubstitutionValueParameterize
  = '(' SubstitutionValue ')'

Name
  = ([^ .()@:>,]+ / '...') { return text(); }
PermissiveName
  = ([^ .()@:]+ / '...') { return text(); }

_ "whitespace"
  = [ \t\n\r]* { }

__ "whitespace"
  = [ \t\n\r]* { }
