import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { runTests } from "@vscode/test-electron";

function resolveLocalVsCodeExecutable(): string | undefined {
	const fromEnv = process.env.VSCODE_EXECUTABLE_PATH;
	if (fromEnv && fs.existsSync(fromEnv)) {
		return fromEnv;
	}

	const candidates = process.platform === 'darwin'
		? [
			'/Applications/Visual Studio Code.app/Contents/MacOS/Code',
			'/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
			'/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Code',
			'/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron',
		]
		: process.platform === 'win32'
			? [
				path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
				path.join(process.env.ProgramFiles || '', 'Microsoft VS Code', 'Code.exe'),
			]
			: [
				'/usr/bin/code',
				'/snap/bin/code',
				'/usr/share/code/code',
			];

	return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');
		const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'explorer-bookmark-test-workspace-'));
		const useLocalVsCode =
			process.argv.includes('--use-local-vscode') ||
			process.env.USE_LOCAL_VSCODE === '1' ||
			Boolean(process.env.VSCODE_EXECUTABLE_PATH);
		const vscodeExecutablePath = useLocalVsCode
			? resolveLocalVsCodeExecutable()
			: undefined;

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [workspacePath, '--disable-extensions'],
			vscodeExecutablePath,
		});
	} catch (err) {
		console.error('Failed to run tests');
		console.error(err);
		process.exit(1);
	}
}

main();
