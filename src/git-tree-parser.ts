import { strict as assert } from 'node:assert';

export type TreeItem = {
    objectMode: string;
    objectType: 'commit' | 'blob' | 'tree';
    objectName: string;
    path: string;
};

/**
 * @example git.raw(['ls-tree', '-z', 'HEAD']).then(gitTreeParser)
 */
export function gitTreeParser(output: string) {
    const lines = output.split('\0');
    lines.pop();
    return lines.map((line) => {
        const separatorPos = line.indexOf('\t');
        assert.notStrictEqual(separatorPos, -1, `异常行 ${JSON.stringify(line)} 中找不到水平制表符`);
        const metadata = line.substring(0, separatorPos).split(' ');
        const path = line.substring(separatorPos + 1);
        return {
            objectMode: metadata[0],
            objectType: metadata[1],
            objectName: metadata[2],
            path
        } as TreeItem;
    });
}
