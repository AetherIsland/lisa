import * as fs from 'node:fs';
import * as path from 'node:path';

import { consola } from 'consola';
import { delay, pick, sortBy } from 'es-toolkit';
import { xxHash32 } from 'js-xxhash';
import { simpleGit, type LogResult, type SimpleGit } from 'simple-git';

type EmitIndex = {
    id: string;
    displayName: string;
};

type HashRevision = {
    hash: string;
    content: any;
};

type ModUnitInfo = {
    path: string;
    seenInHead: boolean;
    revisions: HashRevision[];
};

function reduceLogResult(logResult: LogResult) {
    return logResult.all.map(
        (logItem) => pick(logItem, ['hash', 'date', 'message', 'body'])
    );
}

async function lsHashFiles(git: SimpleGit, treeIsh: string) {
    consola.debug('正在列出树', treeIsh, '中所有的哈希信息文件');
    const treeOutput = await git.raw(['ls-tree', '-r', '-z', '--name-only', treeIsh]);
    const filepaths = treeOutput.split('\0');
    return filepaths.filter((value) => path.basename(value) === 'hash.json');
}

async function writeJSON(filepath: string, value: any) {
    consola.debug('正在写入', filepath);
    try {
        await fs.promises.writeFile(filepath, JSON.stringify(value));
    } catch (error) {
        consola.error('写入', filepath, '时发生错误');
        throw error;
    }
}

async function grabHashRevisions(git: SimpleGit, revision: string, filepath: string) {
    consola.debug('正在获取文件', filepath, '在', revision, '上的历史记录');
    const logResult = await git.log([revision, '--', filepath]);
    const revisions: HashRevision[] = [];
    for (const { hash } of logResult.all) {
        const item: HashRevision = {
            hash,
            content: null
        };
        try {
            consola.debug('正在读取', hash, '中的', filepath);
            const text = await git.catFile(['--textconv', `${hash}:${filepath}`]);
            item.content = JSON.parse(text);
        } catch (error) {
            consola.warn('读取版本', hash, '中的', filepath, '时发生错误');
            if (error instanceof Error) {
                consola.warn('错误详细信息：\n', error.name, error.message);
            }
        } finally {
            revisions.push(item);
        }
    }
    return revisions;
}

export async function mainPipeline(repoPath: string, outputPath: string, cleanOutput: boolean) {
    const git = simpleGit(repoPath);
    if (cleanOutput) {
        consola.warn('将在 5 秒后删除', outputPath);
        await delay(5000);
        await fs.promises.rm(path.join(outputPath, '*'), {
            force: true,
            recursive: true
        });
    }
    await fs.promises.mkdir(outputPath, { recursive: true });

    const commits = await git.log().then(reduceLogResult);
    const index: EmitIndex[] = [];
    const seenHashFiles = new Set<string>();
    const seenHashFilesInHead = new Set(await lsHashFiles(git, 'HEAD'));

    consola.start('开始遍历 Git 仓库并生成 Mod 单元信息文件');
    const tasks: Promise<unknown>[] = [];
    for (const { hash } of commits) {
        consola.debug('正在处理提交', hash);
        const hashFiles = await lsHashFiles(git, hash);
        for (const filepath of hashFiles) {
            if (seenHashFiles.has(filepath)) {
                continue;
            }
            consola.info('发现文件', filepath);
            seenHashFiles.add(filepath);
            tasks.push(grabHashRevisions(git, hash, filepath).then((revisions) => {
                const name = path.basename(path.dirname(filepath));
                if (name === '.') {
                    consola.warn('忽略异常路径文件', filepath);
                    return;
                }
                const unit: ModUnitInfo = {
                    path: path.dirname(filepath),
                    seenInHead: seenHashFilesInHead.has(filepath),
                    revisions
                };
                const id = `${name}-${xxHash32(unit.path).toString(16)}`;
                index.push({
                    id,
                    displayName: unit.path
                });
                return writeJSON(path.join(outputPath, `${id}.json`), unit);
            }));
        }
    }
    await Promise.all(tasks);
    consola.success('生成 Mod 单元信息文件成功');

    await writeJSON(path.join(outputPath, '_metadata.json'), {
        head: await git.revparse('HEAD'),
        commits,
        index: sortBy(index, ['displayName', 'id'])
    });
    consola.success('元数据写入成功');
}
