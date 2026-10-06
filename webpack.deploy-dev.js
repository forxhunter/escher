const merge = require('webpack-merge')
const common = require('./webpack.common.js')
const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = merge.smart(common, {
    mode: 'development', // Force development mode (like npm start)
    entry: './dev-server/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        // Fingerprinted: GitHub Pages serves with a 10-minute max-age, and a
        // fixed name kept visitors on the previous deploy after every update.
        filename: 'bundle.[contenthash:8].js'
    },
    devtool: 'source-map', // Keep source maps
    plugins: [
        // We still need to generate the HTML file, but we will use the dev-server template
        // to match local behavior as closely as possible.
        new HtmlWebpackPlugin({
            title: 'Escher',
            // The local page with the script tag pointing at the fingerprinted bundle.
            template: './dev-server/deploy.html',
            filename: 'index.html',
            inject: false
        })
    ],
    // Ensure node_modules are transpiled to avoid "illegal character" errors even in dev mode
    // if they appear on some browsers. But strictly speaking, "mode: development" usually avoids minification errors.
    externals: {
        '@jupyter-widgets/base': 'JupyterWidgets'
    }
})
