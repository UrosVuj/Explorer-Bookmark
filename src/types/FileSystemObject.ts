import * as vscode from "vscode";
import { DirectoryProviderCommands } from "../commands/CrudCommands";

export class FileSystemObject extends vscode.TreeItem
{
  resourceUri: vscode.Uri;
  command?: vscode.Command;
  sectionId?: string;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    uri: vscode.Uri,
    sectionId?: string
  )
  {
    super(label, collapsibleState);
    this.tooltip = uri.fsPath;
    this.resourceUri = uri;
    this.sectionId = sectionId;

    if (collapsibleState == vscode.TreeItemCollapsibleState.None)
    {
      this.command = {
        arguments: [this],
        command: DirectoryProviderCommands.OpenItem,
        title: this.label
      };
    } else
    {
      this.command = undefined;
    }
  }
  setContextValue(value: string)
  {
    this.contextValue = value;
    return this;
  }
}
