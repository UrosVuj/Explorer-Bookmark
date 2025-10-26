import * as vscode from "vscode";
import * as path from "path";
import { BookmarkSection } from "../types/BookmarkSection";
import { TypedDirectory } from "../types/TypedDirectory";

export interface TeamBookmarkConfig
{
    version: string;
    lastUpdated: Date;
    updatedBy: string;
    sections: BookmarkSection[];
}

export class TeamBookmarkService
{
    public static async exportBookmarks(sections: BookmarkSection[], workspaceRoot?: string): Promise<void>
    {
        if (!workspaceRoot)
        {
            await this.exportToFile(sections);
            return;
        }

        var sectionsWithRelativePaths = this.convertToRelativePaths(sections, workspaceRoot);

        var config: TeamBookmarkConfig = {
            version: '1.0.0',
            lastUpdated: new Date(),
            updatedBy: vscode.env.machineId,
            sections: sectionsWithRelativePaths
        };

        var bookmarkFileName = '.vscode/team-bookmarks.json';
        var bookmarkFilePath = path.join(workspaceRoot, bookmarkFileName);
        var configJson = JSON.stringify(config, null, 2);

        var vscodeDirPath = path.join(workspaceRoot, '.vscode');
        var vscodeDirUri = vscode.Uri.file(vscodeDirPath);

        try
        {
            await vscode.workspace.fs.stat(vscodeDirUri);
        } catch
        {
            await vscode.workspace.fs.createDirectory(vscodeDirUri);
        }

        var fileUri = vscode.Uri.file(bookmarkFilePath);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(configJson, 'utf8'));

        vscode.window.showInformationMessage(
            'Team bookmarks exported to ' + bookmarkFileName,
            'Open File'
        ).then(action =>
        {
            if (action == 'Open File')
            {
                vscode.commands.executeCommand('vscode.open', fileUri);
            }
        });
    }

    public static async importBookmarks(workspaceRoot?: string): Promise<BookmarkSection[] | null>
    {
        var fileUri: vscode.Uri;

        if (workspaceRoot)
        {
            var bookmarkFileName = '.vscode/team-bookmarks.json';
            var bookmarkFilePath = path.join(workspaceRoot, bookmarkFileName);
            fileUri = vscode.Uri.file(bookmarkFilePath);

            try
            {
                await vscode.workspace.fs.stat(fileUri);
            } catch
            {
                return await this.importFromFile();
            }
        }
        else
        {
            return await this.importFromFile();
        }

        var content = await vscode.workspace.fs.readFile(fileUri);
        var configJson = Buffer.from(content).toString('utf8');
        var config: TeamBookmarkConfig = JSON.parse(configJson);

        var isCompatible = this.isVersionCompatible(config.version);
        if (!isCompatible)
        {
            var msg = 'Bookmark file version ' + config.version + ' may not be fully compatible with current version 1.0.0';
            vscode.window.showWarningMessage(msg);
        }

        // konvertuj u absolute paths
        var sectionsWithAbsolutePaths = this.convertToAbsolutePaths(config.sections, workspaceRoot);

        var count = sectionsWithAbsolutePaths.length;
        vscode.window.showInformationMessage(
            'Imported ' + count + ' bookmark sections from team configuration'
        );

        return sectionsWithAbsolutePaths;
    }

    public static async syncWithTeam(currentSections: BookmarkSection[], workspaceRoot?: string): Promise<BookmarkSection[] | null>
    {
        if (!workspaceRoot)
        {
            vscode.window.showWarningMessage('Team sync requires a workspace');
            return null;
        }

        var bookmarkFileName = '.vscode/team-bookmarks.json';
        var bookmarkFilePath = path.join(workspaceRoot, bookmarkFileName);
        var fileUri = vscode.Uri.file(bookmarkFilePath);

        try
        {
            await vscode.workspace.fs.stat(fileUri);
        } catch
        {
            vscode.window.showInformationMessage(
                'No team bookmark file found. Would you like to create one?',
                'Create', 'Cancel'
            ).then(action =>
            {
                if (action == 'Create')
                {
                    this.exportBookmarks(currentSections, workspaceRoot);
                }
            });
            return null;
        }

        var content = await vscode.workspace.fs.readFile(fileUri);
        var configJson = Buffer.from(content).toString('utf8');
        var remoteConfig: TeamBookmarkConfig = JSON.parse(configJson);

        var updatedBy = remoteConfig.updatedBy;
        var lastUpdated = new Date(remoteConfig.lastUpdated).toLocaleString();
        var msg = 'Team bookmarks were last updated by ' + updatedBy + ' on ' + lastUpdated;

        var action = await vscode.window.showInformationMessage(
            msg,
            'Merge with Local', 'Replace Local', 'Update Team', 'Cancel'
        );

        if (action == 'Merge with Local')
        {
            var remoteSectionsAbsolute = this.convertToAbsolutePaths(remoteConfig.sections, workspaceRoot);
            return this.merge(currentSections, remoteSectionsAbsolute);
        }
        else if (action == 'Replace Local')
        {
            return this.convertToAbsolutePaths(remoteConfig.sections, workspaceRoot);
        }
        else if (action == 'Update Team')
        {
            await this.exportBookmarks(currentSections, workspaceRoot);
            return currentSections;
        }
        else
        {
            return null;
        }
    }

    private static async exportToFile(sections: BookmarkSection[]): Promise<void>
    {
        var config: TeamBookmarkConfig = {
            version: '1.0.0',
            lastUpdated: new Date(),
            updatedBy: vscode.env.machineId,
            sections: sections
        };

        var configJson = JSON.stringify(config, null, 2);

        var fileUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('team-bookmarks.json'),
            filters: {
                'JSON Files': ['json']
            }
        });

        if (fileUri)
        {
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(configJson, 'utf8'));
            vscode.window.showInformationMessage('Team bookmarks exported successfully');
        }
    }

    private static async importFromFile(): Promise<BookmarkSection[] | null>
    {
        var fileUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'JSON Files': ['json']
            }
        });

        if (!fileUris || fileUris.length == 0)
        {
            return null;
        }

        var content = await vscode.workspace.fs.readFile(fileUris[0]);
        var configJson = Buffer.from(content).toString('utf8');
        var config: TeamBookmarkConfig = JSON.parse(configJson);

        // probaj da nadjes workspace root
        var workspaceRoot = undefined;
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
        {
            workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }

        if (workspaceRoot)
        {
            return this.convertToAbsolutePaths(config.sections, workspaceRoot);
        }
        else
        {
            vscode.window.showWarningMessage('No workspace detected. Bookmark paths will be used as-is.');

            var sections: BookmarkSection[] = [];
            for (var i = 0; i < config.sections.length; i++)
            {
                var s = config.sections[i];
                var section = new BookmarkSection(s.id, s.name, s.directories);
                sections.push(section);
            }
            return sections;
        }
    } private static merge(local: BookmarkSection[], remote: BookmarkSection[]): BookmarkSection[]
    {
        var merged: BookmarkSection[] = [];
        for (var i = 0; i < local.length; i++)
        {
            merged.push(local[i]);
        }

        for (var i = 0; i < remote.length; i++)
        {
            var remoteSection = remote[i];
            var existingSection = null;

            for (var j = 0; j < merged.length; j++)
            {
                if (merged[j].id == remoteSection.id)
                {
                    existingSection = merged[j];
                    break;
                }
            }

            if (existingSection)
            {
                for (var k = 0; k < remoteSection.directories.length; k++)
                {
                    var remoteDir = remoteSection.directories[k];
                    var exists = false;

                    for (var m = 0; m < existingSection.directories.length; m++)
                    {
                        if (existingSection.directories[m].path == remoteDir.path)
                        {
                            exists = true;
                            break;
                        }
                    }

                    if (!exists)
                    {
                        existingSection.directories.push(remoteDir);
                    }
                }
            }
            else
            {
                var newSection = new BookmarkSection(remoteSection.id, remoteSection.name, remoteSection.directories);
                merged.push(newSection);
            }
        }

        return merged;
    }

    private static isVersionCompatible(version: string): boolean
    {
        var parts = version.split('.');
        var major = parts[0];

        var currentParts = '1.0.0'.split('.');
        var currentMajor = currentParts[0];

        return major == currentMajor;
    } public static async watchForTeamChanges(workspaceRoot: string, callback: () => void): Promise<vscode.Disposable>
    {
        var bookmarkFileName = '.vscode/team-bookmarks.json';
        var bookmarkFilePath = path.join(workspaceRoot, bookmarkFileName);
        var fileUri = vscode.Uri.file(bookmarkFilePath);

        var watcher = vscode.workspace.createFileSystemWatcher(fileUri.fsPath);

        watcher.onDidChange(() =>
        {
            vscode.window.showInformationMessage(
                'Team bookmarks have been updated by another team member',
                'Sync Now', 'Later'
            ).then(action =>
            {
                if (action == 'Sync Now')
                {
                    callback();
                }
            });
        });

        return watcher;
    }

    public static convertToRelativePaths(sections: BookmarkSection[], workspaceRoot: string): BookmarkSection[]
    {
        var result: BookmarkSection[] = [];

        for (var i = 0; i < sections.length; i++)
        {
            var section = sections[i];
            var relativeDirs: TypedDirectory[] = [];

            for (var j = 0; j < section.directories.length; j++)
            {
                var dir = section.directories[j];
                var relativePath = path.relative(workspaceRoot, dir.path);

                var newDir = new TypedDirectory(
                    relativePath,
                    dir.type,
                    dir.tags,
                    dir.addedBy,
                    dir.dateAdded,
                    dir.aiSummary,
                    dir.lastSummaryUpdate
                );

                relativeDirs.push(newDir);
            }

            var newSection = new BookmarkSection(section.id, section.name);
            newSection.directories = relativeDirs;
            result.push(newSection);
        }

        return result;
    }

    public static convertToAbsolutePaths(sections: BookmarkSection[], workspaceRoot: string): BookmarkSection[]
    {
        var result: BookmarkSection[] = [];

        for (var i = 0; i < sections.length; i++)
        {
            var section = sections[i];
            var absoluteDirs: TypedDirectory[] = [];

            for (var j = 0; j < section.directories.length; j++)
            {
                var dir = section.directories[j];

                // proveri da li je vec absolute
                var absolutePath = '';
                if (path.isAbsolute(dir.path))
                {
                    absolutePath = dir.path;
                }
                else
                {
                    absolutePath = path.resolve(workspaceRoot, dir.path);
                }

                var newDir = new TypedDirectory(
                    absolutePath,
                    dir.type,
                    dir.tags,
                    dir.addedBy,
                    dir.dateAdded ? new Date(dir.dateAdded) : new Date(),
                    dir.aiSummary,
                    dir.lastSummaryUpdate ? new Date(dir.lastSummaryUpdate) : undefined,
                    dir.watchers,
                    dir.priority,
                    dir.status,
                    dir.gitInfo,
                    dir.relatedPRs,
                    dir.lastAccessed ? new Date(dir.lastAccessed) : undefined,
                    dir.accessCount
                );

                absoluteDirs.push(newDir);
            }

            var newSection = new BookmarkSection(section.id, section.name);
            newSection.directories = absoluteDirs;
            result.push(newSection);
        }

        return result;
    }
}
