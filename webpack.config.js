const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env) => {
  const browser = env.browser || 'chrome';
  const offline = env.localModel === 'true';
  const outDir = path.resolve(__dirname, `dist/${browser}`);

  const copyPatterns = [
    { from: 'manifest.json', to: '.' },
    { from: 'src/popup/popup.html', to: 'popup/popup.html' },
    { from: 'src/options/options.html', to: 'options/options.html' },
    { from: 'src/welcome/welcome.html', to: 'welcome/welcome.html' },
    { from: 'src/welcome/welcome.js', to: 'welcome/welcome.js' },
    { from: 'icons', to: 'icons', noErrorOnMissing: true },
  ];

  if (offline) {
    // Copy model files vào dist để extension hoạt động offline
    copyPatterns.push({
      from: 'models',
      to: 'models',
      noErrorOnMissing: false, // lỗi nếu quên chạy download-model trước
    });
  }

  return {
    mode: 'production',
    devtool: false,
    entry: {
      'background/service-worker': './src/background/service-worker.js',
      'content/upload': './src/content/upload.js',
      'popup/popup': './src/popup/popup.js',
      'options/options': './src/options/options.js',
    },
    output: {
      path: outDir,
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: { loader: 'babel-loader' },
        },
      ],
    },
    resolve: { extensions: ['.js'] },
    plugins: [new CopyPlugin({ patterns: copyPatterns })],
    experiments: { asyncWebAssembly: true },
  };
};
