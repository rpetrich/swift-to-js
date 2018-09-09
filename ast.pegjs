Program = _ term:Term _ { return term; }

Term
  = "(" _ name:BareString _ headTokens:WhitespaceAndAttributeOrArgument* _ children:WhitespaceAndTerm* _ tailTokens:WhitespaceAndAttributeOrArgument* _ ")" {
    const props = {}, args = [];
    function addToken(token) {
      if (typeof token == "string") {
        args.push(token);
      } else {
        if (token.value !== true || !Object.hasOwnProperty.call(props, token.key)) {
          props[token.key] = token.value;
        }
      }
    }
    headTokens.forEach(addToken);
    tailTokens.forEach(addToken);
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
  = BracketedList / CommaSeparatedBareString / EmptyBracketedList

CommaSeparatedBareString
  = head:(SingleQuotedString / BareString) tail:CommaPrefixedBareString+ { return [head].concat(tail); }
CommaPrefixedBareString
  = ',' str:(SingleQuotedString / BareString) { return str; }

BracketedList
  = '[' _ head:BareStringNoWhitespace tail:BracketedListTail* _ ']' { return [head].concat(tail); }
BracketedListTail
  = ',' _ string:BareStringNoWhitespace { return string; }

EmptyBracketedList
  = '[]' { return []; }

Identifier "identifier"
  = prefix:[a-zA-Z_@.] remaining:[a-zA-Z_\-@.]* { return prefix + remaining.join(""); }

BareString "bare string"
  = prefix:BareStringToken remaining:BareStringTail* { return prefix + remaining.join(""); }
BareStringToken
  = ': ' / ', ' / [a-zA-Z0-9_.:@*<>~$%&+\-!?/]
BareStringTail
  = BareStringToken / '=' / BareStringParenPair / BareStringSquarePair / BareStringExtension
BareStringTailWhitespace
  = BareStringTail / " "
BareStringParenPair "parenthesized string component"
  = '(' body:BareStringTailWhitespace* ')' { return "(" + body.join("") + ")"; }
BareStringSquarePair "subscripted bare string"
  = ws: _ '[' body:BareStringTailWhitespace* ']' { return ws + "[" + body.join("") + "]"; }
BareStringExtension
  = ' extension.' // Special case for extension methods. At some point we will need declaration parsing in here

BareStringNoWhitespace "bare string no whitespace"
  = prefix:BareStringNoWhitespaceToken remaining:BareStringNoWhitespaceTail* { return prefix + remaining.join(""); }
BareStringNoWhitespaceToken
  = [a-zA-Z0-9_.:@*<>~$%&+\-!?/]
BareStringNoWhitespaceTail
  = BareStringNoWhitespaceToken

ParenthesizedBareString "parenthesized bare string"
  = all:('(' BareString ')') { return all.join(""); }

Range "range"
  = '[' _ from:String ' ' _ '- ' _ to:String ']' { return { from: from, to: to }; }

_ "whitespace"
  = [ \t\n\r]*
