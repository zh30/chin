import fse from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { execa } from 'execa';
import { gzipSync } from 'zlib';
import { compress } from 'brotli';
import minimist from 'minimist';
import { targets as allTargets, fuzzyMatchTarget } from './utils.js';

const { remove, existsSync, readFile, readFileSync, writeFile, readdir } = fse;
const args = minimist(process.argv.slice(2));
const targets = args._;
const formats = args.formats || args.f;
const devOnly = args.devOnly || args.d;
const prodOnly = !devOnly && (args.prodOnly || args.p);
const sourceMap = args.sourcemap || args.s;
const isRelease = args.release;
const buildTypes = args.t || args.types || isRelease;
const buildAllMatching = args.all || args.a;
const { stdout } = await execa('git', ['rev-parse', 'HEAD']);
const commit = stdout.slice(0, 7);

async function run() {
  if (isRelease) {
    // remove build cache for release builds to avoid outdated enum values
    await remove(path.resolve(__dirname, '../node_modules/.rts2_cache'));
  }
  if (!targets.length) {
    await buildAll(allTargets);
    checkAllSizes(allTargets);
  } else {
    await buildAll(fuzzyMatchTarget(targets, buildAllMatching));
    checkAllSizes(fuzzyMatchTarget(targets, buildAllMatching));
  }
}

async function buildAll(targets) {
  await runParallel(os.cpus().length, targets, build);
}

async function runParallel(maxConcurrency, source, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of source) {
    const p = Promise.resolve().then(() => iteratorFn(item, source));
    ret.push(p);

    if (maxConcurrency <= source.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

async function build(target) {
  const pkgDir = path.resolve(`packages/${target}`);
  const pkg = await import(`${pkgDir}/package.json`);

  // only build published packages for release
  if (isRelease && pkg.private) {
    return;
  }

  // if building a specific format, do not remove dist.
  if (!formats) {
    await remove(`${pkgDir}/dist`);
  }

  const env =
    (pkg.buildOptions && pkg.buildOptions.env) ||
    (devOnly ? 'development' : 'production');
  await execa(
    'rollup',
    [
      '-c',
      '--environment',
      [
        `COMMIT:${commit}`,
        `NODE_ENV:${env}`,
        `TARGET:${target}`,
        formats ? `FORMATS:${formats}` : '',
        buildTypes ? 'TYPES:true' : '',
        prodOnly ? 'PROD_ONLY:true' : '',
        sourceMap ? 'SOURCE_MAP:true' : '',
      ]
        .filter(Boolean)
        .join(','),
    ],
    { stdio: 'inherit' }
  );

  if (buildTypes && pkg.types) {
    console.log();
    console.log(
      chalk.bold(chalk.yellow(`Rolling up type definitions for ${target}...`))
    );

    // build types
    const { Extractor, ExtractorConfig } = await import(
      '@microsoft/api-extractor'
    );

    const extractorConfigPath = path.resolve(pkgDir, 'api-extractor.json');
    const extractorConfig =
      ExtractorConfig.loadFileAndPrepare(extractorConfigPath);
    const extractorResult = Extractor.invoke(extractorConfig, {
      localBuild: false,
      showVerboseMessages: true,
    });
    //
    if (extractorResult.succeeded) {
      // concat additional d.ts to rolled-up dts
      const typesDir = path.resolve(pkgDir, 'types');
      if (await existsSync(typesDir)) {
        const dtsPath = path.resolve(pkgDir, pkg.types);
        const existing = await readFile(dtsPath, 'utf-8');
        const typeFiles = await readdir(typesDir);
        const toAdd = await Promise.all(
          typeFiles.map((file) => {
            return readFile(path.resolve(typesDir, file), 'utf-8');
          })
        );
        await writeFile(dtsPath, existing + '\n' + toAdd.join('\n'));
      }
      console.log(
        chalk.bold(chalk.green('API Extractor completed successfully.'))
      );
    } else {
      console.error(
        `API Extractor completed with ${extractorResult.errorCount} errors` +
          ` and ${extractorResult.warningCount} warnings`
      );
      process.exitCode = 1;
    }

    await remove(`${pkgDir}/dist/packages`);
  }
}

function checkAllSizes(targets) {
  if (devOnly) {
    return;
  }
  console.log();
  for (const target of targets) {
    checkSize(target);
  }
  console.log();
}

function checkSize(target) {
  const pkgDir = path.resolve(`packages/${target}`);
  checkFileSize(`${pkgDir}/dist/${target}.global.prod.js`);
}

function checkFileSize(filePath) {
  if (!existsSync(filePath)) return;

  const file = readFileSync(filePath);
  const minSize = (file.length / 1024).toFixed(2) + 'kb';
  const gzipped = gzipSync(file);
  const gzippedSize = (gzipped.length / 1024).toFixed(2) + 'kb';
  const compressed = compress(file);
  const compressedSize = (compressed.length / 1024).toFixed(2) + 'kb';
  console.log(
    `${chalk.gray(
      chalk.bold(path.basename(filePath))
    )} min:${minSize} / gzip:${gzippedSize} / brotli:${compressedSize}`
  );
}

run();
