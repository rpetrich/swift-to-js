import { compileASTSource, readAsString } from "./swift-to-js";

import { readdirSync, readFile as readFile_, writeFile as writeFile_ } from "fs";
import { spawn } from "child_process";
import { promisify } from "util";

const writeOutput = false;

const readFile = promisify(readFile_);
const writeFile = promisify(writeFile_);

const swiftFilePattern = /\.swift$/;

for (const category of readdirSync("./tests/")) {
	describe(category, () => {
		for (const file of readdirSync(`./tests/${category}/`)) {
			if (swiftFilePattern.test(file)) {
				test(file, async () => {
					const swiftPath = `./tests/${category}/${file}`;
					const jsPath = `./tests/${category}/${file.replace(swiftFilePattern, ".js")}`;
					const process = spawn("swiftc", ["-dump-ast", swiftPath]);
					readAsString(process.stdout);
					// console.log(await readAsString(process.stderr));
					if (writeOutput) {
						const result = compileASTSource(await readAsString(process.stderr));
						await writeFile(jsPath, result);
					} else {
						const expected = readFile(jsPath);
						const result = compileASTSource(await readAsString(process.stderr));
						expect(result).toEqual((await expected).toString("utf-8"));
					}
				});
			}
		}
	});
}
