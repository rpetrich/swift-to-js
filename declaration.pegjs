Top
  = _ Name '.(file).' body:(FunctionAndLocalReference / TypeAndMemberReference / FunctionReference / Name) specialization:Specialization? PathReference? afterSpecialization:Specialization? _ { return { ...body, ...specialization || afterSpecialization || undefined }; }

FunctionAndLocalReference
  = member:(TypeAndMemberReference / FunctionReference) '.' local:Name { return { type: member.type, member: member.member, local: local }; }

TypeAndMemberReference
  = type:Name (' extension.' / '.') member:(FunctionReference / Name) { return { type: type, member: member.member, local: member.local }; }

FunctionReference
  = name:PermissiveName ('(' NamedArgument* ')')? { return { type: undefined, member: text(), local: undefined }; }

NamedArgument
  = Name? ':'

PathReference
  = '@' [^:]* [:0-9]*

Specialization
  = ' [with (substitution_map ' signature:GenericSignature substitutions:Substitution* ')]' { return { substitutions: substitutions, signature: signature }; }

GenericSignature
  = 'generic_signature=<' head:ConformanceClause tail:ConformanceClauseTail* '>' { return [head].concat(tail); }

ConformanceClauseTail
  = ',' _ conformance:ConformanceClause { return conformance; }
ConformanceClause
  = name:Name predicate:ConformancePredicate? { return { name, protocol: predicate || undefined }; } 

ConformancePredicate
  = ' ' (_ 'where ' _ Name)? _ ':' _ value:Name { return value; }

Substitution
  = _ '(substitution ' _ from:Name _ '->' _ to:SubstitutionValue _ ')' { return { from: from, to: to }; }

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
