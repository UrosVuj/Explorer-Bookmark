import * as vscode from "vscode";
import { ExplorerBookmark } from "./provider/ExplorerBookmark";

export function activate(context: vscode.ExtensionContext) {
  const explorerBookmark = new ExplorerBookmark(
    context,
    vscode.workspace.workspaceFolders
  );

  vscode.window.registerTreeDataProvider("explorer-bookmark", explorerBookmark);

  context.subscriptions.push(
    ...[
      vscode.commands.registerCommand("explorer-bookmark.refreshEntry", () =>
        explorerBookmark.refresh()
      ),
      vscode.commands.registerCommand("explorer-bookmark.openFile", (file) => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(file.resourceUri.path)
        );
      }),
      vscode.commands.registerCommand("explorer-bookmark.selectItem", (args) =>
        explorerBookmark.selectItem(vscode.Uri.parse(args.path))
      ),
      vscode.commands.registerCommand(
        "explorer-bookmark.removeItem",
        (args) => {
          explorerBookmark.removeItem(args.resourceUri);
        }
      ),
      vscode.commands.registerCommand(
        "explorer-bookmark.renameItem",
        (args) => {
          explorerBookmark.renameItem(args);
        }
      ),
      vscode.commands.registerCommand(
        "explorer-bookmark.cantRemoveItemMsg",
        () => {
          vscode.window.showInformationMessage(
            "You can only remove items that were directly added to the view"
          );
        }
      ),
      vscode.commands.registerCommand("explorer-bookmark.removeAllItems", () =>
        explorerBookmark.removeAllItems()
      ),
    ]
  );
}

export function deactivate() {}
