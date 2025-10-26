import * as vscode from 'vscode';
import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import { GitInfo } from '../types/TypedDirectory';

export interface BranchInfo
{
    name: string;
    current: boolean;
    commit: string;
    remote?: string;
    ahead?: number;
    behind?: number;
}

export interface CommitInfo
{
    hash: string;
    message: string;
    author: string;
    date: Date;
    files: string[];
}

export interface FileHistory
{
    file: string;
    commits: CommitInfo[];
}

export class GitService
{
    private git: SimpleGit;
    private workspaceRoot: string;

    constructor(workspaceRoot: string)
    {
        this.workspaceRoot = workspaceRoot;
        this.git = simpleGit(workspaceRoot);
    }

    async getCurrentBranch(): Promise<string>
    {
        var status = await this.git.status();
        if (status.current)
        {
            return status.current;
        }
        return 'unknown';
    }

    async getAllBranches(): Promise<BranchInfo[]>
    {
        var branches = await this.git.branch(['-a']);
        var branchInfo: BranchInfo[] = [];

        for (var branch of branches.all)
        {
            var commit = await this.git.revparse([branch]);

            var isRemote = branch.startsWith('remotes/');

            branchInfo.push({
                name: branch,
                current: branches.current == branch,
                commit: commit.trim(),
                remote: isRemote ? branch : undefined
            });
        }

        return branchInfo;
    }

    // file history and changes
    async getFileHistory(filePath: string, maxCount: number = 20): Promise<FileHistory>
    {
        var normalizedWorkspace = path.resolve(this.workspaceRoot);
        var normalizedFile = path.resolve(filePath);
        var relativePath = path.relative(normalizedWorkspace, normalizedFile);

        var log = await this.git.log(['--max-count=' + maxCount, '--', relativePath]);

        var commits: CommitInfo[] = [];
        for (var i = 0; i < log.all.length; i++)
        {
            var commit = log.all[i];
            var files: string[] = [];
            if (commit.diff && commit.diff.files)
            {
                for (var j = 0; j < commit.diff.files.length; j++)
                {
                    files.push(commit.diff.files[j].file);
                }
            }

            commits.push({
                hash: commit.hash,
                message: commit.message,
                author: commit.author_name,
                date: new Date(commit.date),
                files: files
            });
        }

        return {
            file: relativePath,
            commits: commits
        };
    }

    async getFileChanges(filePath: string, fromCommit?: string, toCommit?: string): Promise<string>
    {
        var normalizedWorkspace = path.resolve(this.workspaceRoot);
        var normalizedFile = path.resolve(filePath);
        var relativePath = path.relative(normalizedWorkspace, normalizedFile);

        var range = '';
        if (fromCommit && toCommit)
        {
            range = fromCommit + '..' + toCommit;
        }
        else if (fromCommit)
        {
            range = fromCommit + '..HEAD';
        }
        else
        {
            range = 'HEAD~1..HEAD';
        }

        var diff = await this.git.diff([range, '--', relativePath]);
        return diff;
    }

    async getWorkingDirectoryChanges(filePath?: string): Promise<string>
    {
        var args = [];
        if (filePath)
        {
            var normalizedWorkspace = path.resolve(this.workspaceRoot);
            var normalizedFile = path.resolve(filePath);
            var relativePath = path.relative(normalizedWorkspace, normalizedFile);
            args.push('--', relativePath);
        }

        var diff = await this.git.diff(args);
        return diff;
    }

    async compareWithRemote(localBranch?: string, remoteBranch?: string, filePath?: string): Promise<string>
    {
        var current = localBranch;
        if (!current)
        {
            current = await this.getCurrentBranch();
        }

        var remote = remoteBranch;
        if (!remote)
        {
            remote = 'origin/' + current;
        }

        var args = [remote + '..' + current];

        if (filePath)
        {
            var normalizedWorkspace = path.resolve(this.workspaceRoot);
            var normalizedFile = path.resolve(filePath);
            var relativePath = path.relative(normalizedWorkspace, normalizedFile);
            args.push('--', relativePath);
        }

        var diff = await this.git.diff(args);
        return diff;
    }

    async compareBranches(branch1: string, branch2: string, filePath?: string): Promise<string>
    {
        var args = [branch1 + '..' + branch2];

        if (filePath)
        {
            var normalizedWorkspace = path.resolve(this.workspaceRoot);
            var normalizedFile = path.resolve(filePath);
            var relativePath = path.relative(normalizedWorkspace, normalizedFile);
            args.push('--', relativePath);
        }

        var diff = await this.git.diff(args);
        return diff;
    }

    async fetch(): Promise<boolean>
    {
        await this.git.fetch();
        return true;
    }

    async pull(): Promise<boolean>
    {
        await this.git.pull();
        return true;
    }

    async rebase(branch: string): Promise<{ success: boolean, message: string }>
    {
        try
        {
            await this.git.rebase([branch]);
            var msg = 'Successfully rebased onto ' + branch;
            return {
                success: true,
                message: msg
            };
        } catch (error: any)
        {
            // Check if it's a conflict
            var isConflict = false;
            if (error.message && error.message.includes('conflict'))
            {
                isConflict = true;
            }

            if (isConflict)
            {
                return {
                    success: false,
                    message: 'Rebase conflict detected. Please resolve conflicts manually.'
                };
            }

            var errorMsg = 'Failed to rebase: ' + error.message;
            return {
                success: false,
                message: errorMsg
            };
        }
    }

    async stageCommitAndPushFiles(filePaths: string[], commitMessage: string): Promise<{ success: boolean, message: string }>
    {
        var relativePaths: string[] = [];

        for (var filePath of filePaths)
        {
            var normalizedWorkspace = path.resolve(this.workspaceRoot);
            var normalizedFile = path.resolve(filePath);
            var relativePath = path.relative(normalizedWorkspace, normalizedFile);
            relativePaths.push(relativePath);
        }

        var status = await this.git.status();
        var filesToStage: string[] = [];

        for (var i = 0; i < relativePaths.length; i++)
        {
            var relativePath = relativePaths[i];
            var normalizedPath = relativePath.replace(/\\/g, '/');

            var hasChanges = false;
            if (status.modified.includes(normalizedPath)) hasChanges = true;
            if (status.not_added.includes(normalizedPath)) hasChanges = true;
            if (status.deleted.includes(normalizedPath)) hasChanges = true;
            if (status.created.includes(normalizedPath)) hasChanges = true;
            if (status.conflicted.includes(normalizedPath)) hasChanges = true;

            var isStaged = false;
            if (status.staged.includes(normalizedPath)) isStaged = true;
            if (status.staged.includes(relativePath)) isStaged = true;

            if (hasChanges || isStaged)
            {
                filesToStage.push(relativePath);
            }
        }

        if (filesToStage.length == 0)
        {
            return {
                success: false,
                message: 'No changes to commit in the selected files'
            };
        }

        // Stage all files
        await this.git.add(filesToStage);

        // Commit
        await this.git.commit(commitMessage);

        // Push to remote
        await this.git.push();

        var successMsg = 'Successfully committed and pushed ' + filesToStage.length + ' file(s)';
        return {
            success: true,
            message: successMsg
        };
    }

    // Stash Operations
    async stashChanges(message?: string, includeUntracked: boolean = false): Promise<boolean>
    {
        var options = includeUntracked ? ['-u'] : [];
        if (message)
        {
            options.push('-m', message);
        }
        await this.git.stash(options);
        return true;
    }

    // Status and Info
    async getGitInfo(filePath?: string): Promise<GitInfo>
    {
        var status = await this.git.status();
        var currentBranch = status.current;
        var lastCommit = '';

        try
        {
            var log = await this.git.log(['--max-count=1']);
            if (log.latest && log.latest.hash)
            {
                lastCommit = log.latest.hash;
            }
        } catch (logError)
        {
            // nevazno
        }

        var hasLocalChanges = status.files.length > 0;
        var remoteBranch = '';
        var conflictStatus: GitInfo['conflictStatus'] = 'none';

        if (currentBranch)
        {
            try
            {
                var tracking = await this.git.raw(['rev-parse', '--abbrev-ref', currentBranch + '@{upstream}']);
                remoteBranch = tracking.trim();
            } catch (trackingError)
            {
                // nema upstream branch
            }
        }

        // Check for conflicts
        if (status.conflicted.length > 0)
        {
            conflictStatus = 'conflicts';
        }
        else if (status.behind > 0 || status.ahead > 0)
        {
            conflictStatus = 'needs-merge';
        }

        var result: GitInfo = {
            currentBranch: currentBranch || undefined,
            lastCommit: lastCommit,
            hasLocalChanges: hasLocalChanges,
            remoteBranch: remoteBranch || undefined,
            lastSync: new Date(),
            conflictStatus: conflictStatus
        };

        return result;
    }

    // Get current git user name
    async getCurrentGitUser(): Promise<string>
    {
        var userName = await this.git.getConfig('user.name');
        var userValue = typeof userName == 'string' ? userName : userName?.value;

        if (userValue && userValue.trim())
        {
            return userValue.trim();
        }

        //email ako nema username
        var userEmail = await this.git.getConfig('user.email');
        var emailValue = typeof userEmail == 'string' ? userEmail : userEmail?.value;

        if (emailValue && emailValue.trim())
        {
            var emailUser = emailValue.trim().split('@')[0];
            return emailUser;
        }

        // samo da imamo nesto
        return vscode.env.machineId.substring(0, 8);
    }

    async getCommitsFromBranch(branchName: string, filePath?: string, maxCount: number = 20): Promise<CommitInfo[]>
    {
        var args = ['--max-count=' + maxCount, branchName];

        if (filePath)
        {
            var normalizedWorkspace = path.resolve(this.workspaceRoot);
            var normalizedFile = path.resolve(filePath);
            var relativePath = path.relative(normalizedWorkspace, normalizedFile);
            args.push('--', relativePath);
        }

        var log = await this.git.log(args);

        var commits: CommitInfo[] = [];
        for (var i = 0; i < log.all.length; i++)
        {
            var commit = log.all[i];
            var files: string[] = [];
            if (commit.diff && commit.diff.files)
            {
                for (var j = 0; j < commit.diff.files.length; j++)
                {
                    files.push(commit.diff.files[j].file);
                }
            }

            commits.push({
                hash: commit.hash,
                message: commit.message,
                author: commit.author_name,
                date: new Date(commit.date),
                files: files
            });
        }

        return commits;
    }

    async cherryPickCommit(commitHash: string, filePath?: string): Promise<{ success: boolean, message: string }>
    {
        if (filePath)
        {
            var normalizedWorkspace = path.resolve(this.workspaceRoot);
            var normalizedFile = path.resolve(filePath);
            var relativePath = path.relative(normalizedWorkspace, normalizedFile);

            var fileContent = await this.git.show([commitHash + ':' + relativePath]);

            var fs = require('fs');
            var fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, relativePath);
            fs.writeFileSync(fullPath, fileContent);

            var fileName = path.basename(relativePath);
            var shortHash = commitHash.substring(0, 8);
            var msg = 'cherry-picked ' + fileName + ' from ' + shortHash;

            return {
                success: true,
                message: msg
            };
        }
        else
        {
            await this.git.raw(['cherry-pick', commitHash]);

            var shortHash = commitHash.substring(0, 8);
            var msg = 'cherry-picked commit ' + shortHash;

            return {
                success: true,
                message: msg
            };
        }
    }

    async cherryPickRange(fromCommit: string, toCommit: string, filePath?: string): Promise<{ success: boolean, message: string }>
    {
        if (filePath)
        {
            var commits = await this.git.log([fromCommit + '..' + toCommit, '--reverse']);
            var results: string[] = [];

            for (var i = 0; i < commits.all.length; i++)
            {
                var commit = commits.all[i];
                var result = await this.cherryPickCommit(commit.hash, filePath);
                var shortHash = commit.hash.substring(0, 8);
                var firstLine = commit.message.split('\n')[0];

                if (result.success)
                {
                    results.push('Success: ' + shortHash + ': ' + firstLine);
                }
                else
                {
                    results.push('Fail: ' + shortHash + ': ' + result.message);
                }
            }

            var msg = 'Cherry-pick range results:\n' + results.join('\n');
            return {
                success: true,
                message: msg
            };
        }
        else
        {
            await this.git.raw(['cherry-pick', fromCommit + '..' + toCommit]);

            var shortFrom = fromCommit.substring(0, 8);
            var shortTo = toCommit.substring(0, 8);
            var msg = 'cherry-picked range ' + shortFrom + '..' + shortTo;

            return {
                success: true,
                message: msg
            };
        }
    }

    async abortCherryPick(): Promise<boolean>
    {
        await this.git.raw(['cherry-pick', '--abort']);
        return true;
    }

    async stageFile(filePath: string): Promise<{ success: boolean, message: string }>
    {
        var normalizedWorkspace = path.resolve(this.workspaceRoot);
        var normalizedFile = path.resolve(filePath);
        var relativePath = path.relative(normalizedWorkspace, normalizedFile);

        var status = await this.git.status();

        // windows glupost oko normalizacije pathova
        var normalizedPath = relativePath.replace(/\\/g, '/');

        if (status.staged.includes(normalizedPath) || status.staged.includes(relativePath))
        {
            var fileName = path.basename(relativePath);
            return {
                success: true,
                message: fileName + ' already staged'
            };
        }

        // check if ima bilo kakvih promena
        if (status.modified.includes(normalizedPath) || status.modified.includes(relativePath) ||
            status.not_added.includes(normalizedPath) || status.not_added.includes(relativePath) ||
            status.deleted.includes(normalizedPath) || status.deleted.includes(relativePath) ||
            status.created.includes(normalizedPath) || status.created.includes(relativePath))
        {
            await this.git.add(relativePath);
            var fileName = path.basename(relativePath);
            return {
                success: true,
                message: 'staged ' + fileName
            };
        }

        var fileName = path.basename(relativePath);
        return {
            success: false,
            message: 'nothing to stage for ' + fileName
        };
    }

    async unstageFile(filePath: string): Promise<{ success: boolean, message: string }>
    {
        var normalizedWorkspace = path.resolve(this.workspaceRoot);
        var normalizedFile = path.resolve(filePath);
        var relativePath = path.relative(normalizedWorkspace, normalizedFile);

        await this.git.reset(['HEAD', '--', relativePath]);

        var fileName = path.basename(relativePath);
        return {
            success: true,
            message: 'unstaged ' + fileName
        };
    }

    async commitFile(filePath: string, message: string): Promise<{ success: boolean, message: string }>
    {
        var normalizedWorkspace = path.resolve(this.workspaceRoot);
        var normalizedFile = path.resolve(filePath);
        var relativePath = path.relative(normalizedWorkspace, normalizedFile);

        await this.git.add(relativePath);
        await this.git.commit(message, [relativePath]);

        var fileName = path.basename(relativePath);
        return {
            success: true,
            message: 'committed ' + fileName
        };
    }

    async stashFile(filePath: string, message?: string): Promise<{ success: boolean, message: string }>
    {
        var normalizedWorkspace = path.resolve(this.workspaceRoot);
        var normalizedFile = path.resolve(filePath);
        var relativePath = path.relative(normalizedWorkspace, normalizedFile);

        await this.git.add(relativePath);

        var fileName = path.basename(relativePath);
        var stashMessage = message || 'stashed ' + fileName;

        await this.git.stash(['push', '--keep-index', '-m', stashMessage, '--', relativePath]);

        return {
            success: true,
            message: 'stash created for ' + fileName
        };
    }

    async getFileStatus(filePath: string): Promise<{ isModified: boolean, isStaged: boolean, isUntracked: boolean }>
    {
        try
        {
            var normalizedWorkspace = path.resolve(this.workspaceRoot);
            var normalizedFile = path.resolve(filePath);
            var relativePath = path.relative(normalizedWorkspace, normalizedFile);

            var status = await this.git.status();

            // windows stuff
            var normalizedPath = relativePath.replace(/\\/g, '/');

            // proveri sta je sa fajlom, ima 2 verzije patha zbog windowsa
            var isModified = status.modified.includes(normalizedPath) || status.modified.includes(relativePath);
            var isStaged = status.staged.includes(normalizedPath) || status.staged.includes(relativePath);
            var isUntracked = status.not_added.includes(normalizedPath) || status.not_added.includes(relativePath);

            return {
                isModified: isModified,
                isStaged: isStaged,
                isUntracked: isUntracked
            };
        } catch (error)
        {
            console.error('greska u git status:', error);
            return { isModified: false, isStaged: false, isUntracked: false };
        }
    }
}
