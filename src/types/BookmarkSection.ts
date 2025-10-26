import { TypedDirectory } from "./TypedDirectory";

export class BookmarkSection
{
    id: string;
    name: string;
    directories: TypedDirectory[];

    constructor(id: string, name: string, directories: TypedDirectory[] = [])
    {
        this.id = id;
        this.name = name;
        this.directories = directories;
    }

    addDirectory(directory: TypedDirectory): void
    {
        this.directories.push(directory);
    }

    removeDirectory(path: string): boolean
    {
        const index = this.directories.findIndex(dir => dir.path == path);
        if (index > -1)
        {
            this.directories.splice(index, 1);
            return true;
        }
        return false;
    }

    static createDefault(): BookmarkSection
    {
        return new BookmarkSection('default', 'Default', []);
    }
}
