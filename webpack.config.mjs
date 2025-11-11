import path from 'path'
import TerserPlugin from 'terser-webpack-plugin'

const externalsBase = {
  'fs': 'null',
  'node-fetch': 'fetch',
  'isomorphic-fetch': 'fetch',
  'text-encoding': 'TextEncoder',
  '@trust/webcrypto': 'crypto',
  // Removed @xmldom/xmldom and whatwg-url - use native browser APIs
  'rdflib': '$rdf'
}

const commonConfig = {
  mode: 'production',
  entry: './src/index.ts',

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  devtool: 'source-map',
};

export default [
  // UMD with rdflib as external
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.js',
      library: {
        name: 'SolidLogic',
        type: 'umd',
        umdNamedDefine: true
      },
      globalObject: 'this',
      clean: false
    },
    externals: externalsBase,
    optimization: {
      minimize: false
    }
  },
  // Minified UMD with rdflib as external
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.min.js',
      library: {
        name: 'SolidLogic',
        type: 'umd',
        umdNamedDefine: true
      },
      globalObject: 'this',
      clean: false
    },
    externals: externalsBase,
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({ extractComments: false })]
    }
  },
  // Unminified ESM with rdflib as external
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.esm.js',
      library: {
        type: 'module'
      },
      environment: { module: true },
      clean: false
    },
    externals: externalsBase,
    experiments: {
      outputModule: true
    },
    optimization: {
      minimize: false
    }
  },
  // Minified ESM with rdflib as external
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.esm.min.js',
      library: {
        type: 'module'
      },
      environment: { module: true },
      clean: false
    },
    externals: externalsBase,
    experiments: {
      outputModule: true
    },
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({ extractComments: false })]
    }
  }
]
