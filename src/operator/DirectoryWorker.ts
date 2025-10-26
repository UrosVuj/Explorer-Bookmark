import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject } from "../types/FileSystemObject";
import { TypedDirectory } from "../types/TypedDirectory";
import { buildTypedDirectory } from "../types/TypedDirectory";
import { BookmarkSection } from "../types/BookmarkSection";
import { AIService } from "../services/AIService";
import { TeamBookmarkService } from "../services/TeamBookmarkService";
import { GitService } from "../services/GitService";
var simpleGit = require('simple-git');

export class DirectoryWorker
{
    readonly vsCodeExtensionConfigurationKey: string = "explorer-bookmark";
    readonly saveWorkspaceConfigurationSettingKey: string = "saveWorkspace";
    readonly storedBookmarksContextKey: string = "storedBookmarks"; // old format
    readonly storedSectionsContextKey: string = "storedSections"; // new format with sections
    readonly bookmarkedDirectoryContextValue: string = "directlyBookmarkedDirectory";
    readonly sectionContextValue: string = "bookmarkSection";

    private bookmarkSections: BookmarkSection[] = [];
    private saveWorkspaceSetting: boolean | undefined = false;
    private gitService: GitService | null = null;

    constructor(
        private extensionContext: vscode.ExtensionContext,
        private workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
    )
    {
        this.hydrateState();
    }

    /*
    uros todo: mozda da podelis ovo klasu u vise manjih... Ovako je ogroman fajl, iako realno klasa ima full ownership logicki
    */

    private getGitService(): GitService | null
    {
        // no workspace = no git
        if (!this.workspaceRoot || this.workspaceRoot.length == 0)
        {
            return null;
        }

        if (!this.gitService)
        {
            this.gitService = new GitService(this.workspaceRoot[0].uri.fsPath);
        }

        return this.gitService;
    }

    // this gets called by VS Code to show items in the tree view
    public async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]>
    {
        if (element && element.contextValue == this.sectionContextValue)
        {
            var section = this.bookmarkSections.find(s => s.id == element.sectionId);
            if (section)
            {
                return this.createDirectoryEntries(section.directories, section.id);
            }
            return [];
        }
        else if (element && element.sectionId)
        {
            return this.directorySearch(element.resourceUri);
        }
        else
        {
            return this.createSectionEntries();
        }
    }

    public async addSection(name: string): Promise<void>
    {
        var section = new BookmarkSection(Math.random().toString(36).substr(2, 9), name);
        this.bookmarkSections.push(section);
        this.saveSections();
    }

    public async removeSection(sectionId: string): Promise<void> 
    {
        var index = this.bookmarkSections.findIndex(s => s.id == sectionId);
        if (index > -1)
        {
            this.bookmarkSections.splice(index, 1);
            this.saveSections();
        }
    }

    public async selectItem(uri: vscode.Uri, sectionId?: string): Promise<void>
    {
        var workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (workspaceRoot)
        {
            var relativePath = path.relative(workspaceRoot, uri.fsPath);
            if (relativePath.startsWith('..')) 
            {
                return;
            }
        }

        var currentUser = await this.getCurrUser();
        var typedDirectory = await buildTypedDirectory(uri, undefined, currentUser);

        if (workspaceRoot && path.isAbsolute(typedDirectory.path))
        {
            var relativePath = path.relative(workspaceRoot, typedDirectory.path);
            typedDirectory.path = relativePath;
        }

        var targetSectionId = sectionId;
        if (!targetSectionId)
        {
            if (this.bookmarkSections.length == 0)
            {
                var defaultSection = BookmarkSection.createDefault();
                this.bookmarkSections.push(defaultSection);
                targetSectionId = defaultSection.id;
            }
            else if (this.bookmarkSections.length == 1)
            {
                targetSectionId = this.bookmarkSections[0].id;
            }
            else
            {
                targetSectionId = await this.askUserForSection();
                if (!targetSectionId)
                {
                    return;
                }
            }
        }

        var section = this.bookmarkSections.find(s => s.id == targetSectionId);
        if (section)
        {
            section.addDirectory(typedDirectory);
        }

        this.saveSections();
    }

    public async removeItem(uri: vscode.Uri, sectionId?: string): Promise<void>
    {
        var workspaceRoot = this.workspaceRoot?.[0]?.uri.fsPath;

        if (sectionId)
        {
            var section = this.bookmarkSections.find(s => s.id == sectionId);
            if (section)
            {
                var pathToRemove = uri.fsPath;
                if (workspaceRoot && path.isAbsolute(pathToRemove))
                {
                    pathToRemove = path.relative(workspaceRoot, pathToRemove);
                }
                section.removeDirectory(pathToRemove);
            }
        } else
        {
            for (var section3 of this.bookmarkSections)
            {
                var pathToRemove = uri.fsPath;
                if (workspaceRoot && path.isAbsolute(pathToRemove))
                {
                    pathToRemove = path.relative(workspaceRoot, pathToRemove);
                }
                section3.removeDirectory(pathToRemove);
            }
        }
        this.saveSections();
    }

    public removeAllItems(): void
    {
        for (var section of this.bookmarkSections)
        {
            section.directories = [];
        }
        this.saveSections();
    }

    public async askUserForSection(): Promise<string | undefined>
    {
        // build list of sections with their item counts
        var items = this.bookmarkSections.map(section => ({
            label: section.name,
            description: `${section.directories.length} items`,
            sectionId: section.id
        }));

        var selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a section to add the bookmark to'
        });

        return selected?.sectionId;
    }

    public async viewAISummary(uri: vscode.Uri): Promise<void>
    {
        // prikazes progress kako ti ide :D
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating AI summary...",
            cancellable: false
        }, async () =>
        {
            var summary = await AIService.generateFileSummary(uri);

            var result = this.findBookmarkOrParentByUri(uri);
            if (result)
            {
                result.bookmark.updateAISummary(summary);
                this.saveSections();
            }

            var doc = await vscode.workspace.openTextDocument({
                content: summary,
                language: 'markdown'
            });

            var textEditor = await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Beside,
                preview: false
            });

            await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
        });
    }

    public async addTags(uri: vscode.Uri): Promise<void> 
    {
        var tagsInput = await vscode.window.showInputBox({
            placeHolder: 'Enter tags separated by commas (e.g., api, authentication, important)',
            prompt: 'Add tags to categorize this bookmark'
        });

        if (tagsInput)
        {
            var tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

            var result = this.findBookmarkOrParentByUri(uri);
            if (result && result.bookmark)
            {
                // dodaj tagove
                tags.forEach(tag => result!.bookmark.addTag(tag));
                this.saveSections();
                vscode.window.showInformationMessage(`Added ${tags.length} tags to bookmark`);
                return;
            }
        }
    }

    public async showDiff(uri: vscode.Uri): Promise<void>
    {
        var gitService = this.getGitService();
        if (!gitService)
        {
            vscode.window.showErrorMessage('No workspace detected. Git diff requires a workspace.');
            return;
        }

        var workspaceRoot = this.workspaceRoot![0].uri.fsPath;
        var filePath = uri.fsPath;

        // ovo da izbacim vrv
        var relativePath = path.relative(workspaceRoot, filePath);
        if (relativePath.startsWith('..'))
        {
            vscode.window.showErrorMessage(
                `Cannot show Git diff: The selected file is outside the current workspace.\n\nWorkspace: ${workspaceRoot}\nFile: ${filePath}`
            );
            return;
        }

        var currentBranch = await gitService.getCurrBranch();

        var diffOptions = [
            {
                label: 'Working Directory vs HEAD',
                description: 'Show uncommitted changes',
                option: 'working'
            },
            {
                label: 'Local vs Remote',
                description: `Compare with origin/${currentBranch}`,
                option: 'remote'
            },
            {
                label: 'Between Branches',
                description: 'Choose two branches to compare',
                option: 'branches'
            },
            {
                label: 'File History',
                description: 'Show recent commits affecting this file',
                option: 'history'
            }
        ];

        var selectedOption = await vscode.window.showQuickPick(diffOptions, {
            placeHolder: 'Choose diff type'
        });

        if (!selectedOption) return;

        var resolvedUri = vscode.Uri.file(filePath);
        await this.handleDiffOption(resolvedUri, gitService, selectedOption.option, currentBranch);
    }

    public async cherryPickChanges(uri: vscode.Uri): Promise<void>
    {
        var gitService = this.getGitService();
        if (!gitService)
        {
            vscode.window.showErrorMessage('No workspace detected. Cherry-pick requires a workspace.');
            return;
        }

        var workspaceRoot = this.workspaceRoot![0].uri.fsPath;
        var filePath = uri.fsPath;
        var relativePath = path.relative(workspaceRoot, filePath);
        if (relativePath.startsWith('..'))
        {
            vscode.window.showErrorMessage(
                `Cannot cherry-pick: The selected file is outside the current workspace.\n Workspace: ${workspaceRoot} \n File: ${filePath}`
            );
            return;
        }

        var branches = await gitService.getAllBranches();
        var branchNames = branches.map(b => b.name).filter(name => !name.startsWith('remotes/'));
        var currentBranch = await gitService.getCurrBranch();
        var otherBranches = branchNames.filter(name => name !== currentBranch);

        if (otherBranches.length == 0)
        {
            vscode.window.showInformationMessage('No other branches available for cherry-picking.');
            return;
        }

        var sourceBranch = await vscode.window.showQuickPick(otherBranches, {
            placeHolder: 'Select branch to cherry-pick from'
        });

        if (!sourceBranch) return;

        var cherryPickOptions = [
            {
                label: 'Cherry-pick File Changes',
                description: 'Apply changes to this specific file from selected commits',
                option: 'file'
            },
            {
                label: 'Cherry-pick Entire Commits',
                description: 'Apply entire commits (all files changed in those commits)',
                option: 'commits'
            }
        ];

        var selectedOption = await vscode.window.showQuickPick(cherryPickOptions, {
            placeHolder: 'Choose cherry-pick type'
        });

        if (!selectedOption) return;

        var resolvedUri = vscode.Uri.file(filePath);
        await this.handleCherryPickOption(resolvedUri, gitService, sourceBranch, selectedOption.option);
    }

    // todo uros: dodati batch staging?
    public async gitAddFile(uri: vscode.Uri): Promise<void>
    {
        var gitService = this.getGitService();
        if (!gitService)
        {
            vscode.window.showErrorMessage('No workspace detected. Git add requires a workspace.');
            return;
        }

        var workspaceRoot = this.workspaceRoot![0].uri.fsPath;
        var filePath = uri.fsPath;

        var relativePath = path.relative(workspaceRoot, filePath);
        if (relativePath.startsWith('..'))
        {
            vscode.window.showErrorMessage(
                `Cannot stage file: The selected file is outside the current workspace.\n\nWorkspace: ${workspaceRoot}\nFile: ${filePath}`
            );
            return;
        }

        // moras da znas status, ne mozes na slepo da pokusas...
        var status = await gitService.getFileStatus(filePath);

        if (status.isStaged)
        {
            var action = await vscode.window.showInformationMessage(
                `'${path.basename(filePath)}' is already staged. What would you like to do?`,
                'Unstage', 'Cancel'
            );

            if (action == 'Unstage')
            {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Unstaging file...",
                    cancellable: false
                }, async () =>
                {
                    var result = await gitService!.unstageFile(filePath);

                    if (result.success)
                    {
                        vscode.window.showInformationMessage(result.message);
                    }
                    else
                    {
                        vscode.window.showErrorMessage(result.message);
                    }
                });
            }
            return;
        }

        // pokusaj da stageujes fajl, git ce handlovat ako nema izmena
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Staging file...",
            cancellable: false
        }, async () =>
        {
            var result = await gitService!.stageFile(filePath);

            if (result.success)
            {
                vscode.window.showInformationMessage(result.message);
            }
            else
            {
                vscode.window.showErrorMessage(result.message);
            }
        });
    }

    public async gitCommitFile(uri: vscode.Uri): Promise<void>
    {
        var gitService = this.getGitService();
        if (!gitService)
        {
            vscode.window.showErrorMessage('No workspace detected. Git commit requires a workspace.');
            return;
        }

        var workspaceRoot = this.workspaceRoot![0].uri.fsPath;
        var filePath = uri.fsPath;
        var relativePath = path.relative(workspaceRoot, filePath);
        if (relativePath.startsWith('..'))
        {
            vscode.window.showErrorMessage(
                `Cannot commit file: The selected file is outside the current workspace.\n\nWorkspace: ${workspaceRoot}\nFile: ${filePath}`
            );
            return;
        }

        var status = await gitService.getFileStatus(filePath);

        if (!status.isModified && !status.isUntracked && !status.isStaged)
        {
            vscode.window.showInformationMessage(`No changes to commit for '${path.basename(filePath)}'`);
            return;
        }

        var commitMessage = await vscode.window.showInputBox({
            prompt: `Enter commit message for '${path.basename(filePath)}'`,
            placeHolder: 'feat: add new feature',
            validateInput: (value) =>
            {
                if (!value || value.trim().length == 0)
                {
                    return 'Commit message cannot be empty';
                }
                return null;
            }
        });

        if (!commitMessage) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Committing file...",
            cancellable: false
        }, async () =>
        {
            var result = await gitService!.commitFile(filePath, commitMessage!);

            if (result.success)
            {
                vscode.window.showInformationMessage(result.message);
            }
            else
            {
                vscode.window.showErrorMessage(result.message);
            }
        });
    }

    public async gitStashFile(uri: vscode.Uri): Promise<void>
    {
        var gitService = this.getGitService();
        if (!gitService)
        {
            vscode.window.showErrorMessage('No workspace detected. Git stash requires a workspace.');
            return;
        }

        var workspaceRoot = this.workspaceRoot![0].uri.fsPath;
        var filePath = uri.fsPath;

        var relativePath = path.relative(workspaceRoot, filePath);
        if (relativePath.startsWith('..'))
        {
            vscode.window.showErrorMessage(
                `Cannot stash file: The selected file is outside the current workspace.\n\nWorkspace: ${workspaceRoot}\nFile: ${filePath}`
            );
            return;
        }

        var status = await gitService.getFileStatus(filePath);

        if (!status.isModified && !status.isUntracked)
        {
            vscode.window.showInformationMessage(`No changes to stash for '${path.basename(filePath)}'`);
            return;
        }

        var stashMessage = await vscode.window.showInputBox({
            prompt: `Enter stash message for '${path.basename(filePath)}' (optional)`,
            placeHolder: 'WIP: temporary changes'
        });

        var confirmation = await vscode.window.showWarningMessage(
            `Stash changes for '${path.basename(filePath)}'? This will save the changes and revert the file to the last commit.`,
            'Yes, Stash', 'Cancel'
        );

        if (confirmation !== 'Yes, Stash') return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Stashing file...",
            cancellable: false
        }, async () =>
        {
            var result = await gitService!.stashFile(filePath, stashMessage || undefined);

            if (result.success)
            {
                vscode.window.showInformationMessage(result.message);
            }
            else
            {
                vscode.window.showErrorMessage(result.message);
            }
        });
    }

    public async gitPushBookmarkedFiles(): Promise<void>
    {
        var gitService = this.getGitService();
        if (!gitService)
        {
            vscode.window.showErrorMessage('No workspace detected. Git push requires a workspace.');
            return;
        }

        var workspaceRoot = this.workspaceRoot![0].uri.fsPath;

        try
        {
            await gitService.getCurrBranch();
        } catch (error)
        {
            vscode.window.showErrorMessage('This workspace is not a Git repository.');
            return;
        }

        var bookmarkedFiles: string[] = [];
        var skippedFiles: string[] = [];


        for (var section of this.bookmarkSections)
        {
            for (var dir of section.directories)
            {
                var absolutePath = path.isAbsolute(dir.path)
                    ? dir.path
                    : path.join(workspaceRoot, dir.path);

                var normalizedWorkspace = path.resolve(workspaceRoot);
                var normalizedPath = path.resolve(absolutePath);
                var relativePath = path.relative(normalizedWorkspace, normalizedPath);

                console.log('Checking file:', {
                    fileName: path.basename(dir.path),
                    originalPath: dir.path,
                    absolutePath: absolutePath,
                    relativePath: relativePath,
                    startsWithDotDot: relativePath.startsWith('..'),
                    isAbsolute: path.isAbsolute(relativePath)
                });

                if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
                {
                    bookmarkedFiles.push(absolutePath);
                }
                else
                {
                    skippedFiles.push(path.basename(dir.path));
                }
            }
        }

        // TODO: mozda prikazati progress bar?
        if (bookmarkedFiles.length == 0)
        {
            if (skippedFiles.length > 0)
            {
                vscode.window.showWarningMessage(
                    `No bookmarked files within the workspace to push.`
                );
            }
            else
            {
                vscode.window.showInformationMessage('No bookmarked files to push.');
            }
            return;
        }

        var commitMessage = await vscode.window.showInputBox({
            prompt: `Enter commit message for ${bookmarkedFiles.length} bookmarked file(s)`,
            placeHolder: 'feat: update bookmarked files',
            validateInput: (value) =>
            {
                if (!value || value.trim().length == 0)
                {
                    return 'Commit message cannot be empty';
                }
                return null;
            }
        });

        if (!commitMessage) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Pushing bookmarked files...",
            cancellable: false
        }, async () =>
        {
            var result = await gitService!.stageCommitPush(bookmarkedFiles, commitMessage!);

            if (result.success)
            {
                vscode.window.showInformationMessage(result.message);
            }
            else
            {
                vscode.window.showErrorMessage(result.message);
            }
        });
    }

    public async gitFetch(): Promise<void>
    {
        var gitService = this.getGitService();
        if (!gitService)
        {
            vscode.window.showErrorMessage('No workspace detected. Git fetch requires a workspace.');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Fetching from remote...",
            cancellable: false
        }, async () =>
        {
            var success = await gitService!.fetch();

            if (success)
            {
                vscode.window.showInformationMessage('Successfully fetched from remote');
            }
            else
            {
                vscode.window.showErrorMessage('Failed to fetch from remote');
            }
        });
    }

    public async gitPull(): Promise<void> 
    {
        var gitService = this.getGitService();
        if (!gitService)
        {
            vscode.window.showErrorMessage('No workspace detected. Git pull requires a workspace.');
            return;
        }

        // proveris da li ima nesto uncommitted, sta radis ako overwrite
        var status = await gitService.getGitInfo();
        if (status.hasLocalChanges)
        {
            var action = await vscode.window.showWarningMessage(
                'You have uncommitted changes. What would you like to do?',
                'Stash and Pull', 'Cancel'
            );

            if (action !== 'Stash and Pull')
            {
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Stashing changes...",
                cancellable: false
            }, async () =>
            {
                await gitService!.stashChanges('Auto-stash before pull');
            });
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Pulling from remote...",
            cancellable: false
        }, async () =>
        {
            var success = await gitService!.pull();

            if (success)
            {
                vscode.window.showInformationMessage('Successfully pulled from remote');
            }
            else
            {
                vscode.window.showErrorMessage('Failed to pull from remote. You may need to resolve conflicts.');
            }
        });
    }

    // NOTE: treba da se vrati na ovo, mozda dodati interactive rebase?
    public async gitRebase(): Promise<void>
    {
        var gitService = this.getGitService();
        if (!gitService)
        {
            vscode.window.showErrorMessage('No workspace detected. Git rebase requires a workspace.');
            return;
        }

        var branches = await gitService.getAllBranches();
        var branchNames = branches
            .filter(b => !b.remote)
            .map(b => b.name);

        if (branchNames.length == 0)
        {
            vscode.window.showErrorMessage('No branches found.');
            return;
        }

        var targetBranch = await vscode.window.showQuickPick(branchNames, {
            placeHolder: 'Select branch to rebase onto',
            canPickMany: false
        });

        if (!targetBranch)
        {
            return;
        }

        var status = await gitService.getGitInfo();
        if (status.hasLocalChanges)
        {
            vscode.window.showWarningMessage(
                'You have uncommitted changes. Please commit or stash them before rebasing.'
            );
            return;
        }

        var confirmation = await vscode.window.showWarningMessage(
            `Rebase current branch onto '${targetBranch}'? This will rewrite commit history.`,
            'Yes, Rebase', 'Cancel'
        );

        if (confirmation !== 'Yes, Rebase')
        {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Rebasing onto ${targetBranch}...`,
            cancellable: false
        }, async () =>
        {
            var result = await gitService!.rebase(targetBranch!);

            if (result.success)
            {
                vscode.window.showInformationMessage(result.message);
            }
            else
            {
                vscode.window.showErrorMessage(result.message);
            }
        });
    }

    // sto pokrecemo iz ikonice
    public async gitOperations(): Promise<void>
    {
        var operations = [
            {
                label: '$(cloud-upload) Push All Bookmarked Files',
                description: 'Stage, commit, and push all bookmarked files',
                action: 'push'
            },
            {
                label: '$(cloud-download) Fetch',
                description: 'Fetch changes from remote',
                action: 'fetch'
            },
            {
                label: '$(repo-pull) Pull',
                description: 'Pull and merge changes from remote',
                action: 'pull'
            },
            {
                label: '$(git-merge) Rebase',
                description: 'Rebase current branch onto another',
                action: 'rebase'
            }
        ];

        var selected = await vscode.window.showQuickPick(operations, {
            placeHolder: 'Select a git operation'
        });

        if (!selected) return;

        switch (selected.action)
        {
            case 'push':
                await this.gitPushBookmarkedFiles();
                break;
            case 'fetch':
                await this.gitFetch();
                break;
            case 'pull':
                await this.gitPull();
                break;
            case 'rebase':
                await this.gitRebase();
                break;
        }
    }

    private async showDiffInEditor(diffContent: string, filePath: string, remoteBranch: string): Promise<void>
    {
        var doc = await vscode.workspace.openTextDocument({
            content: diffContent,
            language: 'diff'
        });

        await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: false
        });
    }

    // todo uros: prompt mozda predug, skratiti
    private async generateAIDiffSummary(diffContent: string, filePath: string, remoteBranch: string): Promise<void>
    {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating AI diff summary...",
            cancellable: false
        }, async () =>
        {
            var prompt =

                `Analyze this git diff and provide a clear, concise summary of the changes:

File: ${filePath}
Comparing: local vs ${remoteBranch}

Diff:
${diffContent}

Please provide:
1. A brief summary of what changed
2. Key modifications, additions, or deletions
3. Potential impact or significance of these changes
4. Any notable patterns or concerns

Keep the summary focused and easy to understand.`;

            var summary = await AIService.generateCustomSummary(prompt);

            var content = `# Git Diff Summary

**File:** ${filePath}  
**Comparison:** local vs ${remoteBranch}

---

${summary}`;

            var doc = await vscode.workspace.openTextDocument({
                content: content,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Beside,
                preview: true
            });
        });
    }

    public async exportTeamBookmarks(): Promise<void>
    {
        var workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        await TeamBookmarkService.exportBookmarks(this.bookmarkSections, workspaceRoot);
    }

    public async importTeamBookmarks(): Promise<void>
    {
        var workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        var importedSections = await TeamBookmarkService.importBookmarks(workspaceRoot);

        if (importedSections)
        {
            var action = await vscode.window.showInformationMessage(
                `Found ${importedSections.length} bookmark sections to import. This will replace your current bookmarks.`,
                'Replace Current', 'Cancel'
            );

            if (action == 'Replace Current')
            {
                this.bookmarkSections = importedSections;
                this.saveSections();
            }
        }
    }

    public async syncTeamBookmarks(): Promise<void>
    {
        var workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        var syncedSections = await TeamBookmarkService.syncWithTeam(this.bookmarkSections, workspaceRoot);

        if (syncedSections)
        {
            this.bookmarkSections = syncedSections;
            this.saveSections();
        }
    }

    public async injectTeamBookmarks(): Promise<void>
    {
        var configText = await vscode.window.showInputBox({
            placeHolder: 'Paste team bookmark configuration JSON here...',
            prompt: 'Inject team bookmarks by pasting the configuration JSON',
            ignoreFocusOut: true,
            value: ''
        });

        if (!configText || !configText.trim())
        {
            return;
        }

        var config = JSON.parse(configText);

        if (!config.sections || !Array.isArray(config.sections))
        {
            vscode.window.showErrorMessage('Invalid team bookmark configuration: missing sections array');
            return;
        }

        var workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        var sectionsToInject: BookmarkSection[];

        if (workspaceRoot)
        {
            sectionsToInject = config.sections.map((s: any) =>
            {
                var directories = (s.directories || []).map((dir: any) =>
                {
                    var gitInfo: any = undefined;
                    if (dir.gitInfo)
                    {
                        gitInfo = {
                            currentBranch: dir.gitInfo.currentBranch,
                            hasLocalChanges: dir.gitInfo.hasLocalChanges,
                            conflictStatus: dir.gitInfo.conflictStatus,
                            lastSync: dir.gitInfo.lastSync ? new Date(dir.gitInfo.lastSync) : undefined
                        };
                    }

                    var relatedPRs = [];
                    if (dir.relatedPRs && Array.isArray(dir.relatedPRs))
                    {
                        for (var i = 0; i < dir.relatedPRs.length; i++)
                        {
                            var pr = dir.relatedPRs[i];
                            var prWithDates = {
                                id: pr.id,
                                title: pr.title,
                                url: pr.url,
                                status: pr.status,
                                author: pr.author,
                                created: pr.created ? new Date(pr.created) : new Date(),
                                updated: pr.updated ? new Date(pr.updated) : new Date(),
                                targetBranch: pr.targetBranch,
                                sourceBranch: pr.sourceBranch
                            };
                            relatedPRs.push(prWithDates);
                        }
                    } else
                    {
                        relatedPRs = [];
                    }
                    return new TypedDirectory(
                        dir.path,
                        dir.type,
                        dir.tags,
                        dir.addedBy,
                        dir.dateAdded ? new Date(dir.dateAdded) : new Date(),
                        dir.aiSummary,
                        dir.lastSummaryUpdate ? new Date(dir.lastSummaryUpdate) : undefined,
                        dir.watchers,
                        dir.priority,
                        dir.status,
                        gitInfo,
                        relatedPRs,
                        dir.lastAccessed ? new Date(dir.lastAccessed) : undefined,
                        dir.accessCount
                    );
                });

                return new BookmarkSection(s.id, s.name, directories);
            });
        } else
        {
            sectionsToInject = config.sections.map((s: any) =>
            {
                var directories = (s.directories || []).map((dir: any) =>
                {
                    var gitInfo: any = undefined;
                    if (dir.gitInfo)
                    {
                        gitInfo = {
                            currentBranch: dir.gitInfo.currentBranch,
                            hasLocalChanges: dir.gitInfo.hasLocalChanges,
                            conflictStatus: dir.gitInfo.conflictStatus,
                            lastSync: dir.gitInfo.lastSync ? new Date(dir.gitInfo.lastSync) : undefined
                        };
                    }

                    var relatedPRs = (dir.relatedPRs || []).map((pr: any) =>
                    {
                        return {
                            id: pr.id,
                            title: pr.title,
                            url: pr.url,
                            status: pr.status,
                            author: pr.author,
                            created: pr.created ? new Date(pr.created) : new Date(),
                            updated: pr.updated ? new Date(pr.updated) : new Date(),
                            targetBranch: pr.targetBranch,
                            sourceBranch: pr.sourceBranch
                        };
                    });

                    return new TypedDirectory(
                        dir.path,
                        dir.type,
                        dir.tags,
                        dir.addedBy,
                        dir.dateAdded ? new Date(dir.dateAdded) : new Date(),
                        dir.aiSummary,
                        dir.lastSummaryUpdate ? new Date(dir.lastSummaryUpdate) : undefined,
                        dir.watchers,
                        dir.priority,
                        dir.status,
                        gitInfo,
                        relatedPRs,
                        dir.lastAccessed ? new Date(dir.lastAccessed) : undefined,
                        dir.accessCount
                    );
                });

                return new BookmarkSection(s.id, s.name, directories);
            });
        }

        var action = await vscode.window.showInformationMessage(
            `Found ${sectionsToInject.length} bookmark sections to inject. This will replace your current bookmarks.`,
            'Replace Current', 'Cancel'
        );

        if (action == 'Replace Current')
        {
            this.bookmarkSections = sectionsToInject;
            this.saveSections();
            vscode.window.showInformationMessage(`Successfully injected ${sectionsToInject.length} bookmark sections!`);
        }
    }

    private async directorySearch(uri: vscode.Uri): Promise<FileSystemObject[]>
    {
        var entries = await vscode.workspace.fs.readDirectory(uri);
        return entries
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map((item) =>
            {
                var [name, type] = item;
                var isDirectory =
                    type == vscode.FileType.Directory
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None;

                return new FileSystemObject(
                    name,
                    isDirectory,
                    vscode.Uri.file(path.join(uri.fsPath, name))
                );
            });
    }

    private createSectionEntries(): FileSystemObject[]
    {
        return this.bookmarkSections.map(section =>
        {
            var sectionItem = new FileSystemObject(
                `${section.name} (${section.directories.length})`,
                vscode.TreeItemCollapsibleState.Expanded,
                vscode.Uri.parse(`section://${section.id}`),
                section.id
            );
            sectionItem.setContextValue(this.sectionContextValue);
            return sectionItem;
        });
    }

    // TODO refactor promeniti nacin na koji se cuvaju pathovi
    private createDirectoryEntries(directories: TypedDirectory[], sectionId: string): FileSystemObject[]
    {
        var workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        return directories.map(dir =>
        {
            var absolutePath = dir.path;
            if (workspaceRoot && !path.isAbsolute(dir.path))
            {
                absolutePath = path.join(workspaceRoot, dir.path);
            }

            var file = vscode.Uri.file(absolutePath);

            var label = path.basename(absolutePath);
            var indicators: string[] = [];

            if (dir.aiSummary)
            {
                indicators.push('🤖');
            }
            if (dir.tags && dir.tags.length > 0)
            {
                indicators.push('🏷️');
            }

            if (indicators.length > 0)
            {
                label = `${label} ${indicators.join(' ')}`;
            }

            var item = new FileSystemObject(
                label,
                dir.type == vscode.FileType.File
                    ? vscode.TreeItemCollapsibleState.None
                    : vscode.TreeItemCollapsibleState.Collapsed,
                file,
                sectionId
            );

            var displayLabel = path.basename(dir.path);
            var visualIndicators = '';

            var tagDisplay = '';
            if (dir.tags && dir.tags.length > 0)
            {
                tagDisplay = dir.tags.map(tag => `[${tag}]`).join(' ') + ' ';
            }

            if (dir.priority == 'critical') visualIndicators += '🔥 ';
            else if (dir.priority == 'high') visualIndicators += '⚡ ';
            else if (dir.priority == 'low') visualIndicators += '⬇️ ';

            // status ikone
            if (dir.status == 'in-review') visualIndicators += '👀 ';
            else if (dir.status == 'completed') visualIndicators += '✅ ';
            else if (dir.status == 'archived') visualIndicators += '📦 ';

            if (dir.aiSummary) visualIndicators += '🤖 ';
            if (dir.watchers.length > 0) visualIndicators += `👁️${dir.watchers.length} `;
            if (dir.relatedPRs.length > 0) visualIndicators += `🔗${dir.relatedPRs.length} `;

            if (dir.gitInfo?.hasLocalChanges) visualIndicators += '🔄 ';
            if (dir.gitInfo?.conflictStatus == 'conflicts') visualIndicators += '⚠️ ';

            var enhancedLabel = tagDisplay + visualIndicators + displayLabel;
            (item as any).label = enhancedLabel;

            var tooltip = `📁 ${file.fsPath}`;

            if (dir.tags && dir.tags.length > 0)
            {
                tooltip += `\n 🏷️ Tags: ${dir.tags.join(', ')}`;
            }

            tooltip += `\n📊 Priority: ${dir.priority} | Status: ${dir.status}`;

            if (dir.addedBy)
            {
                tooltip += `\n👤 Added by: ${dir.addedBy}`;
            }

            if (dir.dateAdded)
            {
                tooltip += `\n📅 Added: ${dir.dateAdded.toLocaleDateString()}`;
            }

            if (dir.lastAccessed)
            {
                tooltip += `\n🕒 Last accessed: ${dir.lastAccessed.toLocaleDateString()}`;
            }

            if (dir.accessCount > 0)
            {
                tooltip += `\n📈 Access count: ${dir.accessCount}`;
            }

            if (dir.aiSummary)
            {
                tooltip += `\n🤖 AI Summary: ${dir.aiSummary.substring(0, 100)}...`;
            }

            if (dir.watchers.length > 0)
            {
                tooltip += `\n 👁️ Watchers: ${dir.watchers.join(', ')}`;
            }

            if (dir.relatedPRs.length > 0)
            {
                var prTitles = dir.relatedPRs.map(pr => `#${pr.id}: ${pr.title}`).join(', ');
                tooltip += `\n🔗 Related PRs: ${prTitles}`;
            }

            if (dir.gitInfo)
            {
                tooltip += `\n🌿 Git: ${dir.gitInfo.currentBranch || 'unknown'}`;
                if (dir.gitInfo.hasLocalChanges) tooltip += ' (modified)';
                if (dir.gitInfo.conflictStatus == 'conflicts') tooltip += ' ⚠️ Conflicts';
            }

            item.tooltip = tooltip;
            item.setContextValue(this.bookmarkedDirectoryContextValue);

            var description = '';
            if (dir.watchers.length > 0) description += `👁️${dir.watchers.length} `;
            if (dir.priority !== 'medium') description += `📊${dir.priority} `;

            if (description) item.description = description.trim();

            return item;
        });
    }

    private hydrateState(): void
    {
        this.saveWorkspaceSetting = vscode.workspace
            .getConfiguration(this.saveWorkspaceConfigurationSettingKey)
            .get(this.saveWorkspaceConfigurationSettingKey);

        var storedSections = this.workspaceRoot
            ? this.extensionContext.workspaceState.get(this.storedSectionsContextKey)
            : this.extensionContext.globalState.get(this.storedSectionsContextKey);

        //sekcijeee
        if (storedSections && Array.isArray(storedSections))
        {
            var workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
                ? this.workspaceRoot[0].uri.fsPath
                : undefined;

            this.bookmarkSections = storedSections.map((s: any) =>
            {
                var dirs = s.directories || [];
                var directories = dirs.map((dir: any) =>
                {
                    var bookmarkPath = dir.path;
                    if (workspaceRoot && path.isAbsolute(bookmarkPath))
                    {
                        bookmarkPath = path.relative(workspaceRoot, bookmarkPath);
                    }

                    var gitInfo: any = undefined;
                    if (dir.gitInfo)
                    {
                        gitInfo = {
                            currentBranch: dir.gitInfo.currentBranch,
                            hasLocalChanges: dir.gitInfo.hasLocalChanges,
                            conflictStatus: dir.gitInfo.conflictStatus,
                            lastSync: dir.gitInfo.lastSync ? new Date(dir.gitInfo.lastSync) : undefined
                        };
                    }

                    // Reconstruct PullRequestInfo with proper Date objects
                    var relatedPRs = (dir.relatedPRs || []).map((pr: any) =>
                    {
                        return {
                            id: pr.id,
                            title: pr.title,
                            url: pr.url,
                            status: pr.status,
                            author: pr.author,
                            created: pr.created ? new Date(pr.created) : new Date(),
                            updated: pr.updated ? new Date(pr.updated) : new Date(),
                            targetBranch: pr.targetBranch,
                            sourceBranch: pr.sourceBranch
                        };
                    });

                    var typedDir = new TypedDirectory(
                        bookmarkPath,
                        dir.type,
                        dir.tags,
                        dir.addedBy,
                        dir.dateAdded ? new Date(dir.dateAdded) : new Date(),
                        dir.aiSummary,
                        dir.lastSummaryUpdate ? new Date(dir.lastSummaryUpdate) : undefined,
                        dir.watchers,
                        dir.priority,
                        dir.status,
                        gitInfo,
                        relatedPRs,
                        dir.lastAccessed ? new Date(dir.lastAccessed) : undefined,
                        dir.accessCount
                    );
                    return typedDir;
                });

                return new BookmarkSection(s.id, s.name, directories);
            });
        } else
        {
            var oldBookmarks = this.workspaceRoot
                ? this.extensionContext.workspaceState.get(this.storedBookmarksContextKey)
                : this.extensionContext.globalState.get(this.storedBookmarksContextKey);

            if (oldBookmarks && Array.isArray(oldBookmarks) && oldBookmarks.length > 0)
            {
                var defaultSection = BookmarkSection.createDefault();

                var reconstructedBookmarks = oldBookmarks.map((dir: any) =>
                {
                    if (dir.path && dir.type !== undefined)
                    {
                        var gitInfo: any = undefined;
                        if (dir.gitInfo)
                        {
                            gitInfo = {
                                currentBranch: dir.gitInfo.currentBranch,
                                hasLocalChanges: dir.gitInfo.hasLocalChanges,
                                conflictStatus: dir.gitInfo.conflictStatus,
                                lastSync: dir.gitInfo.lastSync ? new Date(dir.gitInfo.lastSync) : undefined
                            };
                        }

                        var relatedPRs = (dir.relatedPRs || []).map((pr: any) =>
                        {
                            return {
                                id: pr.id,
                                title: pr.title,
                                url: pr.url,
                                status: pr.status,
                                author: pr.author,
                                created: pr.created ? new Date(pr.created) : new Date(),
                                updated: pr.updated ? new Date(pr.updated) : new Date(),
                                targetBranch: pr.targetBranch,
                                sourceBranch: pr.sourceBranch
                            };
                        });

                        return new TypedDirectory(
                            dir.path,
                            dir.type,
                            dir.tags,
                            dir.addedBy,
                            dir.dateAdded ? new Date(dir.dateAdded) : new Date(),
                            dir.aiSummary,
                            dir.lastSummaryUpdate ? new Date(dir.lastSummaryUpdate) : undefined,
                            dir.watchers,
                            dir.priority,
                            dir.status,
                            gitInfo,
                            relatedPRs,
                            dir.lastAccessed ? new Date(dir.lastAccessed) : undefined,
                            dir.accessCount
                        );
                    }
                    return dir;
                });

                defaultSection.directories = reconstructedBookmarks;
                this.bookmarkSections = [defaultSection];
                this.saveSections();

                // izbrisi stare bookmarks
                this.workspaceRoot
                    ? this.extensionContext.workspaceState.update(this.storedBookmarksContextKey, undefined)
                    : this.extensionContext.globalState.update(this.storedBookmarksContextKey, undefined);
            }
        }

        //mora barem jedna sekcija da postoji
        if (this.bookmarkSections.length == 0)
        {
            this.bookmarkSections.push(BookmarkSection.createDefault());
        }
    }

    // cuvaj u vscode storage
    private saveSections(): void
    {
        // save to workspace state if we have a workspace, otherwise global state
        this.workspaceRoot
            ? this.extensionContext.workspaceState.update(
                this.storedSectionsContextKey,
                this.bookmarkSections
            )
            : this.extensionContext.globalState.update(
                this.storedSectionsContextKey,
                this.bookmarkSections
            );
    }

    // TODO: ovo se poziva previse puta, optimizuj
    private findBookmarkByUri(uri: vscode.Uri): { section: BookmarkSection, bookmark: TypedDirectory } | null 
    {
        var workspaceRoot = this.workspaceRoot?.[0]?.uri.fsPath;

        // loop through all sections and find matching bookmark
        for (var section of this.bookmarkSections)
        {
            var bookmark = section.directories.find(d =>
            {
                if (workspaceRoot && !path.isAbsolute(d.path))
                {
                    var absolutePath = path.join(workspaceRoot, d.path);
                    return absolutePath == uri.fsPath;
                }
                return d.path == uri.fsPath;
            });

            if (bookmark)
            {
                return { section, bookmark };
            }
        }

        return null;
    }

    private findParentByUri(uri: vscode.Uri): { section: BookmarkSection, bookmark: TypedDirectory } | null
    {
        var workspaceRoot = this.workspaceRoot?.[0]?.uri.fsPath;

        for (var section of this.bookmarkSections)
        {
            var bookmark = section.directories.find(d =>
            {
                var bookmarkPath: string;

                if (workspaceRoot && !path.isAbsolute(d.path))
                {
                    bookmarkPath = path.join(workspaceRoot, d.path);
                }
                else
                {
                    bookmarkPath = d.path;
                }

                var relativePath = path.relative(bookmarkPath, uri.fsPath);
                return !relativePath.startsWith('..') && relativePath !== '';
            });

            if (bookmark)
            {
                return { section, bookmark };
            }
        }

        return null;
    }

    private findBookmarkOrParentByUri(uri: vscode.Uri): { section: BookmarkSection, bookmark: TypedDirectory } | null
    {
        var directMatch = this.findBookmarkByUri(uri);
        if (directMatch)
        {
            return directMatch;
        }

        return this.findParentByUri(uri);
    }

    private async getCurrUser(): Promise<string>
    {
        var gitService = this.getGitService();
        if (gitService)
        {
            return await gitService.getCurrentGitUser();
        }

        return vscode.env.machineId.substring(0, 8);
    }

    public async getTypedDirectoryForUri(uri: vscode.Uri): Promise<TypedDirectory | null>
    {
        var result = this.findBookmarkOrParentByUri(uri);
        return result ? result.bookmark : null;
    }

    public async saveItems(): Promise<void>
    {
        this.saveSections();
    }

    public async createPR(uri: vscode.Uri): Promise<void>
    {
        var workspaceFolder = this.workspaceRoot?.[0];
        if (!workspaceFolder)
        {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        var git = simpleGit(workspaceFolder.uri.fsPath);
        var status = await git.status();
        var currentBranch = status.current;

        if (!currentBranch)
        {
            vscode.window.showErrorMessage('Could not determine current branch');
            return;
        }

        var title = await vscode.window.showInputBox({
            prompt: 'Enter PR title',
            placeHolder: 'Fix: Update bookmark functionality'
        });

        if (!title) return; //mora prosledi sve

        var body = await vscode.window.showInputBox({
            prompt: 'Enter PR description',
            placeHolder: 'Describe your changes...'
        });

        var targetBranch = await vscode.window.showInputBox({
            prompt: 'Enter target branch',
            value: 'main',
            placeHolder: 'main'
        });

        if (!targetBranch) return; //mora i ovo prosledi

        //samo otvori stranicu za kreiranje pra, nemoj pametujes
        var repoUrl = await this.getRepoUrl();
        if (repoUrl)
        {
            var prUrl = `${repoUrl}/compare/${targetBranch}...${currentBranch}?quick_pull=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body || '')}`;
            vscode.env.openExternal(vscode.Uri.parse(prUrl));
        }
    }

    public async linkPR(uri: vscode.Uri, prUrl: string): Promise<void>
    {
        var result = this.findBookmarkOrParentByUri(uri);
        if (result)
        {
            // Parse PR info from URL
            var match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
            if (match)
            {
                var prNumber = match[3];
                var prInfo = {
                    id: parseInt(prNumber),
                    title: `PR #${prNumber}`,
                    url: prUrl,
                    status: 'open' as const,
                    author: 'unknown',
                    created: new Date(),
                    updated: new Date(),
                    targetBranch: 'main',
                    sourceBranch: 'feature'
                };

                result.bookmark.addRelatedPR(prInfo);
                this.saveSections();
                vscode.window.showInformationMessage(`Linked PR #${prNumber} to bookmark`);
            }
            else
            {
                vscode.window.showErrorMessage('Invalid GitHub PR URL');
            }
        }
    }

    // todo uros: ovo mozda treba pomeriti u novu klasu GitHubService
    public async showOnGitHub(uri: vscode.Uri): Promise<void>
    {
        try
        {
            var repoUrl = await this.getRepoUrl();
            if (repoUrl)
            {
                var workspaceFolder = this.workspaceRoot?.[0];
                if (workspaceFolder)
                {
                    var relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
                    var urlPath = relativePath.replace(/\\/g, '/');

                    var branch = 'master';
                    try
                    {
                        var git = simpleGit(workspaceFolder.uri.fsPath);

                        try
                        {
                            var remoteInfo = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
                            if (remoteInfo)
                            {
                                var match = remoteInfo.match(/refs\/remotes\/origin\/(.+)/);
                                if (match)
                                {
                                    branch = match[1].trim();
                                }
                            }
                        }
                        catch (remoteError)
                        {
                            var branches = await git.branch(['-r']);
                            var defaultBranch = branches.all.find((b: string) =>
                                b.includes('origin/master') || b.includes('origin/main')
                            );
                            if (defaultBranch)
                            {
                                // master vs main ahahahah
                                branch = defaultBranch.includes('master') ? 'master' : 'main';
                            }
                        }
                    }
                    catch (gitError)
                    {
                        console.warn('Could not determine branch, using master:', gitError);
                        branch = 'master';
                    }

                    var githubUrl = `${repoUrl}/blob/${branch}/${urlPath}`;
                    vscode.env.openExternal(vscode.Uri.parse(githubUrl));
                }
                else
                {
                    vscode.env.openExternal(vscode.Uri.parse(repoUrl));
                }
            }
            else
            {
                vscode.window.showErrorMessage('Could not determine GitHub repository URL');
            }
        }
        catch (error)
        {
            vscode.window.showErrorMessage(`Error opening on GitHub: ${error}`);
        }
    }

    private async getRepoUrl(): Promise<string | null>
    {
        var workspaceFolder = this.workspaceRoot?.[0];
        if (!workspaceFolder) return null;

        var git = simpleGit(workspaceFolder.uri.fsPath);
        var remotes = await git.getRemotes(true);
        var origin = remotes.find((r: any) => r.name == 'origin');

        if (origin && origin.refs.fetch)
        {
            // Convert SSH to HTTPS URL if needed
            var url = origin.refs.fetch;
            if (url.startsWith('git@github.com:'))
            {
                url = url.replace('git@github.com:', 'https://github.com/');
            }
            if (url.endsWith('.git'))
            {
                url = url.slice(0, -4);
            }
            return url;
        }

        return null;
    }

    private async handleDiffOption(uri: vscode.Uri, gitService: GitService, option: string, currentBranch: string): Promise<void>
    {
        var workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot) return;

        var absolutePath = uri.fsPath;

        console.log('Git diff requested for:', {
            fileName: path.basename(absolutePath),
            workspaceRoot: path.basename(workspaceRoot),
            isWithinWorkspace: !path.relative(workspaceRoot, absolutePath).startsWith('..')
        });

        try
        {
            switch (option)
            {
                case 'working':
                    await this.showWorkingDirectoryDiff(gitService, absolutePath);
                    break;
                case 'remote':
                    await this.showRemoteDiff(gitService, absolutePath, currentBranch);
                    break;
                case 'branches':
                    await this.showBranchDiff(gitService, absolutePath);
                    break;
                case 'history':
                    await this.showFileHistory(gitService, absolutePath);
                    break;
            }
        }
        catch (error)
        {
            vscode.window.showErrorMessage(`Error showing git diff: ${error}`);
        }
    }

    private async showWorkingDirectoryDiff(gitService: GitService, absolutePath: string): Promise<void>
    {
        var diff = await gitService.getWorkingDirChanges(absolutePath);

        if (diff && diff.startsWith('Error:'))
        {
            vscode.window.showErrorMessage(diff);
            return;
        }

        if (!diff || diff.trim() == '')
        {
            vscode.window.showInformationMessage('No uncommitted changes found for this file.');
            return;
        }

        await this.presentDiffOptions(diff, path.basename(absolutePath), 'Working Directory vs HEAD', absolutePath, 'working');
    }

    private async showRemoteDiff(gitService: GitService, absolutePath: string, currentBranch: string): Promise<void>
    {
        var remoteBranch = `origin/${currentBranch}`;
        var diff = await gitService.compareWithRemote(currentBranch, remoteBranch, absolutePath);

        if (!diff || diff.trim() == '')
        {
            vscode.window.showInformationMessage('No differences found between local and remote for this file.');
            return;
        }

        await this.presentDiffOptions(diff, path.basename(absolutePath), `Local vs ${remoteBranch}`, absolutePath, 'remote', remoteBranch);
    }

    // todo uros mozda dodati opciju za 3 way merge?
    private async showBranchDiff(gitService: GitService, absolutePath: string): Promise<void>
    {
        var branches = await gitService.getAllBranches();
        var branchNames = branches.map(b => b.name).filter(name => !name.startsWith('remotes/'));

        if (branchNames.length < 2)
        {
            vscode.window.showInformationMessage('Need at least 2 branches to compare.');
            return;
        }

        var branch1 = await vscode.window.showQuickPick(branchNames, {
            placeHolder: 'Select first branch'
        });
        if (!branch1) return;

        var branch2 = await vscode.window.showQuickPick(
            branchNames.filter(name => name !== branch1),
            { placeHolder: 'Select second branch' }
        );
        if (!branch2) return;

        var diff = await gitService.compareBranches(branch1, branch2, absolutePath);

        if (!diff || diff.trim() == '')
        {
            vscode.window.showInformationMessage(`No differences found between ${branch1} and ${branch2} for this file.`);
            return;
        }

        await this.presentDiffOptions(diff, path.basename(absolutePath), `${branch1} vs ${branch2}`, absolutePath);
    }

    private async showFileHistory(gitService: GitService, absolutePath: string): Promise<void>
    {
        var history = await gitService.getFileHistory(absolutePath, 10);

        if (history.commits.length == 0)
        {
            vscode.window.showInformationMessage('No commit history found for this file.');
            return;
        }

        var commitItems = history.commits.map(commit => ({
            label: commit.message.split('\n')[0], // First line of commit message
            description: `${commit.author} - ${commit.date.toLocaleDateString()}`,
            detail: commit.hash.substring(0, 8),
            commit
        }));

        var selectedCommit = await vscode.window.showQuickPick(commitItems, {
            placeHolder: 'Select a commit to compare with current version'
        });

        if (!selectedCommit) return;

        var diff = await gitService.getFileChanges(absolutePath, selectedCommit.commit.hash, 'HEAD');

        if (!diff || diff.trim() == '')
        {
            vscode.window.showInformationMessage('No differences found with the selected commit.');
            return;
        }

        await this.presentDiffOptions(diff, path.basename(absolutePath), `Current vs ${selectedCommit.commit.hash.substring(0, 8)}`, absolutePath);
    }

    private async presentDiffOptions(diff: string, fileName: string, compareInfo: string, absolutePath?: string, diffType?: string, remoteBranch?: string): Promise<void>
    {
        if (absolutePath)
        {
            await this.showSideBySideDiff(absolutePath, compareInfo, diffType, remoteBranch);
        }
        else
        {
            await this.showDiffInEditor(diff, fileName, compareInfo);
        }

        var action = await vscode.window.showInformationMessage(
            `Git diff: ${compareInfo}`,
            'View Raw Diff', 'AI Summarize Diff', 'Close'
        );

        switch (action)
        {
            case 'View Raw Diff':
                await this.showDiffInEditor(diff, fileName, compareInfo);
                break;
            case 'AI Summarize Diff':
                await this.generateAIDiffSummary(diff, fileName, compareInfo);
                break;
        }
    }

    private async showSideBySideDiff(absolutePath: string, compareInfo: string, diffType?: string, remoteBranch?: string): Promise<void>
    {
        var workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot) 
        {
            vscode.window.showErrorMessage('No workspace found for diff comparison.');
            return;
        }

        try
        {
            var relativePath = path.relative(workspaceRoot, absolutePath);
            var normalizedPath = relativePath.replace(/\\/g, '/');

            var compareRef = 'HEAD';
            var compareLabel = 'HEAD';

            if (diffType == 'remote' && remoteBranch)
            {
                compareRef = remoteBranch;
                compareLabel = remoteBranch;
            }

            var git = simpleGit(workspaceRoot);
            var compareContent = await git.show([`${compareRef}:${normalizedPath}`]);

            var compareUri = vscode.Uri.parse(`git-diff:${path.basename(absolutePath)} (${compareLabel}).${path.extname(absolutePath)}`).with({
                scheme: 'git-diff',
                query: Buffer.from(compareContent).toString('base64')
            });

            var disposable = vscode.workspace.registerTextDocumentContentProvider('git-diff', {
                provideTextDocumentContent(uri: vscode.Uri): string
                {
                    return Buffer.from(uri.query, 'base64').toString('utf-8');
                }
            });

            var currentUri = vscode.Uri.file(absolutePath);

            await vscode.commands.executeCommand(
                'vscode.diff',
                compareUri,
                currentUri,
                `${path.basename(absolutePath)} (${compareLabel} ↔ Working Tree)`
            );

            setTimeout(() => disposable.dispose(), 1000);
        } catch (error)
        {
            console.error('Side-by-side diff failed:', error);

            try
            {
                var fileUri = vscode.Uri.file(absolutePath);
                await vscode.commands.executeCommand('git.openChange', fileUri);
            } catch (altError)
            {
                vscode.window.showErrorMessage(`Could not open diff view: ${error}`);
            }
        }
    }

    private async handleCherryPickOption(uri: vscode.Uri, gitService: GitService, sourceBranch: string, option: string): Promise<void>
    {
        var absolutePath = uri.fsPath;

        try
        {
            switch (option)
            {
                case 'file':
                    await this.showFileCommitsForCherryPick(gitService, sourceBranch, absolutePath);
                    break;
                case 'commits':
                    await this.showBranchCommitsForCherryPick(gitService, sourceBranch);
                    break;
            }
        }
        catch (error)
        {
            vscode.window.showErrorMessage(`Error during cherry-pick: ${error}`);
        }
    }

    private async showFileCommitsForCherryPick(gitService: GitService, sourceBranch: string, absolutePath: string): Promise<void>
    {
        var commits = await gitService.getCommitsFromBranch(sourceBranch, absolutePath, 20);

        if (commits.length == 0)
        {
            vscode.window.showInformationMessage(`No commits found for this file in branch '${sourceBranch}'.`);
            return;
        }

        var commitItems = commits.map(commit => ({
            label: `${commit.hash.substring(0, 8)} - ${commit.message.split('\n')[0]}`,
            description: `${commit.author}  :  ${commit.date.toLocaleDateString()}`,
            detail: commit.message.length > 50 ? commit.message.substring(0, 50) + '...' : commit.message,
            commit
        }));

        var selectedCommits = await vscode.window.showQuickPick(commitItems, {
            placeHolder: `Select commits to cherry-pick for ${path.basename(absolutePath)}`,
            canPickMany: true
        });

        if (!selectedCommits || selectedCommits.length == 0) return;

        var commitMessages = '';
        for (var i = 0; i < selectedCommits.length; i++)
        {
            var shortHash = selectedCommits[i].commit.hash.substring(0, 8);
            var msg = selectedCommits[i].commit.message.split('\n')[0];
            commitMessages += shortHash + ': ' + msg;
            if (i < selectedCommits.length - 1)
            {
                commitMessages += '\n';
            }
        }

        var confirmation = await vscode.window.showWarningMessage(
            `Cherry-pick ${selectedCommits.length} commit(s) for file '${path.basename(absolutePath)}'?\n\n${commitMessages}`,
            'Yes, Cherry-pick', 'Cancel'
        );

        if (confirmation !== 'Yes, Cherry-pick') return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Cherry-picking file changes...",
            cancellable: false
        }, async (progress) =>
        {
            var results: string[] = [];

            for (var i = 0; i < selectedCommits!.length; i++)
            {
                var commit = selectedCommits![i].commit;
                progress.report({
                    increment: (100 / selectedCommits!.length),
                    message: `Processing commit ${i + 1}/${selectedCommits!.length}: ${commit.hash.substring(0, 8)}`
                });

                var result = await gitService.cherrypickCommit(commit.hash, absolutePath);
                results.push(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
            }


            var successCount = results.filter(r => r.startsWith('✓')).length;
            var failureCount = results.filter(r => r.startsWith('✗')).length;

            var resultMessage = `Cherry-pick completed!\n\n Success: ${successCount}\n❌ Failed: ${failureCount}\n\nDetails:\n${results.join('\n')}`;

            if (failureCount == 0)
            {
                vscode.window.showInformationMessage('All cherry-picks completed successfully!')
                    .then(() => this.showDetailedResults(resultMessage));
            }
            else
            {
                vscode.window.showWarningMessage(`Cherry-pick completed with ${failureCount} failures`)
                    .then(() => this.showDetailedResults(resultMessage));
            }
        });
    }

    // TODO: napraviti unified view za results umesto ovako
    private async showBranchCommitsForCherryPick(gitService: GitService, sourceBranch: string): Promise<void>
    {
        var commits = await gitService.getCommitsFromBranch(sourceBranch, undefined, 20);

        if (commits.length == 0)
        {
            vscode.window.showInformationMessage(`No commits found in branch '${sourceBranch}'.`);
            return;
        }

        var commitItems = commits.map(commit => ({
            label: `${commit.hash.substring(0, 8)} - ${commit.message.split('\n')[0]}`,
            description: `${commit.author}  :  ${commit.date.toLocaleDateString()}`,
            detail: `Files: ${commit.files.length > 0 ? commit.files.join(', ') : 'N/A'}`,
            commit
        }));

        var cherryPickType = await vscode.window.showQuickPick([
            {
                label: 'Select Individual Commits',
                description: 'Choose specific commits to cherry-pick',
                option: 'individual'
            },
            {
                label: 'Select Commit Range',
                description: 'Cherry-pick a range of commits',
                option: 'range'
            }
        ], {
            placeHolder: 'Choose cherry-pick method'
        });

        if (!cherryPickType) return;

        if (cherryPickType.option == 'individual')
        {
            await this.handleIndividualCommitCherryPick(gitService, commitItems);
        }
        else
        {
            await this.handleRangeCommitCherryPick(gitService, commitItems);
        }
    }

    private async handleIndividualCommitCherryPick(gitService: GitService, commitItems: any[]): Promise<void>
    {
        var selectedCommits = await vscode.window.showQuickPick(commitItems, {
            placeHolder: 'Select commits to cherry-pick',
            canPickMany: true
        });

        if (!selectedCommits || selectedCommits.length == 0) return;

        var commitMessages = '';
        for (var j = 0; j < selectedCommits.length; j++)
        {
            var hash = selectedCommits[j].commit.hash.substring(0, 8);
            var firstLine = selectedCommits[j].commit.message.split('\n')[0];
            commitMessages = commitMessages + ' :  ' + hash + ': ' + firstLine;
            if (j != selectedCommits.length - 1)
            {
                commitMessages = commitMessages + '\n';
            }
        }

        var confirmation = await vscode.window.showWarningMessage(
            `Cherry-pick ${selectedCommits.length} commit(s)?\n\n${commitMessages}`,
            'Yes, Cherry-pick', 'Cancel'
        );

        if (confirmation !== 'Yes, Cherry-pick') return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Cherry-picking commits...",
            cancellable: false
        }, async (progress) =>
        {
            var results: string[] = [];

            for (var i = 0; i < selectedCommits!.length; i++)
            {
                var commit = selectedCommits![i].commit;
                progress.report({
                    increment: (100 / selectedCommits!.length),
                    message: `Processing commit ${i + 1}/${selectedCommits!.length}: ${commit.hash.substring(0, 8)}`
                });

                var result = await gitService.cherrypickCommit(commit.hash);
                results.push(result.success ? ` ${result.message}` : ` ${result.message}`);

                if (!result.success && result.message.includes('conflict'))
                {
                    var action = await vscode.window.showErrorMessage(
                        `Cherry-pick conflict detected on commit ${commit.hash.substring(0, 8)}. What would you like to do?`,
                        'Abort Cherry-pick', 'Continue Manually', 'Skip This Commit'
                    );

                    if (action == 'Abort Cherry-pick')
                    {
                        await gitService.stopCherrypick();
                        results.push('Cherry-pick aborted by user');
                        break;
                    }
                    else if (action == 'Continue Manually')
                    {
                        vscode.window.showInformationMessage('Please resolve conflicts manually, then run "git cherry-pick --continue"');
                        break;
                    }
                }
            }

            this.showDetailedResults(`Cherry-pick Results:\n\n${results.join('\n')}`);
        });
    }




    private async handleRangeCommitCherryPick(gitService: GitService, commitItems: any[]): Promise<void>
    {
        var fromCommit = await vscode.window.showQuickPick(commitItems, {
            placeHolder: 'Select starting commit (older)'
        });

        if (!fromCommit) return;

        var toCommits = commitItems.filter(item => item.commit.hash !== fromCommit.commit.hash);
        var toCommit = await vscode.window.showQuickPick(toCommits, {
            placeHolder: 'Select ending commit (newer)'
        });

        if (!toCommit) return;

        var confirmation = await vscode.window.showWarningMessage(
            `Cherry-pick commit range ${fromCommit.commit.hash.substring(0, 8)}..${toCommit.commit.hash.substring(0, 8)}?`,
            'Yes, Cherry-pick Range', 'Cancel'
        );

        if (confirmation !== 'Yes, Cherry-pick Range') return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Cherry-picking commit range...",
            cancellable: false
        }, async () =>
        {
            var result = await gitService.cherrypickRange(fromCommit.commit.hash, toCommit.commit.hash);

            if (result.success)
            {
                vscode.window.showInformationMessage(result.message);
            }
            else
            {
                vscode.window.showErrorMessage(result.message);
            }
        });
    }

    private async showDetailedResults(message: string): Promise<void>
    {
        var doc = await vscode.workspace.openTextDocument({
            content: message,
            language: 'plaintext'
        });

        await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: false
        });
    }
}

