import path from 'path';

export default {
  mode: 'production', // or 'development'
  entry: './src/index.ts',
  output: {
    path: path.resolve('lib'),
    filename: 'bundle.js',
    libraryTarget: 'module', // ESM output
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
  }
};
