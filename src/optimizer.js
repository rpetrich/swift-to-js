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

function fuseStackAllocationsWithStores(basicBlock) {
	for (var i = 1; i < basicBlock.instructions.length; i++) {
		var instruction = basicBlock.instructions[i];
		if (instruction.type == "store") {
			for (var j = 0; j < i; j++) {
				var previousInstruction = basicBlock.instructions[j];
				if ((previousInstruction.type == "assignment") &&
					(previousInstruction.instruction == "alloc_stack") &&
					(instruction.destinationLocalName == previousInstruction.destinationLocalName)
				) {
					basicBlock.instructions[i] = j;
					previousInstruction.sourceLocalName = instruction.sourceLocalName;
					basicBlock.instructions.splice(i, 1);
				} else if (previousInstruction.readLocals.indexOf(previousInstruction.destinationLocalName) != -1) {
					break;
				}
			}
		}
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
		var blockReferences = blockReferencesForInstructions[lastInstruction.type];
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
		var blockReferences = blockReferencesForInstructions[lastInstruction.type];
		if (blockReferences) {
			blockReferences(lastInstruction).forEach(descriptor => {
				var destBlock = findBasicBlock(basicBlocks, descriptor);
				if (basicBlocks.indexOf(destBlock) > i) {
					// Inline the block
					var index = destBlock.referencesFrom.indexOf(basicBlock.name);
					if (index != -1) {
						destBlock.referencesFrom.splice(index, 1);
					}
					descriptor.inline = destBlock;
					delete descriptor.reference;
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
		declaration.basicBlocks.forEach(fuseStackAllocationsWithStores);
		analyzeBlockReferences(declaration.basicBlocks);
		inlineBlocks(declaration.basicBlocks);
		pruneDeadBlocks(declaration.basicBlocks);
	}
}

module.exports = {
	"optimize": optimize
}