/** @jsx h */
// Use the suite-wide jsdom from ./helpers/d3Body rather than a private one.
// Importing MapLibrary pulls in MapLibrary.css through style-loader, which
// touches `window` at module load time, so the helper has to be required
// before MapLibrary is. A private JSDOM here used to replace global.document
// after Mousetrap had bound its listeners to the helper's document, so every
// KeyManager test that dispatches a key on global.document failed when the
// whole suite ran, while passing on its own.
/* global global */
require('./helpers/d3Body')

const { rerender } = require('preact')
const MapLibrary = require('../MapLibrary').default
const { LIBRARY_URLS, VERSION_STORAGE_KEY } = require('../MapLibrary')
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
  input.dispatchEvent(new global.window.Event('input', { bubbles: true }))
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
    assert.include(calls[0], 'Awesome_visualization_Metabolic_Network')
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

  it('filters the model list by organism, not only by BiGG id', function (done) {
    // A BiGG id carries no hint of the organism, so a 108-model list is
    // searchable only by someone who already knows that iYO844 is B. subtilis
    // and iNJ661 is tuberculosis. build_map_index.py puts the id, the strain,
    // the binomial and a common name into `search` for exactly this.
    const index = {
      schema: 1,
      base_url: '',
      models: [
        { id: 'iYO844',
          index: 'iYO844/model_index.json',
          map_count: 14,
          organism: 'Bacillus subtilis subsp. subtilis str. 168',
          species: 'Bacillus subtilis',
          common_name: 'hay bacillus',
          search: 'iyo844 bacillus subtilis subsp. subtilis str. 168 bacillus subtilis hay bacillus' },
        { id: 'iNJ661',
          index: 'iNJ661/model_index.json',
          map_count: 21,
          organism: 'Mycobacterium tuberculosis H37Rv',
          species: 'Mycobacterium tuberculosis',
          common_name: 'tuberculosis',
          search: 'inj661 mycobacterium tuberculosis h37rv mycobacterium tuberculosis tuberculosis' }
      ]
    }
    global.window.fetch = () => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve(index)
    })
    const { node } = openLibrary({ libraryUrl: 'https://example.invalid/i.json' })
    // firstChild is the id text node; the species sits in a sibling span.
    const ids = () => Array.from(node.querySelectorAll('.map-library-name'))
      .map(el => el.firstChild.textContent.trim())

    settle().then(() => {
      const filter = node.querySelectorAll('.map-library-filter')[0]

      typeInto(filter, 'tuberculosis')
      assert.deepEqual(ids(), ['iNJ661'],
        'a common name the id does not contain must still find the model')

      typeInto(filter, 'Bacillus')
      assert.deepEqual(ids(), ['iYO844'],
        'the binomial must match too')

      typeInto(filter, 'iNJ')
      assert.deepEqual(ids(), ['iNJ661'],
        'filtering by id must keep working')
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

/** Replace window.localStorage for one test; jsdom on about:blank has none. */
function withStorage (storage, fn) {
  const original = Object.getOwnPropertyDescriptor(global.window, 'localStorage')
  Object.defineProperty(global.window, 'localStorage', {
    configurable: true,
    get: () => {
      if (storage === null) throw new Error('SecurityError: storage is disabled')
      return storage
    }
  })
  const restore = () => {
    if (original) Object.defineProperty(global.window, 'localStorage', original)
    else delete global.window.localStorage
  }
  return Promise.resolve().then(fn).then(restore, error => { restore(); throw error })
}

function memoryStorage () {
  const data = {}
  return {
    data,
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value) }
  }
}

describe('MapLibrary collections', () => {
  let originalFetch
  let calls
  let maps

  beforeEach(() => {
    calls = []
    maps = []
    originalFetch = global.window.fetch
    global.window.fetch = url => {
      calls.push(url)
      const body = /model_index\.json$/.test(url) ? { maps } : INDEX
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    }
  })

  afterEach(() => {
    global.window.fetch = originalFetch
  })

  const versionButtons = node => Array.from(node.querySelectorAll('.map-library-version'))

  it('opens on the v2 collection by default', () => withStorage(memoryStorage(), () => {
    const { node } = openLibrary({})
    assert.deepEqual(calls, [ LIBRARY_URLS.v2 ])
    assert.match(LIBRARY_URLS.v2, /\/main\/v2\/map_index\.json$/)
    assert.deepEqual(versionButtons(node).map(b => b.textContent), [ 'v2', 'v1' ])
    assert.strictEqual(node.querySelector('.map-library-version.selected').textContent, 'v2')
  }))

  it('switches to v1, the root index, and remembers it', () => {
    const storage = memoryStorage()
    return withStorage(storage, () => {
      const { node } = openLibrary({})
      return settle().then(() => {
        versionButtons(node).filter(b => b.textContent === 'v1')[0].click()
        rerender()
        assert.strictEqual(calls[calls.length - 1], LIBRARY_URLS.v1)
        assert.match(LIBRARY_URLS.v1, /\/main\/map_index\.json$/)
        assert.strictEqual(storage.data[VERSION_STORAGE_KEY], 'v1')
        return settle()
      }).then(() => {
        assert.strictEqual(node.querySelector('.map-library-version.selected').textContent, 'v1')
        // the next time the dialog opens, it is on v1
        calls.length = 0
        openLibrary({})
        assert.deepEqual(calls, [ LIBRARY_URLS.v1 ])
      })
    })
  })

  it('uses an explicit library url, and shows no switch', () => {
    const storage = memoryStorage()
    storage.data[VERSION_STORAGE_KEY] = 'v1'
    return withStorage(storage, () => {
      const { node } = openLibrary({ libraryUrl: 'http://localhost:8000/map_index.json' })
      assert.deepEqual(calls, [ 'http://localhost:8000/map_index.json' ])
      assert.lengthOf(versionButtons(node), 0)
    })
  })

  it('works when storage is unavailable', () => withStorage(null, () => {
    const { node } = openLibrary({})
    assert.deepEqual(calls, [ LIBRARY_URLS.v2 ])
    versionButtons(node).filter(b => b.textContent === 'v1')[0].click()
    rerender()
    assert.strictEqual(calls[calls.length - 1], LIBRARY_URLS.v1)
  }))

  it('ignores a stored value that is not a collection', () => {
    const storage = memoryStorage()
    storage.data[VERSION_STORAGE_KEY] = 'toString'
    return withStorage(storage, () => {
      openLibrary({})
      assert.deepEqual(calls, [ LIBRARY_URLS.v2 ])
    })
  })

  it('lists whole-model maps first', () => withStorage(memoryStorage(), () => {
    maps = [
      { name: 'Amino acid metabolism', path: 'e/a.json', reactions: 40, nodes: 200 },
      { name: 'e_coli_core', path: 'e/e_coli_core_Canvas.json', reactions: 95, nodes: 603, canvas: true },
      { name: 'Carbohydrate metabolism', path: 'e/c.json', reactions: 38, nodes: 300 },
      { name: 'Combined', path: 'e/e_coli_core_Combined.json', reactions: 95, nodes: 700, combined: true }
    ]
    const { node } = openLibrary({})
    return settle().then(() => {
      // e_coli_core is the third model in INDEX
      node.querySelectorAll('.map-library-list')[0].querySelectorAll('.map-library-item')[2].click()
      rerender()
      return settle()
    }).then(() => {
      const names = Array.from(node.querySelectorAll('.map-library-list')[1]
        .querySelectorAll('.map-library-name')).map(el => el.textContent)
      assert.deepEqual(names, [
        'e_coli_core (whole model)',
        'Combined (whole model)',
        'Amino acid metabolism',
        'Carbohydrate metabolism'
      ])
    })
  }))
})
