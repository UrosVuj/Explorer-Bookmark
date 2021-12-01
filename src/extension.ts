import * as vscode from "vscode";
import { ExplorerManager } from "./provider/ExplorerManager";

export function activate(context: vscode.ExtensionContext) {
  const explorerManager = new ExplorerManager(
    context,
    vscode.workspace.workspaceFolders
  );

  vscode.window.registerTreeDataProvider("explorer-manager", explorerManager);

  context.subscriptions.push(
    ...[
      vscode.commands.registerCommand("explorer-manager.refreshEntry", () =>
        explorerManager.refresh()
      ),
      vscode.commands.registerCommand("explorer-manager.openFile", (file) =>
        vscode.commands.executeCommand("vscode.open", file.resourceUri)
      ),
      vscode.commands.registerCommand("explorer-manager.selectItem", (args) =>
        explorerManager.selectItem(vscode.Uri.parse(args.path))
      ),
      vscode.commands.registerCommand("explorer-manager.removeItem", (args) => {
        explorerManager.removeItem(args.resourceUri);
      }),
      vscode.commands.registerCommand(
        "explorer-manager.cantRemoveItemMsg",
        () => {
          vscode.window.showInformationMessage(
            "You can only remove items that were directly added to the view"
          );
        }
      ),
      vscode.commands.registerCommand("explorer-manager.removeAllItems", () =>
        explorerManager.removeAllItems()
      ),
    ]
  );
}

export function deactivate() {}
