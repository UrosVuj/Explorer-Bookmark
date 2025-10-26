import * as vscode from "vscode";
import { FileSystemObject } from "../types/FileSystemObject";
import { DirectoryWorker } from "../operator/DirectoryWorker";
import { GitService } from "../services/GitService";

export class DirectoryProvider implements vscode.TreeDataProvider<FileSystemObject>
{
  private _onDidChangeTreeData: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData: vscode.Event<void> =
    this._onDidChangeTreeData.event;

  constructor(private directoryOperator: DirectoryWorker) { }

  private async getCurrentUser(): Promise<string>
  {
    try
    {
      var workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0)
      {
        var gitService = new GitService(workspaceFolders[0].uri.fsPath);
        return await gitService.getCurrentGitUser();
      }
    } catch (error)
    {
      console.error('Error getting git user:', error);
    }

    return vscode.env.machineId.substring(0, 8);
  }

  getTreeItem(element: FileSystemObject): vscode.TreeItem | Thenable<vscode.TreeItem> 
  {
    return element;
  }

  async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]>
  {
    return await this.directoryOperator.getChildren(element);
  }

  async selectItem(uri: vscode.Uri, sectionId?: string)
  {
    await this.directoryOperator.selectItem(uri, sectionId);
    this.refresh();
  }

  async removeItem(uri: vscode.Uri, sectionId?: string)
  {
    await this.directoryOperator.removeItem(uri, sectionId);
    this.refresh();
  }

  async addSection(name: string)
  {
    await this.directoryOperator.addSection(name);
    this.refresh();
  }

  async removeSection(sectionId: string)
  {
    await this.directoryOperator.removeSection(sectionId);
    this.refresh();
  }

  async viewAISummary(uri: vscode.Uri)
  {
    await this.directoryOperator.viewAISummary(uri);
  }

  async addTags(uri: vscode.Uri)
  {
    await this.directoryOperator.addTags(uri);
    this.refresh();
  }

  async showGitDiff(uri: vscode.Uri)
  {
    await this.directoryOperator.showDiff(uri);
  }

  async cherryPickChanges(uri: vscode.Uri)
  {
    await this.directoryOperator.cherryPickChanges(uri);
  }

  async gitAddFile(uri: vscode.Uri)
  {
    await this.directoryOperator.gitAddFile(uri);
  }

  async gitCommitFile(uri: vscode.Uri)
  {
    await this.directoryOperator.gitCommitFile(uri);
  }

  async gitStashFile(uri: vscode.Uri)
  {
    await this.directoryOperator.gitStashFile(uri);
  }

  async gitPushBookmarkedFiles()
  {
    await this.directoryOperator.gitPushBookmarkedFiles();
  }

  async gitFetch()
  {
    await this.directoryOperator.gitFetch();
  }

  async gitPull()
  {
    await this.directoryOperator.gitPull();
  }

  async gitRebase()
  {
    await this.directoryOperator.gitRebase();
  }

  async gitOperations()
  {
    await this.directoryOperator.gitOperations();
  }

  async exportTeamBookmarks()
  {
    await this.directoryOperator.exportTeamBookmarks();
  }

  async importTeamBookmarks()
  {
    await this.directoryOperator.importTeamBookmarks();
    this.refresh();
  }

  async syncTeamBookmarks()
  {
    await this.directoryOperator.syncTeamBookmarks();
    this.refresh();
  }

  async injectTeamBookmarks()
  {
    await this.directoryOperator.injectTeamBookmarks();
    this.refresh();
  }

  async updateStatus(uri: vscode.Uri)
  {
    var item = await this.directoryOperator.getTypedDirectoryForUri(uri);
    if (!item)
    {
      return;
    }

    var status = await vscode.window.showQuickPick([
      { label: 'active', description: 'aktivno radim na ovome' },
      { label: 'in-review', description: 'ceka review' },
      { label: 'completed', description: 'zavrseno' },
      { label: 'archived', description: 'arhivirano' }
    ], {
      placeHolder: 'novi status?'
    });

    if (status)
    {
      var currentUser = await this.getCurrentUser();
      item.updateStatus(status.label as any, currentUser);
      await this.directoryOperator.saveItems();
      this.refresh();
      vscode.window.showInformationMessage(`status: ${status.label}`);
    }
  }

  async updatePriority(uri: vscode.Uri)
  {
    var item = await this.directoryOperator.getTypedDirectoryForUri(uri);
    if (!item) return;

    var priority = await vscode.window.showQuickPick([
      { label: 'low' },
      { label: 'medium' },
      { label: 'high' },
      { label: 'critical' }
    ], {
      placeHolder: 'prioritet?'
    });

    if (priority)
    {
      var currentUser = await this.getCurrentUser();
      item.updatePriority(priority.label as any, currentUser);
      await this.directoryOperator.saveItems();
      this.refresh();
      vscode.window.showInformationMessage('prioritet: ' + priority.label);
    }
  }

  async createPR(uri: vscode.Uri)
  {
    await this.directoryOperator.createPR(uri);
  }

  async linkPR(uri: vscode.Uri) //ovo mozda da izbacim?? todo uros
  {
    var prUrl = await vscode.window.showInputBox({
      placeHolder: 'https://github.com/owner/repo/pull/123',
      prompt: 'github pr link'
    });

    if (prUrl)
    {
      await this.directoryOperator.linkPR(uri, prUrl);
      this.refresh();
    }
  }

  async showOnGitHub(uri: vscode.Uri)
  {
    await this.directoryOperator.showOnGitHub(uri);
  }

  removeAllItems()
  {
    this.directoryOperator.removeAllItems();
    this.refresh();
  }

  refresh(): void
  {
    this._onDidChangeTreeData.fire();
  }
}

