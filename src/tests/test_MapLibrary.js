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
  models: [
    { id: 'RECON1', index: 'RECON1/model_index.json', map_count: 35 },
    { id: 'Recon3D', index: 'Recon3D/model_index.json', map_count: 93 },
    { id: 'e_coli_core', index: 'e_coli_core/model_index.json', map_count: 3 }
  ]
}

/** Let the fetch promise chain settle, then flush preact's render queue. */
function settle () {
  return new Promise(resolve => setTimeout(resolve, 0)).then(() => rerender())
}

/** Type into a filter box the way a user does. */
function typeInto (input, text) {
  input.value = text
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  rerender()
}

/**
 * Open the library the way Builder does.
 *
 * renderWrapper keeps the component behind a Wrapper that returns null while
 * `display` is false, so the dialog is mounted fresh on open rather than kept
 * alive and toggled. Reproducing that here is the whole point: a test that
 * rendered MapLibrary directly would not catch the bug.
 */
function openLibrary (props, refOut) {
  const node = global.document.createElement('div')
  global.document.body.appendChild(node)
  let passProps = null
  const ref = refOut ? instance => { refOut.wrapper = instance } : null
  renderWrapper(MapLibrary, ref, fn => { passProps = fn }, node)
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
  return { node, passProps }
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

  it('filters the model list by a case-insensitive substring', function (done) {
    const { node } = openLibrary({ libraryUrl: 'https://example.invalid/i.json' })
    const shown = () => Array.from(node.querySelectorAll('.map-library-name'))
      .map(el => el.textContent)

    settle().then(() => {
      assert.includeMembers(shown(), ['RECON1', 'Recon3D', 'e_coli_core'],
        'all models should be listed before filtering')

      const filter = node.querySelectorAll('.map-library-filter')[0]
      typeInto(filter, 'recon3d')
      assert.deepEqual(shown(), ['Recon3D'],
        'searching "recon3d" must find Recon3D and nothing else')

      typeInto(filter, 'RECON')
      assert.deepEqual(shown(), ['RECON1', 'Recon3D'])
      done()
    }).catch(done)
  })

  it('reports is_visible so the key manager can suppress shortcuts', () => {
    // Builder puts this wrapper in key_manager.inputList, and KeyManager asks
    // each entry for is_visible() to decide whether to swallow a shortcut.
    // Without that the filter boxes are unusable: backspace is bound to
    // delete-selected-nodes, and r/c/n are bound too, so typing "recon3d"
    // reaches the input as "eo3d" and matches nothing.
    const out = {}
    const { passProps } = openLibrary({ libraryUrl: 'https://example.invalid/i.json' }, out)
    assert.isFunction(out.wrapper.is_visible, 'wrapper must expose is_visible()')
    assert.isTrue(out.wrapper.is_visible(), 'open dialog must report visible')

    passProps({ display: false })
    rerender()
    assert.isFalse(out.wrapper.is_visible(), 'closed dialog must not block keys')
  })
})
