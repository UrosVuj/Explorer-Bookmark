import * as fs from "fs/promises";
import * as path from "path";
import Mocha = require("mocha");

async function findTestFiles(root: string): Promise<string[]> {
	const entries = await fs.readdir(root, { withFileTypes: true });
	const nestedPaths = await Promise.all(entries.map(async (entry) => {
		const resolvedPath = path.resolve(root, entry.name);

		if (entry.isDirectory()) {
			return findTestFiles(resolvedPath);
		}

		return entry.name.endsWith(".test.js") ? [resolvedPath] : [];
	}));

	return nestedPaths.flat();
}

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: "tdd",
		color: true
	});

	const testsRoot = path.resolve(__dirname, "..");

	return new Promise(async (c, e) => {
		try {
			const files = await findTestFiles(testsRoot);

			files.forEach((file) => mocha.addFile(file));

			mocha.run((failures: number) => {
				if (failures > 0) {
					e(new Error(`${failures} tests failed.`));
				} else {
					c();
				}
			});
		} catch (err) {
			console.error(err);
			e(err);
		}
	});
}
