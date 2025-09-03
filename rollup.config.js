import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import { terser } from 'rollup-plugin-terser'
import json from '@rollup/plugin-json'

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/solid-logic.js',
    format: 'esm',
    sourcemap: true
  },
  plugins: [
    resolve({ preferBuiltins: true }), // best practice to be true, chooses node.js buildins
    commonjs(),
    typescript({
      declaration: false, // this is false so it does not generate types for the versionInfo file
      declarationMap: false
    }),
    json(),
    terser()
  ],
  inlineDynamicImports: true // dissables multiple chunk creation, why we use rollup in the first place
}