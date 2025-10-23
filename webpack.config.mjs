import path from 'path'
import TerserPlugin from 'terser-webpack-plugin'

const externalsBase = {
  'fs': 'null',
  'node-fetch': 'fetch',
  'isomorphic-fetch': 'fetch',
  '@xmldom/xmldom': 'window',
  'text-encoding': 'TextEncoder',
  'whatwg-url': 'window',
  '@trust/webcrypto': 'crypto'
}

// rdflib externalized
const externalsWithoutRdflib = {
  ...externalsBase,
  rdflib: '$rdf'
}

// rdflib bundled
const externalsWithRdflib = {
  ...externalsBase
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
  // Fully bundled UMD (rdflib included)
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.js',
      library: {
        name: 'SolidLogic',
        type: 'umd'
      },
      globalObject: 'this',
      iife: true,
      clean: false
    },
    externals: externalsWithRdflib,
    optimization: {
      minimize: false
    }
  },
  // Fully bundled minified UMD (rdflib included)
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.min.js',
      library: {
        name: 'SolidLogic',
        type: 'umd'
      },
      globalObject: 'this',
      iife: true,
      clean: false
    },
    externals: externalsWithRdflib,
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({ extractComments: false })]
    }
  },
  // UMD with rdflib as external
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.external.js',
      library: {
        name: 'SolidLogic',
        type: 'umd'
      },
      globalObject: 'this',
      iife: true,
      clean: false
    },
    externals: externalsWithoutRdflib,
    optimization: {
      minimize: false
    }
  },
  // Minified UMD with rdflib as external
  {
    ...commonConfig,
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: 'solid-logic.external.min.js',
      library: {
        name: 'SolidLogic',
        type: 'umd'
      },
      globalObject: 'this',
      iife: true,
      clean: false
    },
    externals: externalsWithoutRdflib,
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
      filename: 'solid-logic.esm.external.js',
      library: {
        type: 'module'
      },
      environment: { module: true },
      clean: false
    },
    externals: externalsWithoutRdflib,
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
      filename: 'solid-logic.esm.external.min.js',
      library: {
        type: 'module'
      },
      environment: { module: true },
      clean: false
    },
    externals: externalsWithoutRdflib,
    experiments: {
      outputModule: true
    },
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({ extractComments: false })]
    }
  }
]
