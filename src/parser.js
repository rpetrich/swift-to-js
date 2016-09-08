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
	this.declarations = [];
	this.currentDeclaration = undefined;
	this.currentBasicBlock = undefined;
	// Lookback, to steal some unmangled name information that swiftc sticks in a comment
	this.lookbackLine = undefined;
}

Parser.prototype.parseSil = function(line) {
	var name = line.split(/:/)[0].split(/\s+/).filter(part => /^@/.test(part))[0].substring(1);
	var declaration = {
		name: name,
		type: "function",
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
	this.declarations.push(declaration);
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
			operation: "unreachable"
		};
	}
	var match = line.match(/^\%(\w+)\s*=\s*(\w+)\s*(.*)/);
	if (match) {
		var assignment = {
			operation: "assignment",
			destinationLocalName: match[1],
			instruction: match[2],
			inputs: [],
		};
		var args = match[3];
		switch (assignment.instruction) {
			case "integer_literal":
				var match = args.match(/^\$(.*),\s+(.*)?$/);
				assignment.type = match[1];
				assignment.value = match[2];
				break;
			case "string_literal":
				assignment.value = args.match(/\".*\"/)[0];
				break;
			case "enum":
				var match = args.match(/^\$(.*),\s+.*?\.(\w+)\!.*(,\s+\%\w+\s+:)?/);
				assignment.type = basicNameForStruct(match[1]);
				assignment.caseName = match[2];
				if (match[3]) {
					match = match[3].match(/^,\s+\%(\w+)\s+:$(.*)$/);
					assignment.inputs = [{
						localName: match[1],
						type: match[2]
					}];
				}
				break;
			case "struct":
				var match = args.match(/^\$(.*?)\s+\((.*)\)/);
				assignment.type = match[1];
				assignment.inputs = splitNoParens(match[2]).map(arg => {
					var match = arg.match(/^%(\d+)\s*:\s*\$.*?\s*$/);
					return {
						localName: match[1],
						type: match[2]
					}
				});
				break;
			case "tuple":
				var match = args.match(/^(\$\(.*?\)\s+)?\((.*)\)/);
				if (match && match[2]) {
					assignment.inputs = splitNoParens(match[2]).map(arg => {
						var match = arg.match(/^%(\d+)\s*:\s*\$(.*)$/);
						return {
							localName: match[1],
							type: match[2],
						};
					});
				} else {
					assignment.inputs = [];
				}
				break;
			case "struct_extract":
			case "tuple_extract":
				var match = args.match(/^%(\d+)\s*:\s*\$(.*)\.(.*)$/);
				assignment.inputs = [{
					localName: match[1],
					type: match[2]
				}]
				assignment.fieldName = match[3];
				break;
			case "builtin":
				var match = args.match(/^\"(\w+)\"(<\w+>)?\((.*)\)\s*:/);
				assignment.builtinName = match[1];
				assignment.inputs = splitNoParens(match[3]).map(arg => {
					var match = arg.match(/^%(\d+)\s*:\s*\$(.*)$/)
					return {
						localName: match[1],
						type: match[2]
					};
				});
				break;
			case "function_ref":
				var functionMatch = args.match(/^@(\w+)\s*:/);
				assignment.functionName = functionMatch[1];
				break;
			case "apply":
				var applyMatch = args.match(/^(\[nothrow\]\s+)?%(\d+)(<.*>)?\((.*)\)\s*:/);
				var parameters = splitNoParens(applyMatch[4]).map(arg => {
					var match = arg.match(/^%(\d+)(#\d+)?$(.*)/)
					return {
						localName: match[1],
						type: match[3]
					};
				});
				parameters.unshift({
					localName: applyMatch[2]
				});
				assignment.inputs = parameters;
				break;
			case "alloc_stack":
				break;
			case "alloc_box":
				break;
			case "project_box":
				var match = args.match(/^%(\w+)\s+:/);
				assignment.inputs = [{
					localName: match[1]
				}];
				break;
			case "struct_element_addr":
				var match = args.match(/^%(\w+)\s+:\s+.*?#(\w+)\.(\w+)$/);
				assignment.inputs = [{
					localName: match[1],
					type: match[2]
				}];
				assignment.fieldName = match[3];
				break;
			case "global_addr":
				var match = args.match(/^@(\w+)\s*:\s*(.*)/);
				assignment.globalName = match[1];
				assignment.type = match[2];
				break;
			case "load":
				var match = args.match(/^%(\w+)(#\d+)?\s+:\s*(.*)/);
				assignment.inputs = [{
					localName: match[1],
					type: match[3]
				}];
				break;
			case "unchecked_enum_data":
				var match = args.match(/^%(\w+)\s+:\s*(.*)/);
				assignment.inputs = [{
					localName: match[1],
					type: match[2]
				}];
				break;
			case "unchecked_addr_cast":
			case "unchecked_ref_cast":
			case "pointer_to_address":
			case "address_to_pointer":
			case "ref_to_raw_pointer":
			case "raw_pointer_to_ref":
				var match = args.match(/^%(\w+)\s+:\s*(.*)/);
				assignment.inputs = [{
					localName: match[1],
					type: match[2],
				}];
				break;
			case "index_raw_pointer":
			case "index_addr":
				assignment.inputs = splitNoParens(args).map(arg => {
					var match = args.match(/^%(\w+)\s+:\s*(.*)*/);
					return {
						localName: match[1],
						type: match[2]
					}
				});
				break;
			default:
				assignment.unparsedArguments = args;
				break;
		}
		return assignment;
	}
	match = line.match(/^return\s+\%(\d+)\s*:\s*\$(.*)/);
	if (match) {
		return {
			operation: "return",
			inputs: [{
				localName: match[1],
				type: match[2]
			}]
		};
	}
	match = line.match(/^br\s+(\w+)\((.*)\)/) || line.match(/^br\s+(\w+)/);
	if (match) {
		var inputs = match[2] ? splitNoParens(match[2]).map(arg => {
			var match = arg.match(/^%(\d+)\s*:\s*\$(.*)/);
			return {
				localName: match[1],
				type: match[2]
			};
		}) : [];
		return {
			operation: "branch",
			block: { reference: match[1] },
			inputs: inputs,
		};
	}
	match = line.match(/^cond_br\s+\%(\w+),\s*(\w+),\s(\w+)/);
	if (match) {
		return {
			operation: "conditional_branch",
			inputs: [{
				localName: match[1],
			}],
			trueBlock: { reference: match[2] },
			falseBlock: { reference: match[3] },
		};
	}
	match = line.match(/^store\s+\%(\w+)\s+to\s+\%(\w+)(\#\d+)?\s+:/);
	if (match) {
		return {
			operation: "store",
			inputs: [{
				localName: match[1]
			},{
				localName: match[2]
			}]
		};
	}
	match = line.match(/^switch_enum\s+\%(\w+)\s+:\s+.*?,\s+(case .*)/);
	if (match) {
		var cases = splitNoParens(match[2]).map(arg => {
			var match = arg.match(/^case\s+\#(.*):\s+(.*)$/);
			return {
				"case": match[1],
				"basicBlock": { reference: match[2] }
			};
		})
		return {
			operation: "switch_enum",
			inputs: [{
				localName: match[1]
			}],
			cases: cases,
		};
	}
	match = line.match(/^try_apply\s+%(\w+)(<.*>)?\((.*)\)\s+:.*,\s+normal\s+(\w+),\s+error\s+(\w+)/);
	if (match) {
		var parameters = splitNoParens(match[3]).map(arg => {
			var match = arg.match(/^%(\d+)$/)
			return {
				localName: match[1]
			};
		});
		parameters.unshift({
			localName: match[1]
		});
		return {
			operation: "try_apply",
			inputs: parameters,
			arguments: args,
			normalBlock: { reference: match[4] },
			errorBlock: { reference: match[5] },
		};
	}
	match = line.match(/^throw\s+%(\w+)\s*:/);
	if (match) {
		return {
			operation: "throw",
			name: match[1],
			inputs: [],
		};
	}
	throw "Unknown instruction: " + line;
}

Parser.prototype.parseSilGlobal = function (line) {
	var declaration = {
		name: line.match(/\@(\w+)/)[1],
		type: "global",
	};
	this.declarations.push(declaration);
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
				case "sil_global":
					this.parseSilGlobal(line);
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