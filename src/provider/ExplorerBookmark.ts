import * as path from "path";
import * as vscode from "vscode";
import { FileSystemObject } from "./FileSystemObject";

export class ExplorerBookmark
  implements vscode.TreeDataProvider<FileSystemObject>
{
  private selectedFSObjects: vscode.Uri[] = [];

  private saveWorkspaceSetting: boolean | undefined = false;

  private _onDidChangeTreeData: vscode.EventEmitter<
    FileSystemObject | undefined | null | void
  > = new vscode.EventEmitter<FileSystemObject | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<
    FileSystemObject | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(
    private extensionContext: vscode.ExtensionContext,
    private workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
  ) {
    this.getSettings();
    if (this.saveWorkspaceSetting && this.selectedFSObjects.length > 0) {
      this.refresh();
    }
  }

  getTreeItem(
    element: FileSystemObject
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]> {
    if (element) {
      return this.directorySearch(element.resourceUri);
    } else {
      return this.selectedFSObjects.length > 0
        ? this.createEntries(this.selectedFSObjects)
        : Promise.resolve([]);
    }
  }

  async selectItem(uri: vscode.Uri | undefined) {
    if (uri) {
      this.selectedFSObjects.push(uri);
    }
    this.refresh();
    this.saveWorkspace();
  }

  async removeItem(uri: vscode.Uri | undefined) {
    if (uri) {
      const index = this.selectedFSObjects.indexOf(uri);
      if (index > -1) {
        this.selectedFSObjects.splice(index, 1);
      }
    }
    this.refresh();
    this.saveWorkspace();
  }

  private async directorySearch(uri: vscode.Uri) {
    const folders = await vscode.workspace.fs.readDirectory(uri);
    return folders
      .sort((a, b) => {
        if (
          a[1] === vscode.FileType.Directory &&
          b[1] === vscode.FileType.File
        ) {
          return -1;
        }
        if (
          a[1] === vscode.FileType.File &&
          b[1] === vscode.FileType.Directory
        ) {
          return 1;
        }

        return a[0].localeCompare(b[0]);
      })
      .map((item) => {
        const [name, type] = item;
        const isDirectory =
          type === vscode.FileType.Directory
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;

        return new FileSystemObject(
          name,
          isDirectory,
          vscode.Uri.file(uri.path + "/" + name)
        );
      });
  }

  private async createEntries(selectedFSObjects: vscode.Uri[]) {
    let folderSystem: FileSystemObject[] = [];

    for (const fsItem of selectedFSObjects) {
      let type = (await vscode.workspace.fs.stat(fsItem)).type;

      folderSystem.push(
        new FileSystemObject(
          `${path.basename(fsItem.path)}`,
          type === vscode.FileType.File
            ? vscode.TreeItemCollapsibleState.None
            : vscode.TreeItemCollapsibleState.Collapsed,
          fsItem
        ).setContextValue("directlySavedItem")
      );
    }

    return folderSystem;
  }

  private getSettings() {
    this.saveWorkspaceSetting = vscode.workspace
      .getConfiguration("explorer-bookmark")
      .get("saveWorkspace");
    this.selectedFSObjects =
      (this.workspaceRoot
        ? this.extensionContext.workspaceState.get("savedWorkspaceItems")
        : this.extensionContext.globalState.get("savedWorkspaceItems")) || [];
  }

  removeAllItems() {
    this.selectedFSObjects = [];
    this.refresh();
    this.saveWorkspace();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  saveWorkspace() {
    this.workspaceRoot
      ? this.extensionContext.workspaceState.update(
          "savedWorkspaceItems",
          this.selectedFSObjects
        )
      : this.extensionContext.globalState.update(
          "savedWorkspaceItems",
          this.selectedFSObjects
        );
  }
}
