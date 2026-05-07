import * as vscode from "vscode";
import { DirectoryProvider } from "./provider/DirectoryProvider";
import { DirectoryWorker } from "./operator/DirectoryWorker";
import { BookmarkConfigurationFile } from "./operator/DirectoryWorker";
import { DirectoryProviderCommands } from "./commands/CrudCommands";
import { VsCodeCommands } from "./commands/CrudCommands";

export interface ExplorerBookmarkApi
{
  directoryOperator: DirectoryWorker;
  directoryProvider: DirectoryProvider;
}

export function createExplorerBookmarkApi(
  context: vscode.ExtensionContext,
  workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): ExplorerBookmarkApi
{
  const directoryOperator = new DirectoryWorker(
    context,
    workspaceFolders
  );

  const directoryProvider = new DirectoryProvider(
    directoryOperator
  );

  return {
    directoryOperator,
    directoryProvider,
  };
}

async function promptForName(
  title: string,
  defaultValue?: string
): Promise<string | undefined>
{
  const value = await vscode.window.showInputBox({
    prompt: title,
    title,
    value: defaultValue,
    validateInput: (input) =>
    {
      if (!input.trim())
      {
        return "A name is required.";
      }

      if (input.includes("/") || input.includes("\\"))
      {
        return "Use a single file or folder name.";
      }

      return undefined;
    },
  });

  return value?.trim();
}

async function renameBookmark(
  directoryOperator: DirectoryWorker,
  directoryProvider: DirectoryProvider,
  target: unknown
): Promise<void>
{
  const uri = directoryOperator.resolveUri(target);

  if (!uri)
  {
    return;
  }

  const bookmark = directoryOperator.getBookmark(uri);
  const defaultValue = bookmark?.alias || uri.path.split("/").pop();
  const nextName = await promptForName("Rename Bookmark", defaultValue);

  if (!nextName)
  {
    return;
  }

  directoryOperator.renameBookmark(uri, nextName);
  directoryProvider.refresh();
}

async function renameResource(
  directoryOperator: DirectoryWorker,
  directoryProvider: DirectoryProvider,
  target: unknown
): Promise<void>
{
  const uri = directoryOperator.resolveUri(target);

  if (!uri)
  {
    return;
  }

  const nextName = await promptForName("Rename", uri.path.split("/").pop());

  if (!nextName)
  {
    return;
  }

  const destinationUri = vscode.Uri.joinPath(uri, "..", nextName);

  await directoryOperator.renameResource(uri, destinationUri);
  directoryProvider.refresh();
}

async function deleteResource(
  directoryOperator: DirectoryWorker,
  directoryProvider: DirectoryProvider,
  target: unknown
): Promise<void>
{
  const uri = directoryOperator.resolveUri(target);

  if (!uri)
  {
    return;
  }

  const isDirectory = await directoryOperator.isDirectory(uri);
  const confirmed = await vscode.window.showWarningMessage(
    `Delete "${uri.path.split("/").pop()}"?`,
    { modal: true },
    isDirectory ? "Delete Folder" : "Delete File"
  );

  if (!confirmed)
  {
    return;
  }

  await directoryOperator.deleteResource(uri);
  directoryProvider.refresh();
}

async function createChildResource(
  directoryOperator: DirectoryWorker,
  directoryProvider: DirectoryProvider,
  target: unknown,
  kind: "file" | "folder"
): Promise<void>
{
  const uri = directoryOperator.resolveUri(target);

  if (!uri)
  {
    return;
  }

  const name = await promptForName(
    kind === "file" ? "New File" : "New Folder"
  );

  if (!name)
  {
    return;
  }

  const destinationUri = vscode.Uri.joinPath(uri, name);

  if (kind === "file")
  {
    await vscode.workspace.fs.writeFile(destinationUri, new Uint8Array());
  }
  else
  {
    await vscode.workspace.fs.createDirectory(destinationUri);
  }

  directoryProvider.refresh();
}

function isBookmarkConfigurationFile(value: unknown): value is BookmarkConfigurationFile
{
  if (!value || typeof value !== "object")
  {
    return false;
  }

  const candidate = value as {
    version?: unknown;
    bookmarks?: unknown;
  };

  return candidate.version === 1 && Array.isArray(candidate.bookmarks);
}

async function exportBookmarks(
  directoryOperator: DirectoryWorker,
  targetUri?: vscode.Uri
): Promise<void>
{
  const destinationUri = targetUri || await vscode.window.showSaveDialog({
    saveLabel: "Export Bookmarks",
    filters: {
      JSON: ["json"],
    },
    defaultUri: vscode.workspace.workspaceFolders?.[0]
      ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, "explorer-bookmarks.json")
      : undefined,
  });

  if (!destinationUri)
  {
    return;
  }

  const configuration = directoryOperator.exportBookmarks();
  const content = JSON.stringify(configuration, null, 2);

  await vscode.workspace.fs.writeFile(
    destinationUri,
    Buffer.from(content, "utf8")
  );
}

async function importBookmarks(
  directoryOperator: DirectoryWorker,
  directoryProvider: DirectoryProvider,
  sourceUri?: vscode.Uri
): Promise<void>
{
  const resolvedSourceUri = sourceUri || (await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Import Bookmarks",
    filters: {
      JSON: ["json"],
    },
  }))?.[0];

  if (!resolvedSourceUri)
  {
    return;
  }

  const rawContent = await vscode.workspace.fs.readFile(resolvedSourceUri);
  const parsedContent = JSON.parse(Buffer.from(rawContent).toString("utf8")) as unknown;

  if (!isBookmarkConfigurationFile(parsedContent))
  {
    throw new Error("The selected file is not a valid Explorer Bookmark configuration.");
  }

  await directoryOperator.importBookmarks(parsedContent);
  directoryProvider.refresh();
}

export function activate(context: vscode.ExtensionContext): ExplorerBookmarkApi
{
  const api = createExplorerBookmarkApi(
    context,
    vscode.workspace.workspaceFolders
  );

  vscode.window.registerTreeDataProvider(
    "explorer-bookmark",
    api.directoryProvider);

  context.subscriptions.push(
    ...[
      vscode.commands.registerCommand(
        DirectoryProviderCommands.refreshEntry,
        () => api.directoryProvider.refresh()
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.openItem,
        (file) =>
        {
          return vscode.commands.executeCommand(
            VsCodeCommands.open,
            file.resourceUri
          );
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.openItemToSide,
        (args) =>
        {
          const uri = api.directoryOperator.resolveUri(args);

          if (!uri)
          {
            return;
          }

          return vscode.commands.executeCommand(
            VsCodeCommands.open,
            uri,
            {
              viewColumn: vscode.ViewColumn.Beside,
              preview: false,
            }
          );
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.revealInExplorer,
        (args) =>
        {
          const uri = api.directoryOperator.resolveUri(args);
          return uri
            ? vscode.commands.executeCommand("revealInExplorer", uri)
            : undefined;
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.copyPath,
        async (args) =>
        {
          const uri = api.directoryOperator.resolveUri(args);

          if (!uri)
          {
            return;
          }

          await vscode.env.clipboard.writeText(uri.fsPath);
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.copyRelativePath,
        async (args) =>
        {
          const uri = api.directoryOperator.resolveUri(args);

          if (!uri)
          {
            return;
          }

          await vscode.env.clipboard.writeText(vscode.workspace.asRelativePath(uri, false));
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.renameBookmark,
        (args) => renameBookmark(api.directoryOperator, api.directoryProvider, args)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.exportBookmarks,
        (args) => exportBookmarks(api.directoryOperator, api.directoryOperator.resolveUri(args))
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.importBookmarks,
        (args) => importBookmarks(api.directoryOperator, api.directoryProvider, api.directoryOperator.resolveUri(args))
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.selectItem,
        (args) => api.directoryProvider.selectItem(api.directoryOperator.resolveUri(args))
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.renameResource,
        (args) => renameResource(api.directoryOperator, api.directoryProvider, args)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.deleteResource,
        (args) => deleteResource(api.directoryOperator, api.directoryProvider, args)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.newFile,
        (args) => createChildResource(api.directoryOperator, api.directoryProvider, args, "file")
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.newFolder,
        (args) => createChildResource(api.directoryOperator, api.directoryProvider, args, "folder")
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.removeItem,
        (args) =>
        {
          return api.directoryProvider.removeItem(api.directoryOperator.resolveUri(args));
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.cantRemoveItem,
        () =>
        {
          vscode.window.showInformationMessage(
            "You can only remove items that were directly added to the view"
          );
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.removeAllItems,
        () => api.directoryProvider.removeAllItems()
      ),
    ]
  );

  return api;
}

export function deactivate() { }
