/**
 * The published collection of maps, as the dialogs that read it see it.
 *
 * The collection is described by a two-level index so a dialog can open
 * without downloading everything: `map_index.json` lists the models, and each
 * model has its own `model_index.json` fetched when that model is selected. A
 * flat index over a hundred genome-scale models is several megabytes.
 *
 * The map library (MapLibrary.jsx) and the map composer (MapComposer.jsx) both
 * read it, and share the index URLs, the remembered v1/v2 choice, path
 * resolution and fetching from here.
 */

const COLLECTION_URL =
  'https://raw.githubusercontent.com/forxhunter/Awesome_visualization_Metabolic_Network/main/'

/**
 * Index of each generation of the published collection. The collection's
 * own default index, `map_index.json` at its root, lists v2 as well; v1 keeps
 * an index of its own beside it, and its maps stay where they always were.
 */
export const LIBRARY_URLS = {
  v2: COLLECTION_URL + 'v2/map_index.json',
  v1: COLLECTION_URL + 'map_index_v1.json'
}

export const DEFAULT_LIBRARY_VERSION = 'v2'

export const DEFAULT_LIBRARY_URL = LIBRARY_URLS[DEFAULT_LIBRARY_VERSION]

/** Where the chosen generation is remembered between visits. */
export const VERSION_STORAGE_KEY = 'escher.map_library_version'

export function isVersion (value) {
  return Object.prototype.hasOwnProperty.call(LIBRARY_URLS, value)
}

/**
 * The generation the user picked last time, or the default. Storage can be
 * missing or refuse access (private windows, opaque origins, sandboxed
 * iframes); none of that may stop a dialog from opening.
 */
export function storedLibraryVersion () {
  try {
    const value = window.localStorage.getItem(VERSION_STORAGE_KEY)
    if (isVersion(value)) return value
  } catch (error) {}
  return DEFAULT_LIBRARY_VERSION
}

export function storeLibraryVersion (version) {
  try {
    window.localStorage.setItem(VERSION_STORAGE_KEY, version)
  } catch (error) {}
}

/**
 * The index to read: the URL given explicitly (the map_library_url option, or
 * ?map_library= on the deployed viewer) if there is one, else the index of
 * the given generation.
 */
export function libraryIndexUrl (override, version) {
  return override || LIBRARY_URLS[isVersion(version) ? version : DEFAULT_LIBRARY_VERSION]
}

/** A whole-model map (a canvas, or a composed map) rather than one pathway. */
export function isWholeModel (mapInfo) {
  return Boolean(mapInfo.canvas || mapInfo.combined)
}

/**
 * Resolve a map path from the index.
 *
 * An index with no absolute `base_url` resolves against the location it was
 * itself fetched from, so the same file works from a CDN, from a local server
 * during development, or from a mirror, without being rewritten.
 */
export function resolve (index, indexUrl, path) {
  if (/^https?:\/\//.test(path)) return path
  const base = index && index.base_url
  if (base && /^https?:\/\//.test(base)) return base.replace(/\/*$/, '/') + path
  return String(indexUrl).replace(/[^/]*(\?.*)?$/, '') + path
}

/** Case-insensitive substring match; an empty filter matches everything. */
export function matches (text, filter) {
  return !filter || String(text).toLowerCase().indexOf(filter.toLowerCase()) !== -1
}

/** Fetch a JSON document, failing on an HTTP error status. */
export function fetchJson (url) {
  return window.fetch(url).then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  })
}
