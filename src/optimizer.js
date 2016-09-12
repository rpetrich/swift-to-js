var stdlib = require("./stdlib.js");
var types = stdlib.types;

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

function unwrapSimpleStructInstructions(instructions) {
	instructions.forEach(instruction => {
		instruction.inputs.forEach(input => {
			switch (input.interpretation) {
				case "struct":
					var structType = types[input.type];
					if (structType && structType.length == 1) {
						input.interpretation = "contents";
					}
					break;
				case "struct_extract":
					var structType = types[input.type];
					if (structType && structType.length == 1) {
						input.interpretation = "contents";
						delete input.fieldName;
					}
					break;
				case "struct_element_addr":
					var structType = types[input.type];
					if (structType && structType.length == 1) {
						throw "Field has been optimized away: _value";
					}
					break;
			}
		});
	})
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

var instructionsWithoutSideEffects = ["assignment", "builtin"];
var instructionHasSideEffects = instruction => instructionsWithoutSideEffects.indexOf(instruction.operation) == -1;

function fuseAssignments(instructions) {
	fuse_search:
	for (var i = 0; i < instructions.length - 1; ) {
		var instruction = instructions[i];
		if (instruction.operation == "assignment" && instruction.inputs.length == 1) {
			var replacementInput = instruction.inputs[0];
			var loadInterpretation = replacementInput.interpretation;
			switch (loadInterpretation) {
				case "ref_element_addr":
					loadInterpretation = "struct_extract";
					break;
			}
			proposed_search:
			for (var k = i + 1; k < instructions.length; k++) {
				var proposedInstruction = instructions[k];
				if (fuseableWithAssignment(proposedInstruction) && countOfUsesOfLocal(proposedInstruction, instruction.destinationLocalName) == 1) {
					for (var l = k + 1; l < instructions.length; l++) {
						if (countOfUsesOfLocal(instructions[l], instruction.destinationLocalName) != 0) {
							break proposed_search;
						}
					}
					var success = false;
					proposedInstruction.inputs = proposedInstruction.inputs.map(input => {
						if (input.localNames[0] == instruction.destinationLocalName) {
							switch (input.interpretation) {
								case "load":
									replacementInput.interpretation = loadInterpretation;
								case "function_ref":
								case "contents":
									success = true;
									return replacementInput;
							}
						}
						return input;
					})
					if (success) {
						instructions.splice(i, 1);
						continue fuse_search;
					}
				}
				if (instructionHasSideEffects(proposedInstruction)) {
					break;
				}
			}
		}
		i++;
	}
}

var blockReferencesForInstructionTypes = {
	"branch": ins => [ins.block],
	"conditional_branch": ins => [ins.trueBlock, ins.falseBlock],
	"try_apply": ins => [ins.normalBlock, ins.errorBlock],
	"switch_enum": ins => ins.cases.map(c => c.basicBlock),
	"checked_cast_branch": ins => [ins.trueBlock, ins.falseBlock],
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

function blockReferencesForInstructions(instructions) {
	var instruction = instructions[instructions.length - 1];
	var blockReferences = blockReferencesForInstructionTypes[instruction.operation];
	return blockReferences ? blockReferences(instruction) : [];
}

function deepBlockReferencesForInstructions(instructions)
{
	var result = [];
	blockReferencesForInstructions(instructions).forEach(descriptor => {
		if (descriptor.inline) {
			result = result.concat(result, deepBlockReferencesForInstructions(descriptor.inline.instructions));
		} else if (descriptor.reference) {
			result.push({
				instructionList: instructions,
				toBlockName: descriptor.reference,
				descriptor: descriptor,
			});
		}
	})
	return result;
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
				var hasBackwardsReference = blocksThatReferenceBlock(sourceBlock, basicBlocks).some(otherBlock => basicBlocks.indexOf(otherBlock) > sourceBlockIndex);
				if (hasBackwardsReference) {
					return;
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
	var result = basicBlocks.map(basicBlock => basicBlock.instructions);
	for (var i = 0; i < result.length; i++) {
		blockReferencesForInstructions(result[i]).forEach(descriptor => {
			if (descriptor.inline) {
				result.push(descriptor.inline.instructions);
			}
		});
	}
	return result;
}

function optimize(declaration) {
	if (declaration.type == "function") {
		inlineBlocks(declaration.basicBlocks);
		allInstructionLists(declaration.basicBlocks).forEach(instructions => {
			unwrapSimpleStructInstructions(instructions);
			fuseAssignments(instructions);
		});
		pruneDeadBlocks(declaration.basicBlocks);
	}
}

module.exports = {
	"optimize": optimize
}