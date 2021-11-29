import * as vscode from 'vscode';
import * as path from 'path';
import { FileSystemObject } from './FileSystemObject';

export class FolderManager implements vscode.TreeDataProvider<FileSystemObject>{

    private selectedFSObjects: vscode.Uri[] = [];
    private _onDidChangeTreeData: vscode.EventEmitter<FileSystemObject | undefined | null | void> = new vscode.EventEmitter<FileSystemObject | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileSystemObject | undefined | null | void> = this._onDidChangeTreeData.event;

    getTreeItem(element: FileSystemObject): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }
    async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]> {
            if(element){
                return this.directorySearch(element.resourceUri);                
            }
            else {
                if(this.selectedFSObjects.length > 0){
                return this.createEntries(this.selectedFSObjects);
                }
                else{
                    return Promise.resolve([]);                    
                }
            }

    }

	async selectFolder(uri: vscode.Uri | undefined) {
		if (uri) {
			this.selectedFSObjects.push(uri);
            console.log(uri);
		} else {
			//this.selectedFolders.push(undefined);
		}
		this.refresh();
	}

    private async directorySearch(uri: vscode.Uri){
        const folders = await vscode.workspace.fs.readDirectory(uri);
        return folders
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map((item) => {
            const [name, type] = item;
            const isDirectory =
                type === vscode.FileType.Directory
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;

				return new FileSystemObject(
					name,
                    isDirectory,
					vscode.Uri.joinPath(uri, "/" + name)
                    );

        });
    }

    private async createEntries(selectedFSObjects: vscode.Uri[] ){
        // const folders = await vscode.workspace.fs.readDirectory(folder);
        //    const type = (await vscode.workspace.fs.stat(folder)).type;
        //    console.log(type);

        let folderSystem: FileSystemObject[] = [];
        
        for(const fsItem of selectedFSObjects){
            
            let type = (await (vscode.workspace.fs.stat(fsItem))).type;

            folderSystem.push(new FileSystemObject(
                `${path.basename(fsItem.path)}`, //add whole url on hover of view element (folder in view)
                type === vscode.FileType.File 
                        ? vscode.TreeItemCollapsibleState.None
                        : vscode.TreeItemCollapsibleState.Collapsed,
                fsItem
            ));
        };

        return folderSystem;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
      }
};
