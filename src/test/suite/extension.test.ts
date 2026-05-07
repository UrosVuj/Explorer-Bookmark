import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExplorerBookmarkApi } from '../../extension';

const fsPromises = fs.promises;

suite('Extension Test Suite', () => {
	let api: ExplorerBookmarkApi;
	let workspaceRoot: string;
	let tempRoot: string;
	let tempDirectoryUri: vscode.Uri;
	let tempFileUri: vscode.Uri;

	suiteSetup(async () => {
		const extension = vscode.extensions.getExtension<ExplorerBookmarkApi>(
			'UrosVujosevic.explorer-manager'
		);

		assert.ok(extension, 'The extension should be discoverable by VS Code.');
		api = await extension.activate();

		workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
		assert.ok(workspaceRoot, 'The integration workspace should be available.');

		tempRoot = await fsPromises.mkdtemp(path.join(workspaceRoot, 'explorer-bookmark-fixture-'));
		const nestedDirectoryPath = path.join(tempRoot, 'bookmarked-folder');
		const nestedFilePath = path.join(nestedDirectoryPath, 'child.txt');

		await fsPromises.mkdir(nestedDirectoryPath, { recursive: true });
		await fsPromises.writeFile(nestedFilePath, 'bookmark smoke test');

		tempDirectoryUri = vscode.Uri.file(nestedDirectoryPath);
		tempFileUri = vscode.Uri.file(nestedFilePath);
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

	test('opens a bookmarked file', async () => {
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			tempFileUri
		);

		const [bookmarkedFile] = await api.directoryProvider.getChildren();

		await vscode.commands.executeCommand(
			'directoryprovider/openitem',
			bookmarkedFile
		);

		assert.ok(vscode.window.activeTextEditor);
		assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, tempFileUri.fsPath);
	});

	test('copies the absolute path of a bookmark', async () => {
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			tempFileUri
		);

		await vscode.commands.executeCommand(
			'directoryprovider/copypath',
			tempFileUri
		);

		assert.strictEqual(await vscode.env.clipboard.readText(), tempFileUri.fsPath);
	});

	test('copies the relative path of a bookmark', async () => {
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			tempFileUri
		);

		await vscode.commands.executeCommand(
			'directoryprovider/copyrelativepath',
			tempFileUri
		);

		assert.strictEqual(
			await vscode.env.clipboard.readText(),
			path.relative(workspaceRoot, tempFileUri.fsPath).split(path.sep).join('/')
		);
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

	test('removes all bookmarks', async () => {
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			tempDirectoryUri
		);
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			tempFileUri
		);

		await vscode.commands.executeCommand('directoryprovider/removeallitems');

		const rootItems = await api.directoryProvider.getChildren();

		assert.strictEqual(rootItems.length, 0);
	});

	test('renames a bookmark label without renaming the underlying folder', async () => {
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			tempDirectoryUri
		);

		api.directoryOperator.renameBookmark(tempDirectoryUri, 'Pinned Project');
		api.directoryProvider.refresh();

		const rootItems = await api.directoryProvider.getChildren();

		assert.strictEqual(rootItems.length, 1);
		assert.strictEqual(rootItems[0].label, 'Pinned Project');
		assert.strictEqual(rootItems[0].description, '(bookmarked-folder)');
		assert.strictEqual(rootItems[0].resourceUri.fsPath, tempDirectoryUri.fsPath);
		assert.ok(rootItems[0].tooltip instanceof vscode.MarkdownString);
		assert.ok(rootItems[0].tooltip.value.includes('Original name: bookmarked-folder'));

		const stat = await vscode.workspace.fs.stat(tempDirectoryUri);
		assert.strictEqual(stat.type, vscode.FileType.Directory);
	});

	test('renames an underlying bookmarked resource and keeps the bookmark in sync', async () => {
		const sourceFileUri = vscode.Uri.file(path.join(tempRoot, 'rename-source.txt'));
		const renamedFileUri = vscode.Uri.file(path.join(tempRoot, 'rename-target.txt'));

		await fsPromises.writeFile(sourceFileUri.fsPath, 'rename me');
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			sourceFileUri
		);

		await api.directoryOperator.renameResource(sourceFileUri, renamedFileUri);
		api.directoryProvider.refresh();

		const rootItems = await api.directoryProvider.getChildren();

		assert.strictEqual(rootItems.length, 1);
		assert.strictEqual(rootItems[0].resourceUri.fsPath, renamedFileUri.fsPath);
		assert.strictEqual(rootItems[0].label, 'rename-target.txt');

		await assert.rejects(async () => vscode.workspace.fs.stat(sourceFileUri));
		const renamedStat = await vscode.workspace.fs.stat(renamedFileUri);
		assert.strictEqual(renamedStat.type, vscode.FileType.File);
	});

	test('deletes an underlying bookmarked resource and removes the bookmark', async () => {
		const disposableFileUri = vscode.Uri.file(path.join(tempRoot, 'delete-me.txt'));

		await fsPromises.writeFile(disposableFileUri.fsPath, 'delete me');
		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			disposableFileUri
		);

		await api.directoryOperator.deleteResource(disposableFileUri);
		api.directoryProvider.refresh();

		const rootItems = await api.directoryProvider.getChildren();

		assert.strictEqual(rootItems.length, 0);
		await assert.rejects(async () => vscode.workspace.fs.stat(disposableFileUri));
	});

	test('exports bookmarks as workspace-relative configuration', async () => {
		const exportFileUri = vscode.Uri.file(path.join(tempRoot, 'bookmarks-export.json'));

		await vscode.commands.executeCommand(
			'directoryprovider/selectitem',
			tempDirectoryUri
		);
		api.directoryOperator.renameBookmark(tempDirectoryUri, 'Pinned Project');

		await vscode.commands.executeCommand(
			'directoryprovider/exportbookmarks',
			exportFileUri
		);

		const exportedContent = await fsPromises.readFile(exportFileUri.fsPath, 'utf8');
		const parsed = JSON.parse(exportedContent);

		assert.strictEqual(parsed.version, 1);
		assert.strictEqual(parsed.bookmarks.length, 1);
		assert.strictEqual(parsed.bookmarks[0].alias, 'Pinned Project');
		assert.strictEqual(parsed.bookmarks[0].workspaceFolder, path.basename(workspaceRoot));
		assert.strictEqual(
			parsed.bookmarks[0].relativePath,
			path.relative(workspaceRoot, tempDirectoryUri.fsPath).split(path.sep).join('/')
		);
		assert.strictEqual(exportedContent.includes(tempDirectoryUri.fsPath), false);
	});

	test('imports bookmarks from workspace-relative configuration', async () => {
		const importFileUri = vscode.Uri.file(path.join(tempRoot, 'bookmarks-import.json'));
		const relativePath = path.relative(workspaceRoot, tempDirectoryUri.fsPath).split(path.sep).join('/');
		const configuration = {
			version: 1,
			bookmarks: [
				{
					relativePath,
					workspaceFolder: path.basename(workspaceRoot),
					alias: 'Imported Alias',
				},
			],
		};

		await fsPromises.writeFile(importFileUri.fsPath, JSON.stringify(configuration, null, 2));
		await vscode.commands.executeCommand(
			'directoryprovider/importbookmarks',
			importFileUri
		);

		const rootItems = await api.directoryProvider.getChildren();

		assert.strictEqual(rootItems.length, 1);
		assert.strictEqual(rootItems[0].label, 'Imported Alias');
		assert.strictEqual(rootItems[0].description, '(bookmarked-folder)');
		assert.strictEqual(rootItems[0].resourceUri.fsPath, tempDirectoryUri.fsPath);
	});
});
