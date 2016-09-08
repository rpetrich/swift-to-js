var stdlib = require("./stdlib.js");
var types = stdlib.types;

function findBasicBlock(blocks, descriptor) {
	if (descriptor.reference) {
		for (var i = 0; i < blocks.length; i++) {
			if (blocks[i].name == descriptor.reference) {
				return blocks[i];
			}
		}
		throw "Unable to find basic block: " + descriptor.reference;
	}
	if (descriptor.inline) {
		return descriptor.inline;
	}
	throw "Neither a reference nor an inline block!";
}

function unwrapSimpleStructInstructions(basicBlock) {
	basicBlock.instructions.forEach(i => {
		switch (i.instruction) {
			case "struct":
				var structType = types[i.type];
				if (structType && (i.inputs.length == 1) && structType[0] == "_value") {
					i.instruction = "register";
					delete i.arguments;
				}
				break;
			case "struct_extract":
				if (i.fieldName == "_value") {
					i.instruction = "register";
					delete i.fieldName;
				}
				break;
			case "struct_element_addr":
				if (i.fieldName == "_value") {
					throw "Field has been optimized away: _value";
				}
				break;
		}
	})
}

function hasLocalAsInput(instruction, localName) {
	return instruction.inputs.some(input => input.localName == localName);
}

function fuseStackAllocationsWithStores(basicBlock) {
	for (var i = 1; i < basicBlock.instructions.length; i++) {
		var instruction = basicBlock.instructions[i];
		if (instruction.operation == "store") {
			var storeDestination = instruction.inputs[1].localName;
			for (var j = 0; j < i; j++) {
				var previousInstruction = basicBlock.instructions[j];
				if ((previousInstruction.operation == "assignment") &&
					(previousInstruction.instruction == "alloc_stack") &&
					(previousInstruction.destinationLocalName == storeDestination)
				) {
					previousInstruction.inputs = [instruction.inputs[0]];
					basicBlock.instructions.splice(i, 1);
				} else if (hasLocalAsInput(previousInstruction, storeDestination)) {
					break;
				}
			}
		}
	}
}

var fuseableWithAssignment = instruction => {
	switch (instruction.operation) {
		case "assignment":
			return instruction.instruction == "register";
		case "return":
		case "throw":
		case "store":
			return true;
		case "branch":
			return instruction.inputs.length == 1;
		default:
			return false;
	}
};

var instructionsWithoutSideEffects = ["integer_literal", "string_literal", "enum", "struct", "tuple", "struct_extract", "tuple_extract", "function_ref", "alloc_stack", "alloc_box", "project_box", "struct_element_addr", "global_addr", "load", "unchecked_enum_data", "unchecked_addr_cast", "unchecked_ref_cast", "pointer_to_address", "address_to_pointer", "ref_to_raw_pointer", "raw_pointer_to_ref", "index_raw_pointer", "index_addr"];
var instructionHasSideEffects = instruction => instructionsWithoutSideEffects.indexOf(instruction.operation) == -1;

function fuseAssignments(basicBlock) {
	fuse_search:
	for (var i = 0; i < basicBlock.instructions.length - 1; ) {
		var instruction = basicBlock.instructions[i];
		if (instruction.operation == "assignment") {
			proposed_search:
			for (var k = i + 1; k < basicBlock.instructions.length; k++) {
				var proposedInstruction = basicBlock.instructions[k];
				if (fuseableWithAssignment(proposedInstruction) && proposedInstruction.inputs.length == 1 && proposedInstruction.inputs[0].localName == instruction.destinationLocalName) {
					for (var l = k + 1; l < basicBlock.instructions.length; l++) {
						if (hasLocalAsInput(basicBlock.instructions[l], instruction.destinationLocalName)) {
							break proposed_search;
						}
					}
					for (var key in instruction) {
						if (key != "operation" && key != "destinationLocalName") {
							proposedInstruction[key] = instruction[key];
						}
					}
					basicBlock.instructions.splice(i, 1);
					continue fuse_search;
				}
				if (instructionHasSideEffects(proposedInstruction)) {
					break;
				}
			}
		}
		i++;
	}
}

var blockReferencesForInstructions = {
	"branch": ins => [ins.block],
	"conditional_branch": ins => [ins.trueBlock, ins.falseBlock],
	"try_apply": ins => [ins.normalBlock, ins.errorBlock],
	"switch_enum": ins => ins.cases.map(c => c.basicBlock),
};

function analyzeBlockReferences(basicBlocks) {
	basicBlocks.forEach(basicBlock => {
		basicBlock.referencesFrom = [];
		basicBlock.referencesTo = [];
	});
	basicBlocks.forEach(basicBlock => {
		var lastInstruction = basicBlock.instructions[basicBlock.instructions.length-1];
		var blockReferences = blockReferencesForInstructions[lastInstruction.operation];
		if (blockReferences) {
			blockReferences(lastInstruction).forEach(descriptor => {
				basicBlock.referencesTo.push(descriptor.reference);
				findBasicBlock(basicBlocks, descriptor).referencesFrom.push(basicBlock.name);
			})
		}
	});
}

function inlineBlocks(basicBlocks) {
	for (var i = 0; i < basicBlocks.length; i++) {
		var basicBlock = basicBlocks[i];
		var lastInstruction = basicBlock.instructions[basicBlock.instructions.length-1];
		var blockReferences = blockReferencesForInstructions[lastInstruction.operation];
		if (blockReferences) {
			blockReferences(lastInstruction).forEach(descriptor => {
				var destBlock = findBasicBlock(basicBlocks, descriptor);
				var destBlockIndex = basicBlocks.indexOf(destBlock);
				if (destBlockIndex > i) {
					var hasBackwardsReference = destBlock.referencesFrom.some(ref => {
						var fromBlock = findBasicBlock(basicBlocks, { reference: ref });
						return basicBlocks.indexOf(fromBlock) > destBlockIndex;
					});
					if (!hasBackwardsReference) {
						// Inline the block
						var index = destBlock.referencesFrom.indexOf(basicBlock.name);
						if (index != -1) {
							destBlock.referencesFrom.splice(index, 1);
						}
						descriptor.inline = destBlock;
						delete descriptor.reference;
					}
				}
			});
		}
	}
}

function pruneDeadBlocks(basicBlocks) {
	// Always leave the first block alone, it's the entry point
	for (var i = 1; i < basicBlocks.length; i++) {
		while (basicBlocks[i] && basicBlocks[i].referencesFrom.length == 0) {
			basicBlocks.splice(i, 1);
		}
	}	
}

function optimize(declaration) {
	if (declaration.type == "function") {
		analyzeBlockReferences(declaration.basicBlocks);
		declaration.basicBlocks.forEach(unwrapSimpleStructInstructions);
		declaration.basicBlocks.forEach(fuseStackAllocationsWithStores);
		declaration.basicBlocks.forEach(fuseAssignments);
		inlineBlocks(declaration.basicBlocks);
		pruneDeadBlocks(declaration.basicBlocks);
	}
}

module.exports = {
	"optimize": optimize
}