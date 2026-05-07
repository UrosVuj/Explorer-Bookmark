export type CommandTargetCandidate = {
  resourceUri?: {
    fsPath?: string;
    path?: string;
  };
  uri?: {
    fsPath?: string;
    path?: string;
  };
  path?: string;
  fsPath?: string;
};

export function extractCommandTargetPath(value: unknown): string | undefined
{
  if (!value || typeof value !== "object")
  {
    return undefined;
  }

  const candidate = value as CommandTargetCandidate;

  return candidate.resourceUri?.fsPath
    || candidate.resourceUri?.path
    || candidate.uri?.fsPath
    || candidate.uri?.path
    || candidate.fsPath
    || candidate.path;
}

export function isUriString(value: string): boolean
{
  return value.includes("://");
}
