function splitNoParens(s) {
	var parens = /\(|\)|\<|\-?\>/g;
	var result = s.split(",");
	for (var i = 0; i < result.length; i++) {
		do {
			var opens = 0;
			var find = null;
			while ((find = parens.exec(result[i])) !== null) {
				switch (find[0]) {
					case "(":
					case "<":
						opens++;
						break;
					case ")":
					case ">":
						opens--;
						break;
				}
			}
			if (i + 1 >= result.length) {
				break;
			}
			if (opens > 0) {
				result[i] += result.splice(i + 1, 1);
			}
		} while(opens);
		result[i] = result[i].trim();
    }
    return result;
}

function basicNameForStruct(structName) {
	return structName.match(/^\w+/)[0];
}

function Parser() {
	this.declarations = {};
	this.currentDeclaration = undefined;
	this.currentBasicBlock = undefined;
	// Lookback, to steal some unmangled name information that swiftc sticks in a comment
	this.lookbackLine = undefined;
}

Parser.prototype.parseSil = function(line) {
	var name = line.split(/:/)[0].split(/\s+/).filter(part => /^@/.test(part))[0].substring(1);
	var declaration = {
		name: name,
		basicBlocks: [],
	};
	if (!/\b(hidden|shared_external)\b/.test(line)) {
		var beautifulMatch = this.lookbackLine.match(/^\/\/ \w+\.(\w+)/);
		if (beautifulMatch) {
			declaration.beautifulName = beautifulMatch[1];
		}
	}
	if (/{$/.test(line)) {
		if (this.currentDeclaration) {
			throw "Already inside a declaration!";
		}
		this.currentDeclaration = declaration;
		this.currentBasicBlock = undefined;
	}
	this.declarations[name] = declaration;
}

Parser.prototype.parseBasicBlock = function(line) {
	if (!this.currentDeclaration) {
		throw "Found a basic block declaration outside of function declaration!";
	}
	var argMatch = line.match(/\((.*)\)/);
	if (argMatch) {
		var args = splitNoParens(argMatch[1]).map(arg => arg.match(/^%(\d+)/)[1])
	}
	this.currentBasicBlock = {
		name: line.match(/^\w+\b/)[0],
		arguments: args || [],
		instructions: [],
		references: [],
		backReferences: [],
	}
	this.currentDeclaration.basicBlocks.push(this.currentBasicBlock);
}

function parseInstruction(line) {
	if (/^debug_value\s/.test(line)) {
		return;
	}
	if (/^debug_value_addr\s/.test(line)) {
		return;
	}
	if (/^retain_value\s+/.test(line)) {
		return;
	}
	if (/^release_value\s+/.test(line)) {
		return;
	}
	if (/^dealloc_stack\s+/.test(line)) {
		return;
	}
	if (/^strong_retain\s+/.test(line)) {
		return;
	}
	if (/^strong_release\s+/.test(line)) {
		return;
	}
	if (line == "unreachable") {
		return {
			type: "unreachable"
		};
	}
	var match = line.match(/^\%(\w+)\s*=\s*(\w+)\s*(.*)/);
	if (match) {
		var assignment = {
			type: "assignment",
			destinationLocalName: match[1],
			instruction: match[2],
		};
		var args = match[3];
		switch (assignment.instruction) {
			case "integer_literal":
				assignment.value = args.split(",")[1].trim();
				break;
			case "string_literal":
				assignment.value = args.match(/\".*\"/)[0];
				break;
			case "enum":
				var enumMatch = args.match(/^\$(.*),\s+.*?\.(\w+)\!.*(,\s+\%\w+\s+:)?/);
				assignment.enumName = basicNameForStruct(enumMatch[1]);
				assignment.caseName = enumMatch[2];
				if (enumMatch[3]) {
					assignment.sourceLocalName = enumMatch[3].match(/^,\s+\%(\w+)\s+:$/)[1];
				}
				break;
			case "struct":
				var structMatch = args.match(/^\$(.*?)\s+\((.*)\)/);
				assignment.structName = basicNameForStruct(structMatch[1]);
				assignment.arguments = splitNoParens(structMatch[2]).map(arg => arg.match(/^%(\d+)/)[1]);
				break;
			case "tuple":
				var match = args.match(/^\((.*)\)/);
				if (match && match[1]) {
					assignment.arguments = splitNoParens(match[1]).map(arg => arg.match(/^%(\d+)/)[1]);
				} else {
					assignment.arguments = [];
				}
				break;
			case "struct_extract":
				var structMatch = args.match(/^%(\d+)\s*:\s*.*\.(.*)$/);
				assignment.sourceLocalName = structMatch[1];
				assignment.fieldName = structMatch[2];
				break;
			case "tuple_extract":
				var tupleMatch = args.match(/^%(\d+)\s*:.*,\s*(\d+)$/);
				assignment.sourceLocalName = tupleMatch[1];
				assignment.fieldIndex = tupleMatch[2];
				break;
			case "builtin":
				var builtinMatch = args.match(/^\"(\w+)\"(<\w+>)?\((.*)\)\s*:/);
				assignment.builtinName = builtinMatch[1];
				assignment.arguments = splitNoParens(builtinMatch[3]).map(arg => arg.match(/^%(\d+)/)[1]);
				break;
			case "function_ref":
				var functionMatch = args.match(/^@(\w+)\s*:/);
				assignment.functionName = functionMatch[1];
				break;
			case "apply":
				var applyMatch = args.match(/^(\[nothrow\]\s+)?%(\d+)\((.*)\)\s*:/);
				assignment.sourceLocalName = applyMatch[2];
				assignment.arguments = splitNoParens(applyMatch[3]).map(arg => arg.match(/^%(\d+)$/)[1]);
				break;
			case "alloc_stack":
				break;
			case "alloc_box":
				break;
			case "project_box":
				var boxMatch = args.match(/^%(\w+)\s+:/);
				assignment.sourceLocalName = boxMatch[1];
				break;
			case "struct_element_addr":
				var structMatch = args.match(/^%(\w+)\s+:\s+.*?#(\w+)\.(\w+)$/);
				assignment.sourceLocalName = structMatch[1];
				assignment.structName = structMatch[2];
				assignment.fieldName = structMatch[3];
				break;
			case "load":
				var loadMatch = args.match(/^%(\w+)\s+:/);
				assignment.sourceLocalName = loadMatch[1];
				break;
			case "unchecked_enum_data":
				var enumMatch = args.match(/^%(\w+)\s+:/);
				assignment.sourceLocalName = enumMatch[1];
				break;
			case "unchecked_addr_cast":
			case "pointer_to_address":
			case "ref_to_raw_pointer":
			case "raw_pointer_to_ref":
				var match = args.match(/^%(\w+)\s+:/);
				assignment.sourceLocalName = match[1];
				break;
			case "index_raw_pointer":
				var match = args.match(/^%(\w+)\s+:.*?,\s+%(\w+)\s+:/)
				assignment.sourceLocalName = match[1];
				assignment.offsetLocalName = match[2];
				break;
			default:
				assignment.unparsedArguments = args;
				break;
		}
		return assignment;
	}
	match = line.match(/^return\s+\%(\w+) :/);
	if (match) {
		return {
			type: "return",
			localName: match[1],
		};
	}
	match = line.match(/^br\s+(\w+)\((.*)\)/) || line.match(/^br\s+(\w+)/);
	if (match) {
		return {
			type: "branch",
			blockName: match[1],
			arguments: match[2] ? splitNoParens(match[2]).map(arg => arg.match(/^%(\d+)/)[1]) : [],
		};
	}
	match = line.match(/^cond_br\s+\%(\w+),\s*(\w+),\s(\w+)/);
	if (match) {
		return {
			type: "conditional_branch",
			localName: match[1],
			trueBlockName: match[2],
			falseBlockName: match[3],
		};
	}
	match = line.match(/^store\s+\%(\w+)\s+to\s+\%(\w+)\s+:/);
	if (match) {
		return {
			type: "store",
			sourceLocalName: match[1],
			destinationLocalName: match[2],
		};
	}
	match = line.match(/^switch_enum\s+\%(\w+)\s+:\s+.*?,\s+(case .*)/);
	if (match) {
		return {
			type: "switch_enum",
			localName: match[1],
			cases: splitNoParens(match[2]).map(arg => {
				var match = arg.match(/^case\s+\#(.*):\s+(.*)$/);
				return {
					"case": match[1],
					"basicBlock": match[2]
				};
			})
		};
	}
	match = line.match(/^try_apply\s+%(\w+)\((.*)\)\s+:.*,\s+normal\s+(\w+),\s+error\s+(\w+)/);
	if (match) {
		return {
			type: "try_apply",
			localName: match[1],
			arguments: splitNoParens(match[2]).map(arg => arg.match(/^%(\d+)$/)[1]),
			normalBlockName: match[3],
			errorBlockName: match[4],
		};
	}
	match = line.match(/^throw\s+%(\w+)\s*:/);
	if (match) {
		return {
			type: "throw",
			name: match[1],
		};
	}
	throw "Unknown instruction: " + line;
}

Parser.prototype.addLine = function(originalLine) {
	line = originalLine.replace(/\s*\/\/.*/, "");
	if (line.length != 0) {
		var directive = line.match(/^\w+\b/);
		if (directive) {
			directive = directive[0];
			switch (directive) {
				case "sil_stage":
					// Do nothing with sil_stage directives
					break;
				case "import":
					// Do nothing with import directives
					break;
				case "sil":
					this.parseSil(line);
					break;
				default:
					if (/^\w+(\(.*\))?:$/.test(line)) {
						// Found basic block!
						this.parseBasicBlock(line);
					}
					break;
			}
		} else if (/}$/.test(line)) {
			if (this.currentDeclaration) {
				this.currentDeclaration = undefined;
				this.currentBasicBlock = undefined;
			} else {
				// Not inside a declaration!
				// Should be an error, but we aren't even close to understanding Swift's protocols/method tables
			}
		} else if (/^  /.test(line)) {
			if (this.currentBasicBlock) {
				var instruction = parseInstruction(line.trim());
				if (instruction) {
					this.currentBasicBlock.instructions.push(instruction);
				}
			} else {
				// Not inside a declaration or basic block!
				// Should be an error, but we aren't even close to understanding Swift's protocols/method tables
			}
		} else {
			console.log("Unknown: " + line);
		}
	}
	this.lookbackLine = originalLine;
}

module.exports = Parser;