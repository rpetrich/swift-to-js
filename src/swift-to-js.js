var readline = require("readline");
var fs = require("fs");

var Parser = require("./parser.js");
var parser = new Parser();

var CodeGen = require("./codegen.js");
var Optimizer = require("./optimizer.js");

var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false
});

rl.on("line", function(line){
	parser.addLine(line);
});

rl.on("close", function() {
	var codegen = new CodeGen(parser);
	parser.declarations.forEach(declaration => {
		Optimizer.optimize(declaration, parser.types);
	});
	Optimizer.optimizeTypes(parser.types);
	parser.declarations.forEach(declaration => {
		codegen.consume(declaration);
	});
	codegen.end();
	var out = fs.openSync(process.argv[2], "w");
	codegen.buffer.lines.forEach(line => fs.write(out, line + "\n"));
	//console.log(JSON.stringify(parser.declarations, null, 4));
});
