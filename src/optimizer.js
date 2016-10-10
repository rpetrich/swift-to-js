var Parser = require("./parser.js");

function findBasicBlock(blocks, descriptor) {
	if (descriptor.reference) {
		for (var i = 0; i < blocks.length; i++) {
			if (blocks[i].name == descriptor.reference) {
				return blocks[i];
			}
		}
		throw new Error("Unable to find basic block: " + descriptor.reference);
	}
	if (descriptor.inline) {
		return descriptor.inline;
	}
	throw new Error("Neither a reference nor an inline block!");
}

function unwrapSimpleStructInstructions(instructions, types) {
	instructions.forEach(instruction => {
		instruction.inputs.forEach(input => {
			switch (input.interpretation) {
				case "struct":
					var structType = types[input.type];
					if (structType && structType.fields.length == 1) {
						input.interpretation = "contents";
					}
					break;
				case "struct_extract":
					var structType = types[input.type];
					if (structType && structType.fields.length == 1) {
						input.interpretation = "contents";
						delete input.fieldName;
					}
					break;
				case "struct_element_addr":
					var structType = types[input.type];
					if (structType && structType.fields.length == 1) {
						input.interpretation = "contents";
						delete input.fieldName;
					}
					break;
			}
		});
	})
}

function unwrapPassthroughBuiltins(instructions, builtins) {
	instructions.forEach(instruction => {
		instruction.inputs.forEach(input => {
			switch (input.interpretation) {
				case "builtin":
					if (builtins[input.builtinName] == builtins.passthrough) {
						input.interpretation = "contents";
						delete input.builtinName;
					}
			}
		});
	})
}

const uncheckedVersionOfBuiltin = originalBuiltinName => originalBuiltinName.replace(/_with_overflow_/, "_with_truncate_").replace(/_checked_trunc_/, "_unchecked_trunc_");

function reassignOverflowBuiltins(instructions, downstreamInstructions, builtins) {
	instructions.forEach((instruction, i) => {
		if (instruction.operation == "assignment") {
			var input = instruction.inputs[0];
			var newBuiltinName;
			if (input.interpretation == "builtin" && (newBuiltinName = uncheckedVersionOfBuiltin(input.builtinName)) != input.builtinName && builtins[newBuiltinName]) {
				var targetInstructions = [];
				for (var k = i + 1; k < instructions.length; k++) {
					var proposedInstruction = instructions[k];
					if (countOfUsesOfLocal(proposedInstruction, instruction.destinationLocalName) > 0) {
						if (proposedInstruction.inputs[0].interpretation != "tuple_extract" || (proposedInstruction.inputs[0].fieldName | 0) != 0) {
							return;
						}
						targetInstructions.push(proposedInstruction);
					}
				}
				if (!downstreamInstructions.some(otherInstruction => countOfUsesOfLocal(otherInstruction, instruction.destinationLocalName) != 0)) {
					input.builtinName = newBuiltinName;
					targetInstructions.forEach(otherInstruction => {
						otherInstruction.inputs[0].interpretation = "contents";
						delete otherInstruction.inputs[0].fieldName;
					});
				}
			}
		}
	});
}

function unwrapStrings(instructions) {
	instructions.forEach(instruction => {
		instruction.inputs.forEach(input => {
			switch (input.interpretation) {
				case "struct":
					if (input.type == "_StringCore" || input.type == "StaticString") {
						input.interpretation = "contents";
						input.localNames.splice(1, input.localNames.length - 2);
					}
					break;
				case "struct_extract":
					if (input.type == "_StringCore") {
						if (input.fieldName == "_countAndFlags") {
							input.fieldName = "length";
						} else if (input.fieldName == "_baseAddress") {
							input.interpretation = "contents";
							delete input.fieldName;
						} else if (input.fieldName == "_owner") {
							input.interpretation = "undefined_literal";
							delete input.fieldName;
							input.localNames = [];
						}
					} else if (input.type == "StaticString") {
						if (input.fieldName == "_utf8CodeUnitCount") {
							input.fieldName = "length";
						} else if (input.fieldName == "_startPtrOrData") {
							input.interpretation = "contents";
							delete input.fieldName;
						}
					}
					break;
				case "struct_element_addr":
					if (input.type == "_StringCore" || input.type == "StaticString") {
						throw new Error("Cannot take the address of a " + input.type + " field!");
					}
					break;
				case "global_addr":
					if (input.globalName == "_Tvs19_emptyStringStorageVs6UInt32") {
						input.interpretation = "string_literal";
						input.value = "";
						delete input.globalName;
					}
			}
		});
	});
}

function eliminateStringCoreFlagsMask(instructions, downstreamInstructions) {
	instructions.forEach((instruction, i) => {
		if (instruction.operation == "assignment") {
			instruction.inputs.forEach(input => {
				if (input.interpretation == "struct_extract" && input.type == "_StringCore" && input.fieldName == "length") {
					var constantLocal;
					var allDownstream = instructions.slice(i + 1).concat(downstreamInstructions);
					allDownstream.forEach(otherInstruction => otherInstruction.inputs.forEach(input => {
						if (otherInstruction.operation == "assignment" && input.interpretation == "integer_literal" && input.value == 0x3FFFFFFF) {
							constantLocal = otherInstruction.destinationLocalName;
						}
						if (input.interpretation == "builtin" && input.builtinName == "and_Int32" && input.localNames[0] == instruction.destinationLocalName && input.localNames[1] == constantLocal && constantLocal !== undefined) {
							input.interpretation = "contents";
							input.localNames.splice(1);
							delete input.builtinName;
						}
					}));
				}
			});
		}
	});
}

function removeStringFoundationBridge(instructions, downstreamInstructions) {
	instructions.forEach((instruction, i) => {
		if (instruction.operation == "assignment") {
			var input = instruction.inputs[0];
			var newBuiltinName;
			if (input.interpretation == "function_ref" && (input.functionName == "_TFE10FoundationSS19_bridgeToObjectiveCfT_CSo8NSString" || input.functionName == "_TZFE10FoundationSS36_unconditionallyBridgeFromObjectiveCfGSqCSo8NSString_SS")) {
				const eliminateApplies = proposedInstruction => proposedInstruction.inputs.forEach(input => {
					if (input.interpretation == "apply" && input.localNames[0] == instruction.destinationLocalName) {
						input.interpretation = "contents";
						input.localNames.shift();
					}
				});
				var targetInstructions = [];
				for (var k = i + 1; k < instructions.length; k++) {
					eliminateApplies(instructions[k]);
				}
				downstreamInstructions.forEach(eliminateApplies);
			}
		}
	});
}

const isOptionalType = typeName => {
	typeName = Parser.removePointer(typeName);
	return typeName == "Optional" || typeName == "ImplicitlyUnwrappedOptional";
}

function unwrapOptionalEnums(instructions) {
	instructions.forEach(instruction => {
		instruction.inputs.forEach(input => {
			switch (input.interpretation) {
				case "enum":
					if (isOptionalType(input.type)) {
						if (input.caseName.toLowerCase() == "some") {
							input.interpretation = "contents";
						} else {
							input.interpretation = "null_literal";
						}
						delete input.type;
						delete input.caseName;
					}
					break;
				case "unchecked_enum_data":
					if (isOptionalType(input.type)) {
						input.interpretation = "contents";
						delete input.type;
					}
					break;
				case "select_enum":
				case "select_enum_addr":
					if (isOptionalType(input.type)) {
						var defaultLocal;
						var trueLocal;
						var falseLocal;
						input.cases.forEach((enumCase, index) => {
							var caseName = Parser.caseNameForEnum(enumCase.case);
							if (caseName) {
								if (caseName.toLowerCase() == "some") {
									trueLocal = index + 1;
								} else {
									falseLocal = index + 1;
								}
							} else {
								defaultLocal = index + 1;
							}
						});
						delete input.cases;
						delete input.type;
						input.interpretation = input.interpretation == "select_enum" ? "select_nonnull" : "select_nonnull_addr";
						if ((trueLocal | defaultLocal) > (falseLocal | defaultLocal)) {
							// Shuffle the input local names such that the "some" local is first
							input.localNames = [input.localNames[0], input.localNames[2], input.localNames[1]];
						}
					}
					break;
				case "init_enum_data_addr":
					if (isOptionalType(input.type)) {
						throw new Error("Cannot use init_enum_data_addr on an " + input.type + "!");
					}
					break;
				case "unchecked_take_enum_data_addr":
					if (isOptionalType(input.type)) {
						input.interpretation = "contents";
						//throw new Error("Cannot use unchecked_take_enum_data_addr on an " + input.type + "!");
					}
					break;
			}
		});
		switch (instruction.operation) {
			case "switch_enum":
			case "switch_enum_addr":
				// TODO: Apply proper path for switch_enum_addr
				if (isOptionalType(instruction.type)) {
					instruction.operation = "conditional_nonnull_branch";
					var defaultBlock;
					var trueBlock;
					var falseBlock;
					instruction.cases.forEach(enumCase => {
						var caseName = Parser.caseNameForEnum(enumCase.case);
						if (caseName) {
							if (caseName.toLowerCase() == "some") {
								trueBlock = enumCase.basicBlock;
							} else {
								falseBlock = enumCase.basicBlock;
							}
						} else {
							defaultBlock = enumCase.basicBlock;
						}
					});
					instruction.trueBlock = trueBlock || defaultBlock;
					instruction.falseBlock = falseBlock || defaultBlock;
					delete instruction.cases;
				}
				break;
			case "inject_enum_addr":
				if (isOptionalType(instruction.type)) {
					instruction.operation = "store";
					if (instruction.caseName.toLowerCase() == "some") {
						// Normally would delete, but since can be immediately followed by select_enum_addr, we need to put _some_ value in
						instruction.inputs.unshift({
							localNames: [],
							interpretation: "integer_literal",
							value: 0,
						});
					} else {
						instruction.inputs.unshift({
							localNames: [],
							interpretation: "null_literal",
						});
					}
				}
				break;
		}
	});
}

var countOfUsesOfLocal = (instruction, localName) => instruction.inputs.reduce((count, input) => count + input.localNames.filter(usedName => usedName == localName).length, 0);

var fuseableWithAssignment = instruction => {
	switch (instruction.operation) {
		case "assignment":
			return true;
		case "return":
			return true;
		case "throw":
			return true;
		case "store":
			return true;
		case "branch":
			return true;
		default:
			return false;
	}
};

var interpretationsWithoutSideEffects = ["contents", "integer_literal", "float_literal", "string_literal", "undefined_literal", "null_literal", "enum", "struct", "tuple", "alloc_stack", "alloc_box", "project_box", "struct_element_addr", "ref_element_addr", "global_addr", "select_enum", "select_value", "index_raw_pointer", "index_addr", "metatype", "class_method", "open_existential_ref", "function_ref"];
var instructionHasSideEffects = (instruction, builtins) => {
	if (instruction.operation != "assignment") {
		return true;
	}
	const input = instruction.inputs[0];
	if (interpretationsWithoutSideEffects.indexOf(input.interpretation) != -1) {
		return false;
	}
	if (instruction.interpretation == "builtin" && builtins[instruction.builtinName].pure) {
		return false;
	}
	return true;
};

function fuseAssignments(instructions, downstreamInstructions, builtins) {
	fuse_search:
	for (var i = 0; i < instructions.length - 1; ) {
		var instruction = instructions[i];
		if (instruction.operation == "assignment" && instruction.inputs.length == 1) {
			var replacementInput = instruction.inputs[0];
			proposed_search:
			for (var k = i + 1; k < instructions.length; k++) {
				var proposedInstruction = instructions[k];
				if (fuseableWithAssignment(proposedInstruction) && countOfUsesOfLocal(proposedInstruction, instruction.destinationLocalName) == 1) {
					for (var l = k + 1; l < instructions.length; l++) {
						if (countOfUsesOfLocal(instructions[l], instruction.destinationLocalName) != 0) {
							break proposed_search;
						}
					}
					if (downstreamInstructions.some(otherInstruction => countOfUsesOfLocal(otherInstruction, instruction.destinationLocalName) != 0)) {
						break proposed_search;
					}
					var success = false;
					proposedInstruction.inputs = proposedInstruction.inputs.map(input => {
						if (input.localNames[0] != instruction.destinationLocalName) {
							return input;
						}
						switch (input.interpretation) {
							case "apply":
								switch (replacementInput.interpretation) {
									case "contents":
										success = true;
										return replacementInput;
									case "class_method":
										input.localNames[0] = replacementInput.localNames[0];
										input.fieldName = replacementInput.entry;
										success = true;
										return input;
								}
								break;
							case "load":
								switch (replacementInput.interpretation) {
									case "contents":
										success = true;
										return replacementInput;
									case "ref_element_addr":
										replacementInput.interpretation = "struct_extract";
										success = true;
										return replacementInput;
								}
								break;
							case "contents":
								success = true;
								return replacementInput;
						}
						return input;
					})
					if (success) {
						instructions.splice(i, 1);
						continue fuse_search;
					}
				}
				if (instructionHasSideEffects(proposedInstruction, builtins)) {
					break;
				}
			}
		}
		i++;
	}
}

function fuseGlobalAllocations(instructions, downstreamInstructions) {
	var allocIndex = -1;
	while ((allocIndex = instructions.findIndex((instruction, i) => (i > allocIndex) && instruction.operation == "alloc_global")) != -1) {
		var allocInstruction = instructions[allocIndex];
		var assignmentInstruction = instructions.find((instruction, i) => {
			if (i > allocIndex && instruction.operation == "assignment") {
				var input = instruction.inputs[0];
				return input.interpretation == "global_addr" && input.globalName == allocInstruction.name;
			}
		});
		if (assignmentInstruction) {
			var destinationLocalName = assignmentInstruction.destinationLocalName;
			var storeInstruction = instructions.find((instruction, i) => {
				if (i > allocIndex && instruction.operation == "store") {
					var input = instruction.inputs[1];
					return input.localNames[0] == destinationLocalName && input.interpretation == "contents";
				}
			});
			if (storeInstruction) {
				storeInstruction.initializes = true;
			}
			instructions.splice(allocIndex, 1);
		}
	}
}

function fuseStackAllocations(instructions) {
	for (var i = 0; i < instructions.length; i++) {
		var instruction = instructions[i];
		if (instruction.operation == "assignment") {
			var input = instruction.inputs[0];
			if (input.interpretation == "alloc_stack") {
				for (var j = i + 1; j < instructions.length; j++) {
					var otherInstruction = instructions[j];
					if (countOfUsesOfLocal(otherInstruction, instruction.destinationLocalName) > 0) {
						if (otherInstruction.operation == "store") {
							otherInstruction.destinationLocalName = instruction.destinationLocalName;
							otherInstruction.operation = "assignment";
							otherInstruction.inputs[0].interpretation = "alloc_stack";
							otherInstruction.inputs[0].type = input.type;
							otherInstruction.inputs.splice(1, 1);
							instructions.splice(i, 1);
							i--;
						}
						break;
					}
				}
			}
		}
	}
}

function deadAssignmentElimination(instructions, downstreamInstructions, builtins) {
	for (var i = 0; i < instructions.length; ) {
		var instruction = instructions[i];
		if (instruction.operation == "assignment" && !instructionHasSideEffects(instruction, builtins)) {
			if (!instructions.slice(i+1).concat(downstreamInstructions).some(otherInstruction => countOfUsesOfLocal(otherInstruction, instruction.destinationLocalName) != 0)) {
				instructions.splice(i, 1);
				continue;
			}
		}
		i++;
	}
}
var blockReferencesForInstructionTypes = {
	"branch": ins => [ins.block],
	"conditional_branch": ins => [ins.trueBlock, ins.falseBlock],
	"conditional_nonnull_branch": ins => [ins.trueBlock, ins.falseBlock],
	"try_apply": ins => [ins.normalBlock, ins.errorBlock],
	"switch_enum": ins => ins.cases.map(c => c.basicBlock),
	"switch_enum_addr": ins => ins.cases.map(c => c.basicBlock),
	"checked_cast_branch": ins => [ins.trueBlock, ins.falseBlock],
	"checked_cast_addr_br": ins => [ins.trueBlock, ins.falseBlock],
};

function newLocalName(declaration, basicBlock) {
	var i = 0;
	while (declaration.localNames.indexOf(i) != -1) {
		i++;
	}
	declaration.localNames.push(i);
	basicBlock.localNames.push(i);
	return i;
}

function serializedClone(object) {
	return JSON.parse(JSON.stringify(object));
}

function blockReferencesForInstruction(instruction) {
	var blockReferences = blockReferencesForInstructionTypes[instruction.operation];
	return blockReferences ? blockReferences(instruction) : [];
}

const blockReferencesForInstructions = instructions => instructions.length > 0 ? blockReferencesForInstruction(instructions[instructions.length - 1]) : [];

function deepBlockReferencesForInstructions(instructions)
{
	return blockReferencesForInstructions(instructions).reduce((result, descriptor) => {
		if (descriptor.inline) {
			return result.concat(deepBlockReferencesForInstructions(descriptor.inline.instructions));
		}
		if (descriptor.reference) {
			return result.concat([{
				instructionList: instructions,
				toBlockName: descriptor.reference,
				descriptor: descriptor,
			}]);
		}
		return result;
	}, []);
}

function recursiveReferencesFromBlock(basicBlock, basicBlocks)
{
	var result = deepBlockReferencesForInstructions(basicBlock.instructions);
	for (var i = 0; i < result.length; i++) {
		deepBlockReferencesForInstructions(findBasicBlock(basicBlocks, result[i].descriptor).instructions).forEach(newRef => {
			if (!result.some(existingRef => existingRef.toBlockName == newRef.toBlockName)) {
				result.push(newRef);
			}
		});
	}
	return result;
}

function blocksThatReferenceBlock(basicBlock, basicBlocks)
{
	return basicBlocks.filter(otherBlock => recursiveReferencesFromBlock(otherBlock, basicBlocks).some(ref => ref.toBlockName == basicBlock.name));
}

function reorderedBlocks(basicBlocks) {
	var result = [];
	result.push(basicBlocks[0]);
	for (var i = 0; i < result.length; i++) {
		blockReferencesForInstructions(result[i].instructions).forEach(descriptor => {
			if (!result.some(block => block.name == descriptor.reference)) {
				result.push(findBasicBlock(basicBlocks, descriptor));
			}
		});
	}
	return result;
}

function dropSimpleRethrows(blocks, instructions) {
	if (instructions.length > 0) {
		var instruction = instructions[instructions.length - 1];
		if (instruction.operation == "try_apply") {
			var errorBlock = findBasicBlock(blocks, instruction.errorBlock);
			if (errorBlock.instructions.length == 1) {
				var otherInstruction = errorBlock.instructions[0];
				if (otherInstruction.operation == "throw" && otherInstruction.inputs[0].interpretation == "contents" && errorBlock.arguments[0].localName == otherInstruction.inputs[0].localNames[0]) {
					instruction.operation = "assignment";
					instruction.inputs = [{
						interpretation: "apply",
						convention: instruction.convention,
						localNames: instruction.inputs.map(input => input.localNames[0]),
					}];
					var normalBlock = findBasicBlock(blocks, instruction.normalBlock);
					instruction.destinationLocalName = normalBlock.arguments[0].localName;
					delete instruction.normalBlock;
					delete instruction.errorBlock;
					serializedClone(normalBlock).instructions.forEach(instruction => instructions.push(instruction));
				}
			}
		}
	}
}

function inlineBlocks(basicBlocks) {
	var work = basicBlocks.map((block, index) => {
		return {
			instructions: block.instructions,
			blockIndex: index,
		}
	});
	for (var i = 0; i < work.length; i++) {
		deepBlockReferencesForInstructions(work[i].instructions).forEach(reference => {
			var sourceBlockName = reference.toBlockName;
			var sourceBlock = findBasicBlock(basicBlocks, { reference: sourceBlockName });
			var sourceBlockIndex = basicBlocks.indexOf(sourceBlock);
			if (deepBlockReferencesForInstructions(sourceBlock.instructions, basicBlocks).length != 0) {
				if (sourceBlockIndex <= work[i].blockIndex) {
					return;
				}
				if (i != work[i].blockIndex) {
					var hasBackwardsReference = blocksThatReferenceBlock(sourceBlock, basicBlocks).some(otherBlock => basicBlocks.indexOf(otherBlock) < sourceBlockIndex);
					if (hasBackwardsReference) {
						return;
					}
				}
			}
			sourceBlock = serializedClone(sourceBlock);
			var instruction = reference.instructionList[reference.instructionList.length-1];
			var instructions;
			if (instruction.operation == "branch") {
				instructions = reference.instructionList;
				instructions.splice(instructions.length - 1, 1)
				instruction.inputs.forEach((input, index) => {
					instructions.push({
						operation: "assignment",
						destinationLocalName: sourceBlock.arguments[index].localName,
						inputs: [ input ],
					})
				});
				sourceBlock.instructions.forEach(instruction => instructions.push(instruction));
			} else {
				reference.descriptor.inline = sourceBlock;
				delete reference.descriptor.reference;
				instructions = reference.instructionList;
			}
			work.push({
				instructions: instructions,
				blockIndex: work[i].blockIndex,
			});
		});
	}
}

function pruneDeadBlocks(basicBlocks) {
	// Always leave the first block alone, it's the entry point
	for (var i = 1; i < basicBlocks.length; i++) {
		while (i < basicBlocks.length && blocksThatReferenceBlock(basicBlocks[i], basicBlocks).length == 0) {
			basicBlocks.splice(i, 1);
		}
	}
	basicBlocks.forEach((block, i) => {
		block.hasBackReferences = blocksThatReferenceBlock(block, basicBlocks).some(otherBlock => basicBlocks.indexOf(otherBlock) >= i);
	});
}

function allInstructionLists(basicBlocks) {
	var result = [];
	basicBlocks = basicBlocks.slice();
	for (var i = 0; i < basicBlocks.length; i++) {
		blockReferencesForInstructions(basicBlocks[i].instructions).forEach(descriptor => {
			if (descriptor.inline) {
				basicBlocks.push(descriptor.inline);
			}
		});
	}
	return basicBlocks.map((block, i) => {
		var blockReferences = [{ inline: block }];
		var downstreamInstructions = [];
		for (var j = 0; j < blockReferences.length; j++) {
			var discoveredBlock = findBasicBlock(basicBlocks, blockReferences[j]);
			if (block !== discoveredBlock) {
				downstreamInstructions = downstreamInstructions.concat(discoveredBlock.instructions);
			}
			blockReferencesForInstructions(discoveredBlock.instructions).forEach(descriptor => {
				if (blockReferences.indexOf(descriptor) == -1) {
					blockReferences.push(descriptor)
				}
			});
		}
		return {
			instructions: basicBlocks[i].instructions,
			downstreamInstructions: downstreamInstructions
		};
	});
}

function optimize(declaration, parser) {
	const types = parser.types;
	const builtins = parser.builtins;
	if (declaration.type == "function") {
		if (declaration.basicBlocks.length == 0) {
			return;
		}
		declaration.basicBlocks = reorderedBlocks(declaration.basicBlocks);
		inlineBlocks(declaration.basicBlocks);
		allInstructionLists(declaration.basicBlocks).forEach(item => {
			var instructions = item.instructions;
			var downstreamInstructions = item.downstreamInstructions;
			dropSimpleRethrows(declaration.basicBlocks, instructions);
			unwrapSimpleStructInstructions(instructions, types);
			unwrapStrings(instructions);
			unwrapPassthroughBuiltins(instructions, builtins);
			reassignOverflowBuiltins(instructions, downstreamInstructions, builtins);
			unwrapOptionalEnums(instructions);
			removeStringFoundationBridge(instructions, downstreamInstructions);
			fuseGlobalAllocations(instructions);
			fuseStackAllocations(instructions);
			fuseAssignments(instructions, downstreamInstructions, builtins);
			eliminateStringCoreFlagsMask(instructions, downstreamInstructions);
		});
		inlineBlocks(declaration.basicBlocks);
		allInstructionLists(declaration.basicBlocks).forEach(item => {
			var instructions = item.instructions;
			var downstreamInstructions = item.downstreamInstructions;
			fuseAssignments(instructions, downstreamInstructions, builtins);
			deadAssignmentElimination(instructions, downstreamInstructions, builtins);
		});
		pruneDeadBlocks(declaration.basicBlocks);
	}
	if (declaration.type == "vtable") {
		for (var key in declaration.entries) {
			if (/\!deallocator$/.test(key)) {
				delete declaration.entries[key];
			}
		}
	}
}

function optimizeTypes(types) {
	for (var key in types) {
		if (types.hasOwnProperty(key)) {
			var type = types[key];
			switch (type.personality) {
				case "struct":
					if (type.fields.length == 1) {
						type.fields = [];
						type.personality = "class";
					}
					break;
			}
		}
	}
	var _StringCore = types["_StringCore"];
	if (_StringCore) {
		_StringCore.fields = [];
		_StringCore.personality = "class";
	}
	var Optional = types["Optional"];
	if (Optional) {
		Optional.fields = [];
		Optional.personality = "class";
	}
	var ImplicitlyUnwrappedOptional = types["ImplicitlyUnwrappedOptional"];
	if (ImplicitlyUnwrappedOptional) {
		ImplicitlyUnwrappedOptional.fields = [];
		ImplicitlyUnwrappedOptional.personality = "class";
	}
}

module.exports = {
	"optimize": optimize,
	"optimizeTypes": optimizeTypes,
}