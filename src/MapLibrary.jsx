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
 */

/** @jsx h */
import { h, Component } from 'preact'
import './MapLibrary.css'

export const DEFAULT_LIBRARY_URL =
  'https://raw.githubusercontent.com/forxhunter/escher_maps_BiGG/main/map_index.json'

/**
 * Resolve a map path from the index.
 *
 * An index with no absolute `base_url` resolves against the location it was
 * itself fetched from, so the same file works from a CDN, from a local server
 * during development, or from a mirror, without being rewritten.
 */
function resolve (index, indexUrl, path) {
  if (/^https?:\/\//.test(path)) return path
  const base = index && index.base_url
  if (base && /^https?:\/\//.test(base)) return base.replace(/\/*$/, '/') + path
  return String(indexUrl).replace(/[^/]*(\?.*)?$/, '') + path
}

function matches (text, filter) {
  return !filter || String(text).toLowerCase().indexOf(filter.toLowerCase()) !== -1
}

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
      mapFilter: ''
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

  libraryUrl (props) {
    return (props || this.props).libraryUrl || DEFAULT_LIBRARY_URL
  }

  fetchIndex (props) {
    const url = this.libraryUrl(props)
    this.setState({ loadingIndex: true, indexError: null })
    window.fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(index => {
        this.setState({ index, indexUrl: url, loadingIndex: false })
        const models = index.models || []
        if (models.length === 1) this.selectModel(models[0], index)
      })
      .catch(error => this.setState({
        loadingIndex: false,
        indexError: `Could not load the map library from ${url} (${error.message})`
      }))
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
    window.fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(data => this.setState({ modelMaps: data.maps || [], loadingModel: null }))
      .catch(error => this.setState({
        loadingModel: null,
        modelError: `Could not load ${model.id} (${error.message})`
      }))
  }

  selectMap (mapInfo) {
    const index = this.state.index
    if (!index) return
    const url = resolve(index, this.state.indexUrl || this.libraryUrl(), mapInfo.path)
    this.setState({ loadingMap: mapInfo.path, modelError: null })
    window.fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
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

  renderModels () {
    const { index, modelFilter, model, loadingModel } = this.state
    const models = (index.models || []).filter(m => matches(m.id, modelFilter))
    if (!models.length) {
      return <li className='map-library-empty'>No model matches “{modelFilter}”</li>
    }
    return models.map(m => (
      <li
        key={m.id}
        className={'map-library-item' + (m.id === model ? ' selected' : '')}
        onClick={() => this.selectModel(m)}
      >
        <span className='map-library-name'>{m.id}</span>
        <span className='map-library-meta'>
          {loadingModel === m.id ? 'loading…' : `${m.map_count} maps`}
        </span>
      </li>
    ))
  }

  renderMaps () {
    const { modelMaps, mapFilter, loadingMap, model, loadingModel, modelError } = this.state
    if (loadingModel) return <li className='map-library-empty'>Loading {loadingModel}…</li>
    if (modelError) return <li className='map-library-error'>{modelError}</li>
    if (!model) return <li className='map-library-empty'>Pick a model on the left.</li>
    if (!modelMaps) return null

    const maps = modelMaps.filter(m => matches(m.name, mapFilter))
    if (!maps.length) {
      return <li className='map-library-empty'>No map matches “{mapFilter}”</li>
    }
    return maps.map(m => (
      <li
        key={m.path}
        className={'map-library-item' + (m.combined ? ' combined' : '')}
        onClick={() => this.selectMap(m)}
      >
        <span className='map-library-name'>
          {m.name}{m.combined ? ' (whole model)' : ''}
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
            placeholder='Filter models'
            value={modelFilter}
            onInput={event => this.setState({ modelFilter: event.target.value })}
          />
          <ul className='map-library-list'>{this.renderModels()}</ul>
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

  render () {
    if (!this.props.display) return null
    const { index } = this.state
    return (
      <div className='map-library-backdrop' onClick={() => this.close()}>
        <div className='map-library' onClick={event => event.stopPropagation()}>
          <div className='map-library-header'>
            <span className='map-library-title'>Map library</span>
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
