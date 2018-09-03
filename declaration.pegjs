Top
  = _ Name '.(file).' body:(FunctionAndLocalReference / TypeAndMemberReference / FunctionReference / Name) specialization:Specialization? PathReference? _ { return { ...body, substitutions: specialization || undefined }; }

FunctionAndLocalReference
  = member:(TypeAndMemberReference / FunctionReference) '.' local:Name { return { type: member.type, member: member.member, local: local }; }

TypeAndMemberReference
  = type:Name (' extension.' / '.') member:(FunctionReference / Name) { return { type: type, member: member.member, local: member.local }; }

FunctionReference
  = name:Name ('(' NamedArgument* ')')? { return { type: undefined, member: text(), local: undefined }; }

NamedArgument
  = Name? ':'

PathReference
  = '@' .*

Specialization
  = ' [with (substitution_map generic_signature=<' [^\@>]* '>' substitutions:Substitution* ')]' { return substitutions; }

Substitution
  = _ '(substitution ' _ from:Name _ '->' _ to:SubstitutionValue _ ')' { return to; }

SubstitutionValue
  = [^()@]* SubstitutionValueParameterize* [^()@]* { return text(); }

SubstitutionValueParameterize
  = '(' SubstitutionValue ')'

Name
  = ([^ .()@:]+ / '...') { return text(); }

_ "whitespace"
  = [ \t\n\r]*
