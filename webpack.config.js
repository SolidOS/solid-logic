import path from 'path'
import fs from 'fs'
import webpack from 'webpack'

const licenseText = fs.readFileSync('./LICENSE', 'utf8')
const commentedLicense = `/*!\n${licenseText}\n*/`

export default {
  mode: 'production',
  entry: './src/index.ts',
  output: {
  path: path.resolve('lib'),
  filename: 'solid-logic.js',
  libraryTarget: 'module', // ESM output
  },
  optimization: {
    splitChunks: {
      chunks: 'async',
      minSize: Infinity,
    },
    runtimeChunk: false,
  },
  experiments: {
    outputModule: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: { node: 'current' } }],
                '@babel/preset-typescript'
              ]
            }
          }
        ],
        exclude: /node_modules/,
      }
    ]
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: commentedLicense,
      raw: true
    })
  ]
}
