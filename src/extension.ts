// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { FolderManager } from "./provider/FolderManager";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "folder-manager.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello World from Uki car!");
    }
  );

  context.subscriptions.push(disposable);

  const folderManager = new FolderManager();
  vscode.window.registerTreeDataProvider("folder-manager", folderManager);

  //register commands
  vscode.commands.registerCommand("folder-manager.refreshEntry", () =>
    folderManager.refresh()
  );
  vscode.commands.registerCommand("folder-manager.openFile", (file) =>
    vscode.commands.executeCommand("vscode.open", file.resourceUri)
  );
  vscode.commands.registerCommand("folder-manager.selectFolder", (args) =>
    folderManager.selectFolder(vscode.Uri.parse(args.path))
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
