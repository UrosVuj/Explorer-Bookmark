import * as vscode from "vscode";

export class TypedDirectory
{
  path: string;
  uri: string;
  alias?: string;
  type: vscode.FileType;

  constructor(
    path: string,
    uri: string,
    alias: string | undefined,
    type: vscode.FileType
  )
  {
    this.path = path;
    this.uri = uri;
    this.alias = alias;
    this.type = type;
  }
}

export function buildBookmarkKey(uri: vscode.Uri): string
{
  return uri.toString(true);
}

export function getTypedDirectoryUri(typedDirectory: TypedDirectory): vscode.Uri
{
  return typedDirectory.uri
    ? vscode.Uri.parse(typedDirectory.uri, true)
    : vscode.Uri.file(typedDirectory.path);
}

export async function buildTypedDirectory(uri: vscode.Uri)
{
  const type = (await vscode.workspace.fs.stat(uri)).type;
  return new TypedDirectory(uri.fsPath, buildBookmarkKey(uri), undefined, type);
}
