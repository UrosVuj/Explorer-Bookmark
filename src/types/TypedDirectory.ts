import * as vscode from "vscode";

export class TypedDirectory
{
  path: string;
  type: vscode.FileType;

  constructor(
    path: string,
    type: vscode.FileType
  )
  {
    this.path = path;
    this.type = type;
  }
}

export async function buildTypedDirectory(uri: vscode.Uri)
{
  const type = (await vscode.workspace.fs.stat(uri)).type;
  return new TypedDirectory(uri.fsPath, type);
}
