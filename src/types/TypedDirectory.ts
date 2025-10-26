import * as vscode from "vscode";

export interface GitInfo
{
  currentBranch?: string;
  lastCommit?: string;
  hasLocalChanges?: boolean;
  remoteBranch?: string;
  lastSync?: Date;
  conflictStatus?: string;  // 'none', 'conflicts', 'needs-merge'
}

export interface PullRequestInfo
{
  id: number;
  title: string;
  url: string;
  status: string;  // open, closed, merged, draft
  author: string;
  created: Date;
  updated: Date;
  targetBranch?: string;
  sourceBranch?: string;
}

export class TypedDirectory
{
  path: string;
  type: vscode.FileType;
  tags?: string[];
  addedBy?: string;
  dateAdded?: Date;
  aiSummary?: string;
  lastSummaryUpdate?: Date;

  watchers: string[];
  priority: string;  // low, medium, high, critical
  status: string;    // active, archived, in-review, completed

  gitInfo?: GitInfo;
  relatedPRs: PullRequestInfo[];

  lastAccessed?: Date;
  accessCount: number;

  constructor(
    path: string,
    type: vscode.FileType,
    tags?: string[],
    addedBy?: string,
    dateAdded?: Date,
    aiSummary?: string,
    lastSummaryUpdate?: Date,
    watchers?: string[],
    priority?: string,
    status?: string,
    gitInfo?: GitInfo,
    relatedPRs?: PullRequestInfo[],
    lastAccessed?: Date,
    accessCount?: number
  )
  {
    this.path = path;
    this.type = type;
    this.tags = tags || [];
    this.addedBy = addedBy;
    this.dateAdded = dateAdded || new Date();
    this.aiSummary = aiSummary;
    this.lastSummaryUpdate = lastSummaryUpdate;

    this.watchers = watchers || [];
    this.priority = priority || 'medium';
    this.status = status || 'active';

    this.gitInfo = gitInfo;
    this.relatedPRs = relatedPRs || [];

    this.lastAccessed = lastAccessed;
    this.accessCount = accessCount || 0;
  }

  updateAISummary(summary: string): void
  {
    this.aiSummary = summary;
    this.lastSummaryUpdate = new Date();
  }

  addTag(tag: string): void
  {
    if (!this.tags) this.tags = [];
    if (!this.tags.includes(tag))
    {
      this.tags.push(tag);
    }
  }

  updateStatus(newStatus: TypedDirectory['status'], updatedBy: string): void
  {
    this.status = newStatus;
  }

  updatePriority(newPriority: TypedDirectory['priority'], updatedBy: string): void 
  {
    this.priority = newPriority;
  }

  addRelatedPR(prInfo: PullRequestInfo): void 
  {
    const exists = this.relatedPRs.find(pr => pr.id == prInfo.id);
    if (!exists)
    {
      this.relatedPRs.push(prInfo);
    }
  }
}

export async function buildTypedDirectory(uri: vscode.Uri, tags?: string[], userName?: string) 
{
  const type = (await vscode.workspace.fs.stat(uri)).type;

  var username = userName;
  if (!username)
  {
    try
    {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) 
      {
        const { GitService } = await import('../services/GitService');
        const gitService = new GitService(workspaceFolders[0].uri.fsPath);
        username = await gitService.getCurrentGitUser();
      }
      else
      {
        username = vscode.env.machineId.substring(0, 8);
      }
    } catch (error)
    {
      username = vscode.env.machineId.substring(0, 8);
    }
  }

  return new TypedDirectory(uri.fsPath, type, tags, username);
}

