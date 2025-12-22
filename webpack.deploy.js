const path = require('path')
const merge = require('webpack-merge')
const common = require('./webpack.common.js')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = merge.smart(common, {
    mode: 'production',
    entry: {
        'escher': './dev-server/index.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
    },
    optimization: {
        minimizer: [
            new UglifyJsPlugin({
                sourceMap: true
            })
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: 'Escher',
            template: './dev-server/index.html',
            meta: {
                'viewport': 'width=device-width, initial-scale=1, shrink-to-fit=no'
            }
        })
    ],
    externals: ['@jupyter-widgets/base']
})
