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
  'rdflib': '$rdf'
}

const externalsESM = {
  ...externalsBase,
  '@uvdsl/solid-oidc-client-browser': '@uvdsl/solid-oidc-client-browser',
  '@uvdsl/solid-oidc-client-browser/core': '@uvdsl/solid-oidc-client-browser/core',
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
  optimization: {
    splitChunks: false,
    runtimeChunk: false
  }
};

export default [
  // UMD with rdflib as external
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.js',
      publicPath: '',
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
      ...commonConfig.optimization,
      minimize: false
    }
  },
  // Minified UMD with rdflib as external
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.min.js',
      publicPath: '',
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
      ...commonConfig.optimization,
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
      publicPath: '',
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
      ...commonConfig.optimization,
      minimize: false
    }
  },
  // Minified ESM with rdflib as external
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.esm.min.js',
      publicPath: '',
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
      ...commonConfig.optimization,
      minimize: true,
      minimizer: [new TerserPlugin({ extractComments: false })]
    }
  }
]
