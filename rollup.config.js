import path from 'path';

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import sourceMaps from 'rollup-plugin-sourcemaps';
import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import camelCase from 'lodash/camelCase';

if (!process.env.TARGET) {
  throw new Error('TARGET package must be specified via --environment flag.');
}

const pkgsDir = path.resolve(__dirname, 'packages');
const pkgDir = path.resolve(pkgsDir, process.env.TARGET);
const resolve = (filename) => path.resolve(pkgDir, filename);

const name = path.basename(pkgDir);
const pkg = require(resolve('package.json'));

const pkgOptions = pkg.buildOptions || {};
const defaultFormats = ['esm', 'umd'];
const inlineFormats = process.env.FORMATS && process.env.FORMATS.split(',');
const packageFormats = inlineFormats || pkgOptions.formats || defaultFormats;

const isProduction = process.env.NODE_ENV === 'production';

const outputConfigs = {
  esm: {
    file: resolve(`dist/${name}.esm.js`),
    format: 'es',
  },
  umd: {
    file: resolve(`dist/${name}.umd.js`),
    name: camelCase(name),
    format: 'umd',
  },
  cjs: {
    file: resolve(`dist/${name}.cjs.js`),
    format: 'cjs',
  },
  global: {
    file: resolve(`dist/${name}.global.js`),
    name: camelCase(name),
    format: 'iife',
  },
};

const packageConfigs = packageFormats.map(createConfigWithFormat);

if (isProduction) {
  packageFormats.forEach((format) => {
    if (pkgOptions.prod === false) return;
    packageConfigs.push(createMinifiedConfig(format));
  });
}

function createConfigWithFormat(format) {
  return createConfig(format, outputConfigs[format]);
}

function createMinifiedConfig(format) {
  return createConfig(
    format,
    {
      ...outputConfigs[format],
      file: outputConfigs[format].file.replace(/\.js$/, '.prod.js'),
    },
    [
      terser({
        module: /^esm/.test(format),
        compress: {
          ecma: 2015,
          pure_getters: true,
        },
        safari10: true,
      }),
    ]
  );
}

function createConfig(format, output, plugins = []) {
  if (!output) {
    console.log(require('chalk').yellow(`invalid format: "${format}"`));
    process.exit(1);
  }
  output.sourcemap = !!process.env.SOURCE_MAP;

  const entryFile = pkgOptions.entry || 'src/index.ts';

  return {
    input: resolve(entryFile),
    output,
    plugins: [
      json(),
      typescript({
        tsconfig: resolve('tsconfig.json'),
      }),
      commonjs(),
      replace({
        values: {
          __DEV__: JSON.stringify(!isProduction),
        },
        preventAssignment: true,
      }),
      nodeResolve(),
      sourceMaps(),
      ...plugins,
    ],
  };
}

export default packageConfigs;
