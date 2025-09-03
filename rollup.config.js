import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import { terser } from 'rollup-plugin-terser'
import fs from 'fs'
import json from '@rollup/plugin-json'

const license = fs.readFileSync('./LICENSE', 'utf8')

export default {
  input: 'src/index.ts',
  output: {
    file: 'lib/solid-logic.js',
    format: 'esm',
    banner: `/*!\n${license}\n*/`,
    sourcemap: true
  },
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    typescript(),
    json(),
    terser()
  ],
  inlineDynamicImports: true
}