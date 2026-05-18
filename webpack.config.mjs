import path from 'path'
import TerserPlugin from 'terser-webpack-plugin'


const externalsBase = {
  'fs': 'null',
  'node-fetch': 'fetch',
  'isomorphic-fetch': 'fetch',
  'text-encoding': 'TextEncoder',
  '@trust/webcrypto': 'crypto',
  '@xmldom/xmldom': 'window',
  'whatwg-url': 'URL',
  'rdflib': '$rdf',
  // Must externalize: uvdsl's SharedWorker URL is constructed via
  // `new URL('./RefreshWorker.js', import.meta.url)`. If bundled inline here,
  // webpack bakes a `file://…/solid-logic/dist/…` path that browsers refuse
  // to load over http:// origin. Leaving it external lets the consumer bundle
  // (mashlib) resolve the worker URL relative to its own publicPath.
  '@uvdsl/solid-oidc-client-browser': '@uvdsl/solid-oidc-client-browser'
}

const externalsESM = {
  ...externalsBase,
  'rdflib': 'rdflib'
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
    externals: externalsESM,
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
    externals: externalsESM,
    experiments: {
      outputModule: true
    },
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({ extractComments: false })]
    }
  }
]
