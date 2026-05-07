import * as vscode from "vscode";
import { DirectoryProvider } from "./provider/DirectoryProvider";
import { DirectoryWorker } from "./operator/DirectoryWorker";
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
        DirectoryProviderCommands.selectItem,
        (args) => api.directoryProvider.selectItem(api.directoryOperator.resolveUri(args))
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
