import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject } from "../types/FileSystemObject";
import { TypedDirectory } from "../types/TypedDirectory";
import { buildTypedDirectory } from "../types/TypedDirectory";
import { extractCommandTargetPath, isUriString } from "./CommandTarget";

export class DirectoryWorker
{
    readonly vsCodeExtensionConfigurationKey: string = "explorer-bookmark";
    readonly saveWorkspaceConfigurationSettingKey: string = "saveWorkspace";
    readonly storedBookmarksContextKey: string = "storedBookmarks";
    readonly bookmarkedDirectoryContextValue: string = "directlyBookmarkedDirectory";

    private bookmarkedDirectories: TypedDirectory[] = [];
    private saveWorkspaceSetting: boolean | undefined = false;

    constructor(
        private extensionContext: vscode.ExtensionContext,
        private workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
    )
    {
        this.hydrateState();
    }

    public async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]>
    {
        if (element)
        {
            return this.directorySearch(element.resourceUri);
        } else
        {
            return this.bookmarkedDirectories.length > 0
                ? this.createEntries(this.bookmarkedDirectories)
                : Promise.resolve([]);
        }
    }

    public async selectItem(uri: vscode.Uri | undefined)
    {
        if (uri)
        {
            const typedDirectory = await buildTypedDirectory(uri);
            const alreadyBookmarked = this.bookmarkedDirectories
                .some((directory) => directory.path === typedDirectory.path);

            if (!alreadyBookmarked)
            {
                this.bookmarkedDirectories.push(typedDirectory);
            }
        }
        this.saveBookmarks();
    }

    public async removeItem(uri: vscode.Uri | undefined)
    {
        if (uri)
        {
            const typedDirectory = await buildTypedDirectory(uri);
            const index =
                this.bookmarkedDirectories.map(e => e.path)
                    .indexOf(typedDirectory.path);
            if (index > -1)
            {
                this.bookmarkedDirectories.splice(index, 1);
            }
        }
        this.saveBookmarks();
    }

    public removeAllItems()
    {
        this.bookmarkedDirectories = [];
        this.saveBookmarks();
    }

    public resolveUri(value: unknown): vscode.Uri | undefined
    {
        if (!value)
        {
            return undefined;
        }

        if (value instanceof vscode.Uri)
        {
            return value;
        }

        if (typeof value === "object")
        {
            const candidate = value as {
                resourceUri?: vscode.Uri;
                uri?: vscode.Uri;
            };

            if (candidate.resourceUri instanceof vscode.Uri)
            {
                return candidate.resourceUri;
            }

            if (candidate.uri instanceof vscode.Uri)
            {
                return candidate.uri;
            }
        }

        const pathOrUri = extractCommandTargetPath(value);

        if (typeof pathOrUri === "string")
        {
            return isUriString(pathOrUri)
                ? vscode.Uri.parse(pathOrUri)
                : vscode.Uri.file(pathOrUri);
        }

        return undefined;
    }

    private async directorySearch(uri: vscode.Uri)
    {
        const entries = await vscode.workspace.fs.readDirectory(uri);
        return entries
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map((item) =>
            {
                const [name, type] = item;
                const isDirectory =
                    type === vscode.FileType.Directory
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None;

                return new FileSystemObject(
                    name,
                    isDirectory,
                    vscode.Uri.joinPath(uri, name)
                );
            });
    }

    private async createEntries(bookmarkedDirectories: TypedDirectory[])
    {
        let fileSystem: FileSystemObject[] = [];

        for (const dir of bookmarkedDirectories)
        {
            const { path: filePath, type: type } = dir;
            const file = vscode.Uri.file(filePath);

            fileSystem.push(
                new FileSystemObject(
                    `${path.basename(filePath)}`,
                    type === vscode.FileType.File
                        ? vscode.TreeItemCollapsibleState.None
                        : vscode.TreeItemCollapsibleState.Collapsed,
                    file
                ).setContextValue(this.bookmarkedDirectoryContextValue)
            );
        }

        return fileSystem;
    }

    private hydrateState(): void
    {
        this.saveWorkspaceSetting = vscode.workspace
            .getConfiguration(this.vsCodeExtensionConfigurationKey)
            .get(this.saveWorkspaceConfigurationSettingKey);
        this.bookmarkedDirectories =
            (this.workspaceRoot
                ? this.extensionContext.workspaceState.get(this.storedBookmarksContextKey)
                : this.extensionContext.globalState.get(this.storedBookmarksContextKey)) || [];
    }

    private saveBookmarks()
    {
        if (!this.saveWorkspaceSetting)
        {
            void this.extensionContext.workspaceState.update(
                this.storedBookmarksContextKey,
                undefined
            );
            void this.extensionContext.globalState.update(
                this.storedBookmarksContextKey,
                undefined
            );
            return;
        }

        this.workspaceRoot
            ? this.extensionContext.workspaceState.update(
                this.storedBookmarksContextKey,
                this.bookmarkedDirectories
            )
            : this.extensionContext.globalState.update(
                this.storedBookmarksContextKey,
                this.bookmarkedDirectories
            );
    }
}
