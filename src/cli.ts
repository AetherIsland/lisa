import * as path from 'node:path';

import { defineCommand, runMain } from 'citty';

import * as packageInfo from '../package.json';
import { mainPipeline } from './main';

const mainCmd = defineCommand({
    meta: {
        name: 'lisa',
        version: packageInfo.version,
        description: '生成图书馆馆藏'
    },
    args: {
        repo: {
            type: 'string',
            description: 'Git 仓库目录',
            required: true
        },
        output: {
            type: 'string',
            description: '输出目录',
            required: true
        },
        'clean-output': {
            type: 'boolean',
            description: '运行前清空输出目录',
            default: false
        }
    },
    run({ args }) {
        const repoPath = path.normalize(args.repo);
        const outputPath = path.normalize(args.output);
        mainPipeline(repoPath, outputPath, args['clean-output']);
    }
});

runMain(mainCmd);
