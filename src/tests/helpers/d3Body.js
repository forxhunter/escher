/* global global */

const jsdom = require('jsdom')
const { JSDOM } = jsdom
const d3Select = require('d3-selection').select

// body selection
const dom = new JSDOM('', { pretendToBeVisual: true })
const document = dom.window.document
const d3Body = d3Select(document).select('body')

// globals
global.document = document
global.window = dom.window
// Node 21 defines `navigator` as a getter-only global, so a plain assignment
// throws "Cannot set property navigator of #<Object> which has only a getter"
// while this module is being loaded -- which took down the whole suite before
// a single test ran, not just the ones that need it. Define it instead, and
// only when it is not already there.
if (!global.navigator) {
  Object.defineProperty(global, 'navigator', {
    value: { platform: 'node.js' },
    configurable: true
  })
}

// Dummy SVGElement for d3-zoom.js:L87
const Dummy = () => {}
Dummy.prototype = {}
global.SVGElement = Dummy

module.exports = d3Body
