import { compile } from "./swift-to-js";

import { readdirSync, readFile as readFile_, statSync, unlink as unlink_, writeFile as writeFile_ } from "fs";
import { basename } from "path";
import { promisify } from "util";

const writeOutput = false;

const readFile = promisify(readFile_);
const writeFile = promisify(writeFile_);
const unlink = promisify(unlink_);

const swiftFilePattern = /\.swift$/;

for (const category of readdirSync("./tests/")) {
	if (statSync(`./tests/${category}`).isDirectory()) {
		describe(category, () => {
			for (const file of readdirSync(`./tests/${category}`)) {
				if (swiftFilePattern.test(file)) {
					test(file.replace(swiftFilePattern, ""), async () => {
						const swiftPath = `./tests/${category}/${file}`;
						const jsPath = `./tests/${category}/${file.replace(swiftFilePattern, ".mjs")}`;
						function addSourceMapping(code: string) {
							return `${code}\n//# sourceMappingURL=${basename(jsPath)}.map`;
						}
						const result = compile(swiftPath);
						try {
							if (writeOutput) {
								try {
									const { code, ast, map } = await result;
									await Promise.all([
										writeFile(jsPath, addSourceMapping(code)),
										writeFile(`./tests/${category}/${file.replace(swiftFilePattern, ".js")}`, code),
										writeFile(swiftPath + ".ast", ast),
										writeFile(jsPath + ".map", JSON.stringify(map)),
									]);
									expect((map as { mappings: string }).mappings).not.toEqual("");
								} catch (e) {
									if (e && e.ast) {
										await writeFile(swiftPath + ".ast", e.ast);
									}
									try {
										statSync(jsPath);
										await unlink(jsPath);
									} catch (e) {
										// Ignore
									}
									throw e;
								}
							} else {
								const expected = readFile(jsPath);
								const { code, map } = await result;
								expect((map as { mappings: string }).mappings).not.toEqual("");
								expect(addSourceMapping(code)).toEqual((await expected).toString("utf-8"));
							}
						} finally {
							await result;
						}
					});
				}
			}
		});
	}
}
