import * as vscode from "vscode";
import { DirectoryProvider } from "./provider/DirectoryProvider";
import { DirectoryWorker } from "./operator/DirectoryWorker";
import { DirectoryProviderCommands } from "./commands/CrudCommands";
import { vsCodeCommands } from "./commands/CrudCommands";

export function activate(context: vscode.ExtensionContext) 
{
  const hasShownWelcome = context.globalState.get('hasShownWelcome', false);
  if (!hasShownWelcome)
  {
    vscode.window.showInformationMessage(
      'Welcome to Explorer Bookmark! Right-click any file or folder to create your first bookmark.',
      'Show Documentation', 'Create First Bookmark'
    ).then(selection =>
    {
      if (selection === 'Show Documentation') 
      {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/UrosVuj/Explorer-Bookmark#readme'));
      }
      else if (selection === 'Create First Bookmark')
      {
        vscode.commands.executeCommand('workbench.view.explorer');
      }
    });
    context.globalState.update('hasShownWelcome', true);
  }

  const directoryOperator = new DirectoryWorker(context, vscode.workspace.workspaceFolders);
  const directoryProvider = new DirectoryProvider(directoryOperator);

  vscode.window.registerTreeDataProvider("explorer-bookmark", directoryProvider);

  context.subscriptions.push(...[
    vscode.commands.registerCommand(
      DirectoryProviderCommands.RefreshEntry,
      () => directoryProvider.refresh()
    ),
    vscode.commands.registerCommand(DirectoryProviderCommands.OpenItem, (file) =>
    {
      vscode.commands.executeCommand(vsCodeCommands.Open, vscode.Uri.parse(file.resourceUri.path));
    }),
    vscode.commands.registerCommand(DirectoryProviderCommands.SelectItem, (args) => directoryProvider.selectItem(vscode.Uri.parse(args.path))),
    vscode.commands.registerCommand(DirectoryProviderCommands.SelectItemToSection, async (args) =>
    {
      const sectionId = await directoryOperator.askUserForSection();
      if (sectionId) 
      {
        directoryProvider.selectItem(vscode.Uri.parse(args.path), sectionId);
      }
    }),
    vscode.commands.registerCommand(DirectoryProviderCommands.RemoveItem, (args) =>
    {
      directoryProvider.removeItem(args.resourceUri, args.sectionId);
    }),
    vscode.commands.registerCommand(DirectoryProviderCommands.AddSection, async () =>
    {
      const name = await vscode.window.showInputBox({
        placeHolder: 'Enter section name',
        prompt: 'Name for the new bookmark section'
      });
      if (name && name.trim())
      {
        directoryProvider.addSection(name.trim());
      }
    }),
    vscode.commands.registerCommand(DirectoryProviderCommands.RemoveSection, (args) => directoryProvider.removeSection(args.sectionId)),
    vscode.commands.registerCommand(DirectoryProviderCommands.CantRemoveItem, () =>
    {
      vscode.window.showInformationMessage("You can only remove items that were directly added to the view");
    }),
    vscode.commands.registerCommand(DirectoryProviderCommands.RemoveAllItems, () => directoryProvider.removeAllItems()),

    // AI + Git + jos neke komande
    vscode.commands.registerCommand(DirectoryProviderCommands.ViewAISummary, (args) => directoryProvider.viewAISummary(args.resourceUri)),
    vscode.commands.registerCommand(DirectoryProviderCommands.AddBookmarkTags, (args) => directoryProvider.addTags(args.resourceUri)),
    vscode.commands.registerCommand(DirectoryProviderCommands.ShowGitDiff, (args) => directoryProvider.showGitDiff(args.resourceUri)),
    vscode.commands.registerCommand(DirectoryProviderCommands.CherryPickChanges, (args) => directoryProvider.cherryPickChanges(args.resourceUri)),
    vscode.commands.registerCommand(DirectoryProviderCommands.GitAddFile, (args) => directoryProvider.gitAddFile(args.resourceUri)),
    vscode.commands.registerCommand(DirectoryProviderCommands.GitCommitFile, (args) => directoryProvider.gitCommitFile(args.resourceUri)),
    vscode.commands.registerCommand(DirectoryProviderCommands.GitStashFile, (args) => directoryProvider.gitStashFile(args.resourceUri)),
    vscode.commands.registerCommand(DirectoryProviderCommands.GitPushBookmarkedFiles, () => directoryProvider.gitPushBookmarkedFiles()),
    vscode.commands.registerCommand(DirectoryProviderCommands.GitFetch, () => directoryProvider.gitFetch()),
    vscode.commands.registerCommand(DirectoryProviderCommands.GitPull, () => directoryProvider.gitPull()),
    vscode.commands.registerCommand(DirectoryProviderCommands.GitRebase, () => directoryProvider.gitRebase()),
    vscode.commands.registerCommand(DirectoryProviderCommands.GitOperations, () => directoryProvider.gitOperations()),

    vscode.commands.registerCommand(DirectoryProviderCommands.ExportTeamBookmarks, () => directoryProvider.exportTeamBookmarks()),
    vscode.commands.registerCommand(DirectoryProviderCommands.ImportTeamBookmarks, () => directoryProvider.importTeamBookmarks()),
    vscode.commands.registerCommand(DirectoryProviderCommands.SyncTeamBookmarks, () => directoryProvider.syncTeamBookmarks()),
    vscode.commands.registerCommand(DirectoryProviderCommands.InjectTeamBookmarks, () => directoryProvider.injectTeamBookmarks()),

    vscode.commands.registerCommand(DirectoryProviderCommands.UpdateStatus, (args) => directoryProvider.updateStatus(args.resourceUri)),
    vscode.commands.registerCommand(DirectoryProviderCommands.UpdatePriority, (args) => directoryProvider.updatePriority(args.resourceUri)),

    vscode.commands.registerCommand(DirectoryProviderCommands.CreatePR, (args) => directoryProvider.createPullRequest(args.resourceUri)),
    vscode.commands.registerCommand(DirectoryProviderCommands.LinkPR, (args) => directoryProvider.linkPullRequest(args.resourceUri)),
    vscode.commands.registerCommand(DirectoryProviderCommands.ShowGitHub, (args) => directoryProvider.showOnGitHub(args.resourceUri)),
  ]
  );
}

export function deactivate() { }
