var stdlib = require("./stdlib.js");
var types = stdlib.types;
var builtins = stdlib.builtins;

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
    return result.length == 1 && result[0] == "" ? [] : result;
}

function basicNameForStruct(structName) {
	var match = structName.match(/^(\*)?(@(thin|thick|sil_unmanaged|callee_owned|callee_guaranteed|opened\(.*\))\s)?(\w+|\(\w+\))/);
	if (!match) {
		// console.log(structName);
	}
	return match[1] ? (match[1] + match[4]) : match[4];
}

function Parser() {
	this.declarations = [];
	this.globals = [];
	this.types = JSON.parse(JSON.stringify(types));
	this.builtins = builtins;
	this.currentDeclaration = undefined;
	this.currentBasicBlock = undefined;
	// Lookback, to steal some unmangled name information that swiftc sticks in a comment
	this.lookbackLine = undefined;
}

Parser.caseNameForEnum = fullEnumName => fullEnumName.match(/^\w+\.(\w+)\!/)[1];
Parser.removePointer = typeName => typeName.match(/^\*?(.*)$/)[1];

Parser.prototype.parseSil = function(line) {
	var name = line.split(/:/)[0].split(/\s+/).filter(part => /^@/.test(part))[0].substring(1);
	var conventionMatch = line.match(/\$\@convention\((\w+)\)\s/);
	var declaration = {
		name: name,
		type: "function",
		basicBlocks: [],
		localNames: {},
		convention: conventionMatch ? conventionMatch[1] : "swift"
	};
	if (!/\b(hidden|shared_external|private|global_init)\b/.test(line) && (declaration.convention != "method")) {
		if (!/^\/\/ (specialized|protocol\s witness)\s/.test(this.lookbackLine)) {
			var beautifulMatch = this.lookbackLine.match(/^\/\/ (\w+\.)?(\w+)/);
			if (beautifulMatch && beautifulMatch[2] != "protocol") {
				declaration.beautifulName = beautifulMatch[2];
			}
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

Parser.prototype.addLocalName = function (name, type, source) {
	if (type === undefined) {
		throw new Error("No type for %" + name + " in " + JSON.stringify(source));
	}
	var oldType = this.currentDeclaration.localNames[name];
	if (oldType === undefined) {
		this.currentDeclaration.localNames[name] = type;
	} else if (oldType != type) {
		throw new Error("Tried to replace type \"" + oldType + "\" with \"" + type + "\" for local %" + name + " in " + JSON.stringify(source));
	}
	this.currentBasicBlock.localNames[name] = type;
	return name;
}

Parser.prototype.parseBasicBlock = function(line) {
	if (!this.currentDeclaration) {
		throw "Found a basic block declaration outside of function declaration!";
	}
	var argMatch = line.match(/\((.*)\)/);
	if (argMatch) {
		var args = splitNoParens(argMatch[1]).map(arg => {
			var match = arg.match(/^%(\d+)\s+:\s+\$(.*)/)
			return {
				localName: match[1],
				type: basicNameForStruct(match[2]),
			};
		});
	}
	this.currentBasicBlock = {
		name: line.match(/^\w+\b/)[0],
		arguments: args || [],
		instructions: [],
		localNames: {},
	}
	this.currentDeclaration.basicBlocks.push(this.currentBasicBlock);
	this.currentBasicBlock.arguments.forEach(arg => this.addLocalName(arg.localName, arg.type, arg));
}

function simpleLocalContents(name, type, source) {
	return {
		interpretation: "contents",
		localNames: [name],
		type: type,
		source: source,
	};
}

Parser.prototype.parseInstruction = function (line, source) {
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
	if (/^dealloc_ref\s+/.test(line)) {
		return;
	}
	if (/^strong_retain\s+/.test(line)) {
		return;
	}
	if (/^strong_release\s+/.test(line)) {
		return;
	}
	if (/^bind_memory\s+/.test(line)) {
		return;
	}
	if (/^destroy_addr\s+/.test(line)) {
		return;
	}
	if (/^deinit_existential_addr\s+/.test(line)) {
		return;
	}
	if (/^fix_lifetime\s+/.test(line)) {
		return;
	}
	if (line == "unreachable") {
		return {
			operation: "unreachable",
			source: source,
			inputs: []
		};
	}
	var match = line.match(/^\%(\w+)\s*=\s*(\w+)\s*(.*)/);
	if (match) {
		var destinationLocalName = match[1];
		var interpretation = match[2];
		var args = match[3];
		var input = {
			interpretation: interpretation,
			localNames: [],
			source: source,
		};
		switch (interpretation) {
			case "integer_literal":
				var match = args.match(/^\$(.*),\s+(.*)?$/);
				input.type = match[1];
				input.value = Number(match[2]);
				if (input.type == "Builtin.Int1") {
					input.value = input.value != 0;
				}
				break;
			case "float_literal":
				var match = args.match(/^\$(.*),\s+(.*)?$/);
				input.type = match[1];
				input.value = Number(match[2]);
				break;
			case "string_literal":
				input.value = JSON.parse("[" + args.match(/\".*\"/)[0] + "]")[0];
				input.type = "Builtin.RawPointer";
				break;
			case "enum":
				var match = args.match(/^\$(.*),\s+.*?\.(\w+)\!.*?(,\s%(\d+) : \$(.*))?$/);
				input.type = basicNameForStruct(match[1]);
				input.caseName = match[2];
				if (match[4]) {
					input.localNames = [match[4]];
				}
				break;
			case "struct":
				var match = args.match(/^\$(.*?)\s+\((.*)\)/);
				input.type = basicNameForStruct(match[1]);
				input.localNames = splitNoParens(match[2]).map(arg => {
					var match = arg.match(/^%(\d+)\s*:\s*\$.*?\s*$/);
					return match[1];
					return {
						localName: match[1],
						type: match[2]
					}
				});
				break;
			case "tuple":
				var match = args.match(/^(\$\(.*?\)\s+)?\((.*)\)/);
				var descriptors = []
				if (match && match[2]) {
					descriptors = splitNoParens(match[2]).map(arg => {
						var match = arg.match(/^%(\d+)\s*:\s*\$(.*)$/);
						if (match) {
							return {
								localName: match[1],
								type: match[2],
							};
						} else {
							match = arg.match(/^%(\d+)$/);
							return {
								localName: match[1],
							};
						}
					});
				}
				input.localNames = descriptors.map(i => i.localName);
				input.type = "(" + descriptors.map(i => i.type).join(", ") + ")";
				break;
			case "struct_extract":
				var match = args.match(/^%(\d+)\s*:\s*\$(.*),\s*.*#.*\.(.*)$/);
				input.localNames = [match[1]];
				input.type = basicNameForStruct(match[2]);
				input.fieldName = match[3];
				break;
			case "tuple_extract":
				var match = args.match(/^%(\d+)\s*:\s*\$\((.*)\),\s+(\d+)$/);
				input.localNames = [match[1]];
				input.fieldName = match[3] | 0;
				input.type = splitNoParens(match[2])[input.fieldName];
				break;
			case "builtin":
				var match = args.match(/^\"(\w+)\"(<\w+>)?\((.*)\)\s*:\s*\$(.*)/);
				input.localNames = splitNoParens(match[3]).map(arg => {
					var match = arg.match(/^%(\d+)\s*:\s*\$(.*)$/)
					return match[1];
					return {
						localName: match[1],
						type: match[2]
					};
				});
				input.builtinName = match[1];
				input.type = match[4];
				break;
			case "function_ref":
				var match = args.match(/^@(\w+)\s*:\s*\$(.*)/);
				input.functionName = match[1];
				input.type = match[2]
				break;
			case "apply":
				var match = args.match(/^(\[nothrow\]\s+)?%(\d+)(<.*>)?\((.*)\)\s*:\s+\$(@convention\((\w+)\)\s+)?(.*)?\s+\-\>\s+(.*)/);
				var parameters = splitNoParens(match[4]).map(arg => {
					var match = arg.match(/^%(\d+)(#\d+)?$(.*)/)
					return match[1];
					// return {
					// 	localName: match[1],
					// 	type: match[3]
					// };
				});
				// parameters.unshift({
				// 	localName: match[2]
				// });
				parameters.unshift(match[2]);
				input.localNames = parameters;
				input.type = match[7];
				input.convention = match[6];
				break;
			case "partial_apply":
				var match = args.match(/^(\[nothrow\]\s+)?%(\d+)(<.*>)?\((.*)\)\s*:/);
				var parameters = splitNoParens(match[4]).map(arg => {
					var match = arg.match(/^%(\d+)(#\d+)?$(.*)/)
					return match[1]
					// return {
					// 	localName: match[1],
					// 	type: match[3]
					// };
				});
				// parameters.unshift({
				// 	localName: match[2]
				// });
				parameters.unshift(match[2]);
				input.localNames = parameters;
				input.type = "TODO";
				break;
			case "alloc_stack":
				var match = args.match(/^\$(.*)/);
				input.type = basicNameForStruct(match[1]);
				break;
			case "alloc_box":
				var match = args.match(/^\$(.*)?,/);
				input.type = basicNameForStruct(match[1]);
				break;
			case "alloc_ref":
				var match = args.match(/^\$(.*)/)
				input.type = basicNameForStruct(match[1]);
				break;
			case "project_box":
				var match = args.match(/^%(\w+)\s+:\s+\$(.*)/);
				// assignment.inputs = [{
				// 	localName: match[1]
				// }];
				input.localNames = [match[1]];
				input.type = basicNameForStruct(match[2]);
				break;
			case "is_unique":
				input.value = "false";
				input.type = "Builtin.Int1";
				input.interpretation = "integer_literal";
				break;
			case "struct_element_addr":
				var match = args.match(/^%(\w+)(\#\d+)?\s+:\s+.*?#(\w+)\.(\w+)$/);
				// assignment.inputs = [{
				// 	localName: match[1],
				// 	type: match[3]
				// }];
				input.localNames = [match[1]];
				input.fieldName = match[4];
				input.type = match[3];
				break;
			case "ref_element_addr":
				var match = args.match(/%(\d+)\s+:\s+\$(.*),\s+#.*\.(.*)/)
				// assignment.inputs = [{
				// 	localName: match[1],
				// }];
				input.localNames = [match[1]];
				input.fieldName = match[3];
				input.type = match[2];
				break;
			case "global_addr":
				var match = args.match(/^@(\w+)\s*:\s*\$(.*)/);
				input.globalName = match[1];
				input.type = match[2];
				break;
			case "load":
				var match = args.match(/^%(\w+)(#\d+)?\s+:\s*\$(.*)/);
				// assignment.inputs = [{
				// 	localName: match[1],
				// 	type: match[3]
				// }];
				input.localNames = [match[1]];
				input.type = match[3].substring(1);
				break;
			case "mark_uninitialized":
				var match = args.match(/^((\[\w+\]\s+)*)%(\w+)(#\d+)?\s+:\s\$*(.*)/);
				// assignment.inputs = [{
				// 	localName: match[3],
				// 	type: match[5]
				// }];
				input.localNames = match[3];
				input.type = match[5]
				input.interpretation = "contents";
				break;
			case "init_existential_metatype":
				var match = args.match(/^%(\d+)\s+:\s+\$(@thin\s+)?(.*)\.Type/);
				input.localNames = [match[1]];
				input.type = match[3];
				input.interpretation = "contents";
				break;
			case "mark_dependence":
				var match = args.match(/^%(\d+)\s+:\s+\$(.*)\s+on\s+/);
				input.localNames = [match[1]];
				input.type = match[2];
				input.interpretation = "contents";
				break;
			case "init_enum_data_addr":
				var match = args.match(/^%(\d+)\s+:\s+\$(.*),\s+\#.*\.(\w+)\!/);
				input.localNames = [match[1]];
				input.type = match[2];
				input.interpretation = "init_enum_data_addr";
				break;
			case "unchecked_enum_data":
			case "unchecked_take_enum_data_addr":
				var match = args.match(/^%(\w+)\s+:\s*.*#(.*)\..*\!/);
				// assignment.inputs = [{
				// 	localName: match[1],
				// 	type: match[2]
				// }];
				input.localNames = [match[1]];
				input.type = match[2];
				break;
			case "select_enum":
			case "select_enum_addr":
				var match = args.match(/^%(\d+)\s+:\s+\$?(.*?),\s+(case .*?)$/);
				var localNames = [match[1]];
				var cases = splitNoParens(match[3]).map(arg => {
					var match = arg.match(/^case\s+\#(.*):\s+%(\d+)( : .*)?$/);
					if (match) {
						localNames.push(match[2]);
						return {
							"case": match[1],
						};
					} else {
						match = arg.match(/^default\s+(.*)/);
						localNames.push(match[1]);
						return {
						};
					}
				})
				input.localNames = localNames;
				input.type = basicNameForStruct(match[2]);
				input.cases = cases;
				break;
			case "select_value":
				var match = args.match(/%(\d+)\s:\s\$(.*)?,\s+(.*)\s+:\s+\$(.*)/);
				input.localNames = [match[1]].concat(splitNoParens(args[3]).reduce((result, arg) => {
					var match = arg.match(/^case\s+\%(.*):\s+%(\d+)$/);
					if (match) {
						return result.concat([match[1], match[2]]);
					} else {
						match = arg.match(/default\s+%(\d+)$/);
						if (match) {
							return result.concat([match[1]]);
						} else {
							return result;
						}
					}
				}, []));
				input.type = basicNameForStruct(match[2]);
				break;
			case "address_to_pointer":
			case "unchecked_ref_cast":
				var match = args.match(/^%(\w+)\s+:\s*\$(.*) to \$(.*)/);
				// assignment.inputs = [{
				// 	localName: match[1],
				// 	type: match[2],
				// }];
				input.localNames = [match[1]];
				input.type = match[3];
				input.interpretation = "contents";
				break;
			case "unchecked_addr_cast":
			case "pointer_to_address":
			case "ref_to_raw_pointer":
			case "raw_pointer_to_ref":
				var match = args.match(/^%(\d+)\s+:\s*(.*)/);
				// assignment.inputs = [{
				// 	localName: match[1],
				// 	type: match[2],
				// }];
				input.localNames = [match[1]];
				input.type = match[2];
				input.interpretation = "contents";
				break;
			case "thin_to_thick_function":
			case "convert_function":
			case "thin_function_to_pointer":
				var match = args.match(/^%(\d+)\s+:\s+.* to \$(.*)/);
				// assignment.inputs = [{
				// 	localName: match[1],
				// }];
				input.localNames = [match[1]];
				input.type = [match[2]];
				input.interpretation = "contents";
				break;
			case "index_raw_pointer":
				input.localNames = splitNoParens(args).map(arg => {
					var match = arg.match(/^%(\w+)\s+:\s*(.*)*/);
					return match[1];
				});
				input.type = "Builtin.RawPointer";
				break;
			case "index_addr":
				var match = args.match(/^%(\d+)\s+:\s+\$(.*),\s+%(\d+)\s+:\s+/);
				input.localNames = [match[1], match[3]];
				input.type = match[2];
				break;
			case "metatype":
				var match = args.match(/^\$(.*)/);
				input.type = match[1];
				break;
			case "upcast":
			case "ref_to_unmanaged":
			case "unmanaged_to_ref":
				var match = args.match(/^%(\d+)\s+:\s+\$(.*) to \$(.*)/);
				// assignment.inputs = [{
				// 	localName: match[1],
				// 	type: match[2],
				// }];
				input.localNames = [match[1]];
				input.type = match[3];
				input.interpretation = "contents";
				break;
			case "witness_method":
				var match = args.match(/^.*?,\s+\#(.*?)(,\s+%(\w+))?\s+:\s+(.*\$\@convention\((\w+)\))?/);
				if (match[3]) {
					input.localNames = [match[3]];
				} else {
					// Pull the "self" parameter
					var functionArguments = this.currentDeclaration.basicBlocks[0].arguments;
					input.localNames = [functionArguments[functionArguments.length - 1].localName];
				}
				input.type = "TODO";
				input.entry = match[1];
				input.convention = match[5] || "swift";
				input.interpretation = "class_method";
				break;
			case "class_method":
				var match = args.match(/^(\[volatile\]\s+)?%(\d+)\s+:\s+\$(.*?),\s+#(.*) : (.*)\s+,\s+\$@convention\((\w+)\)/);
				// assignment.inputs = [{
				// 	localName: match[1],
				// 	type: match[2],
				// }]
				input.localNames = [match[2]];
				input.type = match[5];
				input.entry = match[4];
				input.convention = match[6] || "swift";
				break;
			case "open_existential_addr":
				var match = args.match(/^%(\d+)\s+:\s+\$(.*)\s+to\s+/);
				input.localNames = [match[1]];
				input.type = match[2];
				input.interpretation = "contents";
				break;
			case "open_existential_ref":
				var match = args.match(/^%(\d+)\s+:\s+\$(.*)\s+to\s+/);
				input.localNames = [match[1]];
				input.type = match[2];
				input.interpretation = "contents";
				break;
			case "init_existential_addr":
				var match = args.match(/%(\d+)\s+:\s+\$(.*),\s+\$(.*)/);
				input.localNames = [match[1]];
				input.type = match[3];
				input.interpretation = "contents";
				break;
			case "unconditional_checked_cast":
				// TODO: Trap if the cast fails, instead of downstream when the value is used
				var match = args.match(/^%(\d+)\s+:\s+\$(.*)\s+to\s+/);
				input.localNames = [match[1]];
				input.type = match[2];
				input.interpretation = "contents";
				break;
			default:
				throw new Error("Unable to interpret " + input.interpretation + " from line: " + line);
				break;
		}
		var assignment = {
			source: source,
			operation: "assignment",
			destinationLocalName: destinationLocalName,
			inputs: [input],
		};
		this.addLocalName(assignment.destinationLocalName, input.type, assignment);
		return assignment;
	}
	match = line.match(/^return\s+\%(\d+)\s*:\s*\$(.*)/);
	if (match) {
		return {
			operation: "return",
			source: source,
			inputs: [simpleLocalContents(match[1], match[2], source)],
		};
	}
	match = line.match(/^br\s+(\w+)\((.*)\)/) || line.match(/^br\s+(\w+)/);
	if (match) {
		var inputs = match[2] ? splitNoParens(match[2]).map(arg => {
			var match = arg.match(/^%(\d+)\s*:\s*\$(.*)/);
			return simpleLocalContents(match[1], match[2], source);
		}) : [];
		return {
			operation: "branch",
			source: source,
			block: { reference: match[1] },
			inputs: inputs,
		};
	}
	match = line.match(/^cond_br\s+\%(\d+),\s*(\w+),\s(\w+)/);
	if (match) {
		return {
			operation: "conditional_branch",
			source: source,
			inputs: [simpleLocalContents(match[1], "Builtin.Int1", source)],
			trueBlock: { reference: match[2] },
			falseBlock: { reference: match[3] },
		};
	}
	match = line.match(/^checked_cast_br\s+(\[exact\]\s+)?\%(\d+)\s+:.* to \$(.*),\s*(\w+),\s*(\w+)/);
	if (match) {
		// We don't do checked casts, assume that the argument type is always correct
		return {
			operation: "checked_cast_branch",
			source: source,
			inputs: [simpleLocalContents(match[2], undefined, source)], // No inputs
			trueBlock: { reference: match[4] },
			falseBlock: { reference: match[5] },
			type: match[3],
			exact: !!match[1],
		};
	}
	match = line.match(/^checked_cast_addr_br\s+(take_always|take_on_success|copy_on_success)\s+.*\s+in\s+\%(\d+)\s+:\s+\$(.*)\s+to\s+.*\s+in\s+\%(\d+)\s+:\s+\$(.*)\,\s+(\w+),\s+(\w+)/);
	if (match) {
		return {
			operation: "checked_cast_addr_br",
			source: source,
			inputs: [simpleLocalContents(match[2], match[3], source), simpleLocalContents(match[4], match[5], source)],
			trueBlock: { reference: match[6] },
			falseBlock: { reference: match[7] },
			type: match[5],
		}
	}
	match = line.match(/^inject_enum_addr\s+\%(\d+)\s+:\s+\$(.*)\,\s+\#.*\.(.*)\!/);
	if (match) {
		return {
			operation: "inject_enum_addr",
			source: source,
			inputs: [simpleLocalContents(match[1], match[2], source)],
			type: basicNameForStruct(match[2]),
			caseName: match[3],
		}
	}
	match = line.match(/^cond_fail\s+\%(\w+)\s+:/);
	if (match) {
		return {
			operation: "conditional_fail",
			source: source,
			inputs: [simpleLocalContents(match[1], undefined, source)],
		};
	}
	match = line.match(/^(store|assign)\s+\%(\w+)\s+to\s+\%(\w+)(\#\d+)?\s+:\s+\$(.*)/);
	if (match) {
		return {
			operation: "store",
			source: source,
			inputs: [simpleLocalContents(match[2], undefined, source), simpleLocalContents(match[3], undefined, source)],
			type: match[5],
		};
	}
	match = line.match(/^(unconditional_checked_cast(_addr)?)\s+(take_always|take_on_success|copy_on_success)\s+.*\s+in\s+%(\d+)\s+:\s+\$(.*)\s+to\s+.*\s+in\s+%(\d+)\s+:\s+\$(.*)/);
	if (match) {
		return {
			operation: "store",
			source: source,
			inputs: [simpleLocalContents(match[4], undefined, source), simpleLocalContents(match[6], undefined, source)],
			type: match[7],
		}
	}
	match = line.match(/^copy_addr\s+(\[take\]\s+)?\%(\w+)(\#\d+)?\s+to\s+(\[initialization\]\s+)?\%(\w+)(\#\d+)?\s+:/);
	if (match) {
		return {
			operation: "copy_addr",
			source: source,
			inputs: [simpleLocalContents(match[2], undefined, source), simpleLocalContents(match[5], undefined, source)],
		};
	}
	match = line.match(/^alloc_global\s+\@(.*)/);
	if (match) {
		var name = match[1];
		return {
			operation: "alloc_global",
			source: source,
			name: name,
			type: this.globals[name].globalType,
			inputs: [],
		};
	}
	match = line.match(/^(switch_enum(_addr)?)\s+\%(\d+)\s+:\s+\$?(.*?),\s+(case .*?)$/);
	if (match) {
		var cases = splitNoParens(match[5]).map(arg => {
			var match = arg.match(/^case\s+\#(.*):\s+(.*)$/);
			if (match) {
				return {
					"case": match[1],
					"basicBlock": { reference: match[2] }
				};
			} else {
				match = arg.match(/^default\s+(.*)/);
				return {
					"basicBlock": { reference: match[1] }
				};
			}
		})
		return {
			operation: match[1],
			source: source,
			inputs: [simpleLocalContents(match[3], undefined, source)],
			cases: cases,
			type: basicNameForStruct(match[4]),
		};
	}
	match = line.match(/^try_apply\s+%(\w+)(<.*>)?\((.*)\)\s+:\s+\$(.*).*,\s+normal\s+(\w+),\s+error\s+(\w+)/);
	if (match) {
		var inputs = splitNoParens(match[3]).map(arg => {
			var match = arg.match(/^%(\d+)$/)
			return simpleLocalContents(match[1], undefined, source);
		});
		inputs.unshift(simpleLocalContents(match[1], undefined, source))
		var conventionMatch = match[4].match(/^@convention\((\w+)\)\s/);
		return {
			operation: "try_apply",
			source: source,
			inputs: inputs,
			type: match[4],
			convention: conventionMatch[1],
			normalBlock: { reference: match[5] },
			errorBlock: { reference: match[6] },
		};
	}
	match = line.match(/^throw\s+%(\w+)\s*:/);
	if (match) {
		return {
			operation: "throw",
			source: source,
			inputs: [simpleLocalContents(match[1], undefined, source)],
		};
	}
	throw "Unknown instruction: " + line;
}

Parser.prototype.parseSilGlobal = function (line) {
	var match = line.match(/(\bhidden\s+)?\@(\w+)\s+:\s+\$(.*?)(, \@(.*)\s+:\s+\$.*?)?$/)
	var name = match[2];
	var declaration = {
		name: name,
		type: "global",
		globalType: match[3],
		initializer: match[5] || undefined,
	};
	if (!match[1]) {
		var beautifulMatch = this.lookbackLine.match(/^\/\/ (\w+\.)?(\w+)/);
		if (beautifulMatch) {
			declaration.beautifulName = beautifulMatch[2];
		}
	}
	this.declarations.push(declaration);
	this.globals[name] = declaration;
}

Parser.prototype.parseSilVTable = function (line) {
	var declaration = {
		name: line.match(/sil_vtable\s+(.*)\s+{/)[1],
		type: "vtable",
		entries: {}
	};
	this.declarations.push(declaration);
	this.currentDeclaration = declaration;
}

Parser.prototype.parseVTableMapping = function (line) {
	var match = line.match(/^\#(.*):\s+(.*)$/);
	this.currentDeclaration.entries[match[1]] = match[2];
}

Parser.prototype.parseStruct = function (line) {
	var match = line.match(/^(public\s+)?(final\s+)?(internal\s+)?(\w+)\s+(\w+)/);
	this.currentTypeName = match[5];
	this.currentTypeData = {
		personality: "struct",
		fields: [],
	};
};

Parser.prototype.parseClass = function (line) {
	var match = line.match(/^(public\s+)?(final\s+)?(internal\s+)?(\w+)\s+(\w+)(\s+:\s+(\w+))?/);
	this.currentTypeName = match[5];
	this.currentTypeData = {
		personality: "class",
		superclass: match[7] || undefined,
		fields: [],
		beautifulName: match[1] ? match[5] : undefined,
	};
};

Parser.prototype.parseProtocol = function (line) {
	var match = line.match(/^(public\s+)?(final\s+)?(internal\s+)?(\w+)\s+(\w+)(\s+:\s+(\w+))?/);
	this.currentTypeName = match[5];
	this.currentTypeData = {
		personality: "protocol",
		fields: [],
		beautifulName: match[1] ? match[5] : undefined,
	};
};

Parser.prototype.parseEnum = function (line) {
	var match = line.match(/^(public\s+)?(final\s+)?(internal\s+)?(\w+)\s+(\w+)(\s+:\s+(\w+))?/);
	this.currentTypeName = match[5];
	this.currentTypeData = {
		personality: "enum",
		superclass: match[7] || undefined,
		cases: [],
		beautifulName: match[1] ? match[5] : undefined,
	};
}

Parser.prototype.parseTypeData = function (line) {
	if (!/\{$/.test(line)) {
		var match = line.match(/\bvar\s+(\w+):\s+(.*)/);
		if (match) {
			var fieldName = match[1];
			this.currentTypeData.fields.push({ name: fieldName, type: match[2] });
		} else {
			match = line.match(/\bcase\s+(\w+)\b/);
			if (match) {
				var caseName = match[1];
				this.currentTypeData.cases.push(caseName);
			}
		}
	}
}

Parser.prototype.beginPath = function(path) {
	this.currentPath = path;
	this.currentLineNumber = 0;
};

Parser.prototype.addLine = function(originalLine) {
	this.currentLineNumber++;
	line = originalLine.replace(/\s*\/\/.*/, "");
	if (line.length != 0) {
		var directive = line.match(/^(public\s+)?(final\s+)?(internal\s)?(\w+)\b/);
		if (directive) {
			directive = directive[4];
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
				case "sil_vtable":
					this.parseSilVTable(line);
					break;
				case "struct":
					this.parseStruct(line);
					break;
				case "class":
					this.parseClass(line);
					break;
				case "protocol":
					this.parseProtocol(line);
					break;
				case "enum":
					this.parseEnum(line);
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
			} else if (this.currentTypeName) {
				this.types[this.currentTypeName] = this.currentTypeData;
				this.currentTypeName = undefined;
				this.currentTypeData = undefined;
			} else {
				// Not inside a declaration!
				// Should be an error, but we aren't even close to understanding Swift's protocols/method tables
			}
		} else if (/^  /.test(line)) {
			if (this.currentBasicBlock) {
				var match = line.match(/^\s*(.*?)\s*(,? loc "([\w\.]+.\w+)":(\d+):(\d+))?(,? scope \d+)?\s*$/);
				var instruction = this.parseInstruction(match[1], {
					sil: match[1],
					file: match[3] || this.currentPath,
					line: (match[4] || this.currentLineNumber) | 0,
					column: (match[5] || 0) | 0,
				});
				if (instruction) {
					this.currentBasicBlock.instructions.push(instruction);
				}
			} else if (this.currentDeclaration && this.currentDeclaration.type == "vtable") {
				this.parseVTableMapping(line.match(/^\s*(.*)$/)[1]);
			} else if (this.currentTypeName) {
				this.parseTypeData(line.match(/^\s*(.*)$/)[1]);
			} else {
				// Not inside a declaration or basic block!
				// Should be an error, but we aren't even close to understanding Swift's protocols/method tables
			}
		} else if (/^@_silgen_name\(/.test(line)) {
			// Ignore @_silgen_name attributes
		} else {
			console.log("Unable to parse line: " + line);
		}
	}
	this.lookbackLine = originalLine;
}

module.exports = Parser;