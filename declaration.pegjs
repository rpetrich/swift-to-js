Top
  = _ Name '.(file).' body:(FunctionAndLocalReference / TypeAndMemberReference / FunctionReference / Name) Specialization? PathReference? _ { return body; }

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
  = ' [with ' [^\@]*

Name
  = ([^ .()@:]+ / '...') { return text(); }

_ "whitespace"
  = [ \t\n\r]*
