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

Attribute "attribute"
  = key:Identifier value:AttributeValue? { return { key: key, value: value === null ? true : value } }
AttributeValue
  = ('=' / ': ' / ' #') value: (Range / CommaSeparated / String / BracketedBareString / "") { return value; }

String
  = BareString / DoubleQuotedString / SingleQuotedString

EscapeSequence
  = "\\" sequence:['"tn] { return sequence == "t" ? "\t" : sequence == "n" ? "\n" : sequence; }

DoubleQuotedString
  = '"' content:(EscapeSequence / [^"])* '"' { return content.join(""); }
WhitespaceAndDoubleQuotedString
  = _ str:DoubleQuotedString { return str; }

SingleQuotedString
  = "'" content:(EscapeSequence / [^'])* "'" { return content.join(""); }

CommaSeparated
  = head:SingleQuotedString tail:CommaPrefixed+ { return [head].concat(tail); }
CommaPrefixed
  = ',' str:SingleQuotedString { return str; }

Identifier
  = prefix:[a-zA-Z_@.] remaining:[a-zA-Z_\-@.]* { return prefix + remaining.join(""); }

BareString
  = prefix:BareStringToken remaining:BareStringTail* { return prefix + remaining.join(""); }
BareStringToken
  = [a-zA-Z0-9_.:@*<>~$%&,+\-!?]
BareStringTail
  = BareStringToken / '=' / BareStringParenPair / BareStringSquarePair
BareStringTailWhitespace
  = BareStringTail / " "
BareStringParenPair
  = '(' body:BareStringTailWhitespace* ')' { return "(" + body.join("") + ")"; }
BareStringSquarePair
  = ws: _ '[' body:BareStringTailWhitespace* ']' { return ws + "[" + body.join("") + "]"; }

BracketedBareString
  = all:('(' BareString ')') { return all.join(""); }

Range
  = '[' _ from:String _ '-' _ to:String ']' { return { from: from, to: to }; }

_ "whitespace"
  = [ \t\n\r]*
