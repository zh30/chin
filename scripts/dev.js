import { execa } from 'execa';
import { fuzzyMatchTarget } from './utils.js';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));
const target = args._.length ? fuzzyMatchTarget(args._)[0] : 'ui';
const formats = args.formats || args.f;
const sourceMap = args.sourcemap || args.s;
const { stdout } = await execa('git', ['rev-parse', 'HEAD']);
const commit = stdout.slice(0, 7);

execa(
  'rollup',
  [
    '-wc',
    '--environment',
    [
      `COMMIT:${commit}`,
      `TARGET:${target}`,
      `FORMATS:${formats || 'global'}`,
      sourceMap ? 'SOURCE_MAP:true' : '',
    ]
      .filter(Boolean)
      .join(','),
  ],
  {
    stdio: 'inherit',
  }
);
