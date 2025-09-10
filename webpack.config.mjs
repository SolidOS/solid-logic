import path from 'path'
import TerserPlugin from 'terser-webpack-plugin'

const commonConfig = {
  mode: 'production',
  entry: './src/index.ts',
  externals: {
    rdflib: '$rdf'
  },
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
  // Unminified UMD
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.umd.js',
      library: {
        name: 'SolidLogic',
        type: 'umd'
      },
      globalObject: 'this',
      iife: true,
      clean: false
    },
    optimization: {
      minimize: false
    }
  },
  // Minified UMD
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.umd.min.js',
      library: {
        name: 'SolidLogic',
        type: 'umd'
      },
      globalObject: 'this',
      iife: true,
      clean: false
    },
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({ extractComments: false })]
    }
  },
  // Unminified ESM
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
    experiments: {
      outputModule: true
    },
    optimization: {
      minimize: false
    }
  },
  // Minified ESM
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
    experiments: {
      outputModule: true
    },
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({ extractComments: false })]
    }
  }
]
