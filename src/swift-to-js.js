var program = require("commander");
var readline = require("readline");
var fs = require("fs");

var Parser = require("./parser.js");
var parser = new Parser();

var CodeGen = require("./codegen.js");
var Optimizer = require("./optimizer.js");

program
.option("--ast [path]", "Input AST file")
.option("--sil [path]", "Input SIL file")
.option("--output [path]", "Output JavaScript file")
.option("--source-map [path]", "Output source map")
.parse(process.argv);

var parseAll = (paths, completion) => {
	paths = paths.slice();
	var next = () => {
		if (paths.length) {
			var path = paths.shift();
			parser.beginPath(path);
			var stream = readline.createInterface({
				input: fs.createReadStream(path, { flags: "r" }),
				terminal: false,
			});
			stream.on("line", line => parser.addLine(line));
			stream.on("close", next);
		} else {
			completion();
		}
	}
	next();
}

parseAll([program.ast, program.sil], () => {
	var codegen = new CodeGen(parser);
	parser.declarations.forEach(declaration => {
		Optimizer.optimize(declaration, parser);
	});
	Optimizer.optimizeTypes(parser.types);
	parser.declarations.forEach(declaration => {
		codegen.consume(declaration);
	});
	codegen.end();
	var out = fs.openSync(program.output, "w");
	fs.write(out, codegen.output);
	if (program.sourceMap) {
		var sourceMap = fs.openSync(program.sourceMap, "w");
		fs.write(sourceMap, codegen.sourceMap);
	}
	//console.log(JSON.stringify(parser.declarations, null, 4));
});
