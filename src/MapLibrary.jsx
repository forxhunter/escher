/** MapLibrary
 *
 * A browser for a published collection of Escher maps. Escher can only open a
 * map the user already has on disk; this lets a map be picked from a hosted
 * library instead.
 *
 * The library is described by a two-level index so the picker can open without
 * downloading everything: `map_index.json` lists the models, and each model has
 * its own `model_index.json` fetched when that model is selected. A flat index
 * over a hundred genome-scale models is several megabytes.
 *
 * The collection holds two generations of maps: v1 at the repository root and
 * v2 under `v2/`, each with an index of the same shape. A switch at the top of
 * the dialog picks one, v2 unless the user chose otherwise before. A library
 * URL given explicitly (the map_library_url option, or ?map_library= on the
 * deployed viewer) wins, and the switch is not shown.
 */

/** @jsx h */
import { h, Component } from 'preact'
import ModelList from './ModelList'
import {
  LIBRARY_URLS,
  DEFAULT_LIBRARY_URL,
  isVersion,
  isWholeModel,
  storedLibraryVersion,
  storeLibraryVersion,
  resolve,
  matches,
  fetchJson
} from './library'
import './MapLibrary.css'

// The collection's URLs and the remembered choice live in library.js, which
// the map composer reads too; they stay importable from here.
export {
  LIBRARY_URLS,
  DEFAULT_LIBRARY_VERSION,
  DEFAULT_LIBRARY_URL,
  VERSION_STORAGE_KEY,
  storedLibraryVersion
} from './library'

class MapLibrary extends Component {
  constructor (props) {
    super(props)
    this.state = {
      index: null,
      indexUrl: null,
      indexError: null,
      loadingIndex: false,
      model: null,
      modelMaps: null,
      modelError: null,
      loadingModel: null,
      loadingMap: null,
      modelFilter: '',
      mapFilter: '',
      version: storedLibraryVersion()
    }
  }

  componentDidMount () {
    // The index fetch has to be triggered here as well as in
    // componentWillReceiveProps, and this is the path that actually runs.
    //
    // renderWrapper's Wrapper returns null while `display` is false, so this
    // component is not kept alive and toggled -- it is unmounted when the
    // dialog closes and *mounted fresh* when it opens. React/Preact do not
    // call componentWillReceiveProps on mount, so for the ordinary case of
    // opening the dialog nothing ever fetched the index: `index` stayed null,
    // `loadingIndex` stayed false, and renderBody fell through to its last
    // branch and displayed "No map library loaded." forever.
    if (this.props.display) {
      this.addEscape()
      if (!this.state.index && !this.state.loadingIndex) this.fetchIndex()
    }
  }

  componentWillReceiveProps (nextProps) {
    if (nextProps.display && !this.props.display) {
      this.addEscape()
      if (!this.state.index && !this.state.loadingIndex) this.fetchIndex(nextProps)
    } else if (!nextProps.display && this.props.display) {
      this.removeEscape()
    }
  }

  componentWillUnmount () {
    this.removeEscape()
  }

  addEscape () {
    if (this.clearEscape || !this.props.map) return
    this.clearEscape = this.props.map.key_manager.addEscapeListener(
      () => this.close(), true
    )
  }

  removeEscape () {
    if (this.clearEscape) {
      this.clearEscape()
      this.clearEscape = null
    }
  }

  close () {
    this.removeEscape()
    if (this.props.closeMapLibrary) this.props.closeMapLibrary()
  }

  /** Whether the library URL was given explicitly, which hides the switch. */
  hasUrlOverride (props) {
    return Boolean((props || this.props).libraryUrl)
  }

  libraryUrl (props, version) {
    return (props || this.props).libraryUrl ||
      LIBRARY_URLS[isVersion(version) ? version : this.state.version] || DEFAULT_LIBRARY_URL
  }

  fetchIndex (props, version) {
    const url = this.libraryUrl(props, version)
    // a response that arrives after the user switched collections is stale
    this.indexRequest = url
    this.setState({ loadingIndex: true, indexError: null })
    fetchJson(url)
      .then(index => {
        if (this.indexRequest !== url) return
        this.setState({ index, indexUrl: url, loadingIndex: false })
        const models = index.models || []
        if (models.length === 1) this.selectModel(models[0], index)
      })
      .catch(error => {
        if (this.indexRequest !== url) return
        this.setState({
          loadingIndex: false,
          indexError: `Could not load the map library from ${url} (${error.message})`
        })
      })
  }

  /** Switch between the v1 and v2 collections, and remember the choice. */
  selectVersion (version) {
    if (!isVersion(version) || version === this.state.version) return
    storeLibraryVersion(version)
    this.modelRequest = null
    this.setState({
      version,
      index: null,
      indexUrl: null,
      model: null,
      modelMaps: null,
      modelError: null,
      loadingModel: null,
      mapFilter: ''
    })
    this.fetchIndex(this.props, version)
  }

  selectModel (model, indexOverride) {
    const index = indexOverride || this.state.index
    if (!index) return
    this.setState({
      model: model.id,
      modelMaps: null,
      modelError: null,
      loadingModel: model.id,
      mapFilter: ''
    })
    const url = resolve(index, this.state.indexUrl || this.libraryUrl(), model.index)
    // ignore the answer if another model or collection was picked meanwhile
    this.modelRequest = url
    fetchJson(url)
      .then(data => {
        if (this.modelRequest !== url) return
        this.setState({ modelMaps: data.maps || [], loadingModel: null })
      })
      .catch(error => {
        if (this.modelRequest !== url) return
        this.setState({
          loadingModel: null,
          modelError: `Could not load ${model.id} (${error.message})`
        })
      })
  }

  selectMap (mapInfo) {
    const index = this.state.index
    if (!index) return
    const url = resolve(index, this.state.indexUrl || this.libraryUrl(), mapInfo.path)
    this.setState({ loadingMap: mapInfo.path, modelError: null })
    fetchJson(url)
      .then(mapData => {
        this.setState({ loadingMap: null })
        this.props.loadMap(mapData)
        this.close()
      })
      .catch(error => this.setState({
        loadingMap: null,
        modelError: `Could not load ${mapInfo.name} (${error.message})`
      }))
  }

  renderMaps () {
    const { modelMaps, mapFilter, loadingMap, model, loadingModel, modelError } = this.state
    if (loadingModel) return <li className='map-library-empty'>Loading {loadingModel}…</li>
    if (modelError) return <li className='map-library-error'>{modelError}</li>
    if (!model) return <li className='map-library-empty'>Pick a model on the left.</li>
    if (!modelMaps) return null

    // whole-model maps first, the rest in index order
    const shown = modelMaps.filter(m => matches(m.name, mapFilter))
    const maps = shown.filter(isWholeModel).concat(shown.filter(m => !isWholeModel(m)))
    if (!maps.length) {
      return <li className='map-library-empty'>No map matches “{mapFilter}”</li>
    }
    return maps.map(m => (
      <li
        key={m.path}
        className={'map-library-item' + (isWholeModel(m) ? ' combined' : '')}
        onClick={() => this.selectMap(m)}
      >
        <span className='map-library-name'>
          {m.name}{isWholeModel(m) ? ' (whole model)' : ''}
        </span>
        <span className='map-library-meta'>
          {loadingMap === m.path
            ? 'loading…'
            : `${m.reactions} rxns · ${m.nodes} nodes`}
        </span>
      </li>
    ))
  }

  renderBody () {
    const { index, indexError, loadingIndex, modelFilter, mapFilter } = this.state
    if (loadingIndex) return <div className='map-library-status'>Loading map library…</div>
    if (indexError) {
      return (
        <div className='map-library-status map-library-error'>
          {indexError}
          <button className='map-library-retry' onClick={() => this.fetchIndex()}>
            Retry
          </button>
        </div>
      )
    }
    if (!index) return <div className='map-library-status'>No map library loaded.</div>

    return (
      <div className='map-library-columns'>
        <div className='map-library-column'>
          <input
            className='map-library-filter'
            placeholder='Filter models — id, species or common name'
            value={modelFilter}
            onInput={event => this.setState({ modelFilter: event.target.value })}
          />
          <ModelList
            models={index.models}
            filter={modelFilter}
            selected={this.state.model}
            loading={this.state.loadingModel}
            onSelect={m => this.selectModel(m)}
          />
        </div>
        <div className='map-library-column'>
          <input
            className='map-library-filter'
            placeholder='Filter maps'
            value={mapFilter}
            onInput={event => this.setState({ mapFilter: event.target.value })}
          />
          <ul className='map-library-list'>{this.renderMaps()}</ul>
        </div>
      </div>
    )
  }

  renderVersions () {
    if (this.hasUrlOverride()) return null
    const titles = {
      v2: 'Maps from the current layout pipeline',
      v1: 'The earlier collection'
    }
    return (
      <span className='map-library-versions' role='group' aria-label='Map collection'>
        {Object.keys(LIBRARY_URLS).map(version => (
          <button
            key={version}
            className={'map-library-version' + (version === this.state.version ? ' selected' : '')}
            aria-pressed={version === this.state.version ? 'true' : 'false'}
            title={titles[version]}
            onClick={() => this.selectVersion(version)}
          >
            {version}
          </button>
        ))}
      </span>
    )
  }

  render () {
    if (!this.props.display) return null
    const { index } = this.state
    return (
      <div className='map-library-backdrop' onClick={() => this.close()}>
        <div className='map-library' onClick={event => event.stopPropagation()}>
          <div className='map-library-header'>
            <span className='map-library-title'>Map library</span>
            {this.renderVersions()}
            {index && (
              <span className='map-library-subtitle'>
                {index.models.length} models · {index.map_count} maps
                {index.generated ? ` · generated ${index.generated}` : ''}
              </span>
            )}
            <button className='map-library-close' onClick={() => this.close()}>×</button>
          </div>
          {this.renderBody()}
        </div>
      </div>
    )
  }
}

export default MapLibrary
