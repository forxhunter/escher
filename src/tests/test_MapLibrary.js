/** @jsx h */
// This test sets up jsdom itself rather than using ./helpers/d3Body, which
// does `global.navigator = ...` and throws on Node >= 21 where `navigator` is
// a getter-only global. Importing MapLibrary pulls in MapLibrary.css through
// style-loader, which touches `window` at module load time, so the globals
// have to exist before that require runs.
/* global global */
const { JSDOM } = require('jsdom')

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true
})
global.document = dom.window.document
global.window = dom.window

const { rerender } = require('preact')
const MapLibrary = require('../MapLibrary').default
const renderWrapper = require('../renderWrapper').default

const describe = require('mocha').describe
const it = require('mocha').it
const beforeEach = require('mocha').beforeEach
const afterEach = require('mocha').afterEach
const assert = require('chai').assert

const INDEX = {
  schema: 1,
  base_url: '',
  models: [{ id: 'e_coli_core', index: 'e_coli_core/model_index.json', map_count: 3 }]
}

/**
 * Open the library the way Builder does.
 *
 * renderWrapper keeps the component behind a Wrapper that returns null while
 * `display` is false, so the dialog is mounted fresh on open rather than kept
 * alive and toggled. Reproducing that here is the whole point: a test that
 * rendered MapLibrary directly would not catch the bug.
 */
function openLibrary (props) {
  const node = global.document.createElement('div')
  global.document.body.appendChild(node)
  let passProps = null
  renderWrapper(MapLibrary, null, fn => { passProps = fn }, node)
  passProps(Object.assign({
    display: false,
    loadMap: () => {},
    closeMapLibrary: () => {}
  }, props))
  rerender()
  passProps({ display: true })
  // Preact 8 batches setState, so the mount that triggers the fetch has not
  // happened yet when passProps returns. rerender() flushes it synchronously.
  rerender()
  return node
}

describe('MapLibrary', () => {
  let originalFetch
  let calls

  beforeEach(() => {
    calls = []
    originalFetch = global.window.fetch
    global.window.fetch = url => {
      calls.push(url)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(INDEX)
      })
    }
  })

  afterEach(() => {
    global.window.fetch = originalFetch
  })

  it('fetches the index when the dialog is opened', () => {
    // Regression: the fetch used to live only in componentWillReceiveProps,
    // which does not fire on mount. Because the wrapper unmounts the component
    // while hidden, opening the dialog mounted it fresh and nothing ever
    // fetched -- the dialog rendered "No map library loaded." permanently.
    openLibrary({ libraryUrl: 'https://example.invalid/map_index.json' })
    assert.lengthOf(calls, 1, 'expected exactly one index fetch on open')
    assert.strictEqual(calls[0], 'https://example.invalid/map_index.json')
  })

  it('falls back to the published library when no url is supplied', () => {
    openLibrary({})
    assert.lengthOf(calls, 1)
    assert.include(calls[0], 'escher_maps_BiGG')
  })
})
