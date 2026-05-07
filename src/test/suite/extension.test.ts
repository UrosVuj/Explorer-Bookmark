import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExplorerBookmarkApi } from '../../extension';

const fsPromises = fs.promises;

suite('Extension Test Suite', () => {
	let api: ExplorerBookmarkApi;
	let tempRoot: string;
	let tempDirectoryUri: vscode.Uri;

	suiteSetup(async () => {
		const extension = vscode.extensions.getExtension<ExplorerBookmarkApi>(
			'UrosVujosevic.explorer-manager'
		);

		assert.ok(extension, 'The extension should be discoverable by VS Code.');
		api = await extension.activate();

		tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'explorer-bookmark-fixture-'));
		const nestedDirectoryPath = path.join(tempRoot, 'bookmarked-folder');
		const nestedFilePath = path.join(nestedDirectoryPath, 'child.txt');

		await fsPromises.mkdir(nestedDirectoryPath, { recursive: true });
		await fsPromises.writeFile(nestedFilePath, 'bookmark smoke test');

		tempDirectoryUri = vscode.Uri.file(nestedDirectoryPath);
	});

	setup(async () => {
		await vscode.commands.executeCommand('directoryprovider/removeallitems');
	});

	suiteTeardown(async () => {
		await vscode.commands.executeCommand('directoryprovider/removeallitems');
		await fsPromises.rm(tempRoot, { recursive: true, force: true });
	});

	test('adds a bookmark from explorer-style command arguments', async () => {
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			{ resourceUri: tempDirectoryUri }
		);

		const rootItems = await api.directoryProvider.getChildren();

		assert.strictEqual(rootItems.length, 1);
		assert.strictEqual(rootItems[0].resourceUri.fsPath, tempDirectoryUri.fsPath);
		assert.strictEqual(rootItems[0].label, 'bookmarked-folder');
	});

	test('lists the children of a bookmarked folder', async () => {
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			{ path: tempDirectoryUri.fsPath }
		);

		const [bookmarkedFolder] = await api.directoryProvider.getChildren();
		const childItems = await api.directoryProvider.getChildren(bookmarkedFolder);

		assert.strictEqual(childItems.length, 1);
		assert.strictEqual(childItems[0].label, 'child.txt');
		assert.strictEqual(childItems[0].resourceUri.fsPath, path.join(tempDirectoryUri.fsPath, 'child.txt'));
	});

	test('removes a bookmark when passed a plain path payload', async () => {
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			tempDirectoryUri
		);

		await vscode.commands.executeCommand(
			'directoryprovider/removeitem',
			{ path: tempDirectoryUri.fsPath }
		);

		const rootItems = await api.directoryProvider.getChildren();

		assert.strictEqual(rootItems.length, 0);
	});

	test('removes a stale bookmark even if the file no longer exists', async () => {
		const deletedFilePath = path.join(tempRoot, 'deleted.txt');
		const deletedFileUri = vscode.Uri.file(deletedFilePath);

		await fsPromises.writeFile(deletedFilePath, 'temporary file');
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			deletedFileUri
		);

		await fsPromises.rm(deletedFilePath, { force: true });
		await vscode.commands.executeCommand(
			'directoryprovider/removeitem',
			{ path: deletedFileUri.fsPath }
		);

		const rootItems = await api.directoryProvider.getChildren();

		assert.strictEqual(rootItems.length, 0);
	});
});
