Program = _ term:Term _ { return term; }

Term
  = "(" _ name:BareString _ tokens:WhitespaceAndAttributeOrArgument* _ children:WhitespaceAndTerm* _ ")" {
    const props = {}, args = [];
    for (var i = 0; i < tokens.length; i++) {
      if (typeof tokens[i] == "string") {
          args.push(tokens[i]);
        } else {
      props[tokens[i].key] = tokens[i].value;
        }
    }
    return { name: name, args:args, properties: props, children: children, location: location() };
  }
WhitespaceAndTerm
  = _ term:Term { return term; }

AttributeOrArgument
  = Attribute / Argument
WhitespaceAndAttributeOrArgument
  = _ value:AttributeOrArgument { return value; }

Argument
  = argument:(DoubleQuotedString / SingleQuotedString) { return argument; }

Attribute
  = key:Identifier value:AttributeValue? { return { key: key, value: value === null ? true : value } }
AttributeValue
  = ('=' / ': ' / ' #') value: (Range / List / String / ParenthesizedBareString / EmptyString) { return value; }

EmptyString "empty string"
  = "" { return ""; }

String "string"
  = BareString / DoubleQuotedString / SingleQuotedString

EscapeSequence "escape sequence"
  = "\\" sequence:['"tn] { return sequence == "t" ? "\t" : sequence == "n" ? "\n" : sequence; }

DoubleQuotedString "doublequote string"
  = '"' content:(EscapeSequence / [^"])* '"' { return content.join(""); }
WhitespaceAndDoubleQuotedString
  = _ str:DoubleQuotedString { return str; }

SingleQuotedString "singlequote string"
  = "'" content:(EscapeSequence / [^'])* "'" { return content.join(""); }

List "list"
  = CommaSeparatedBareString / BracketedList

CommaSeparatedBareString
  = head:(SingleQuotedString / BareString) tail:CommaPrefixedBareString+ { return [head].concat(tail); }
CommaPrefixedBareString
  = ',' str:(SingleQuotedString / BareString) { return str; }

BracketedList
  = '[' _ head:BareString tail:BracketedListTail* _ ']' { return [head].concat(tail); }
BracketedListTail
  = ',' _ string:BareString { return string; }

Identifier "identifier"
  = prefix:[a-zA-Z_@.] remaining:[a-zA-Z_\-@.]* { return prefix + remaining.join(""); }

BareString "bare string"
  = prefix:BareStringToken remaining:BareStringTail* { return prefix + remaining.join(""); }
BareStringToken
  = [a-zA-Z0-9_.:@*<>~$%&+\-!?/]
BareStringTail
  = BareStringToken / '=' / BareStringParenPair / BareStringSquarePair
BareStringTailWhitespace
  = BareStringTail / " "
BareStringParenPair "parenthesized string component"
  = '(' body:BareStringTailWhitespace* ')' { return "(" + body.join("") + ")"; }
BareStringSquarePair "subscripted bare string"
  = ws: _ '[' body:BareStringTailWhitespace* ']' { return ws + "[" + body.join("") + "]"; }

ParenthesizedBareString "parenthesized bare string"
  = all:('(' BareString ')') { return all.join(""); }

Range "range"
  = '[' _ from:String ' ' _ '- ' _ to:String ']' { return { from: from, to: to }; }

_ "whitespace"
  = [ \t\n\r]*
