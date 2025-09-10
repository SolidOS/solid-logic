import resolve from '@rollup/plugin-node-resolve'
import polyfillNode from 'rollup-plugin-polyfill-node'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import { terser } from 'rollup-plugin-terser'
import json from '@rollup/plugin-json'

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/solid-logic.esm.js',
        format: 'esm',
        sourcemap: true,
        exports: 'named'
      },
      {
        file: 'dist/solid-logic.umd.js',
        format: 'umd',
        name: 'SolidLogic',
        sourcemap: true,
        exports: 'named',
        globals: {
          rdflib: 'rdflib'
        }
      }
    ],
    plugins: [
      resolve({ preferBuiltins: true }), // best practice to be true, chooses node.js buildins
      commonjs(),
      typescript({
        declaration: false, // this is false so it does not generate types for the versionInfo file
        declarationMap: false
      }),
      json()
    , polyfillNode()
    ],
    external: ['rdflib'],
    inlineDynamicImports: true // dissables multiple chunk creation
  },
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/solid-logic.esm.min.js',
        format: 'esm',
        sourcemap: true,
        exports: 'named'
      },
      {
        file: 'dist/solid-logic.umd.min.js',
        format: 'umd',
        name: 'SolidLogic',
        sourcemap: true,
        exports: 'named',
        globals: {
          rdflib: 'rdflib'
        }
      }
    ],
    plugins: [
      resolve({ preferBuiltins: true }),
      commonjs(),
      typescript({
        declaration: false,
        declarationMap: false
      }),
      json(),
      polyfillNode(),
      terser()
    ],
    external: ['rdflib'],
    inlineDynamicImports: true
  }
]