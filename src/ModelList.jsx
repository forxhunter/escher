/** @jsx h */
import { h } from 'preact'
import { matches } from './library'

/**
 * The models of a library index, filtered, for the map library and the map
 * composer.
 *
 * The filter matches the organism as well as the identifier. Nobody remembers
 * that iYO844 is B. subtilis or that iNJ661 is tuberculosis, so filtering on
 * the id alone makes a 108-model list searchable only by people who already
 * know the answer. `search` is built in build_map_index.py and holds the id,
 * the strain, the binomial and a common name; older indexes have no such
 * field, so fall back to the id.
 *
 * @param {Object} props - { models, filter, selected (model id), loading
 *                           (model id), onSelect (model), meta (model -> text) }
 */
export default function ModelList (props) {
  const { filter, selected, loading, onSelect } = props
  const meta = props.meta || (m => `${m.map_count} maps`)
  const models = (props.models || []).filter(m => matches(m.search || m.id, filter))
  // Preact 8 cannot render an array from a component, so the list is ours
  return (
    <ul className='map-library-list'>
      {models.length ? models.map(m => (
        <li
          key={m.id}
          className={'map-library-item' + (m.id === selected ? ' selected' : '')}
          onClick={() => onSelect(m)}
          title={m.organism || undefined}
        >
          <span className='map-library-name'>
            {m.id}
            {m.species
              ? <span className='map-library-species'>
                <i>{m.species}</i>{m.common_name ? ` · ${m.common_name}` : ''}
              </span>
              : null}
          </span>
          <span className='map-library-meta'>
            {loading === m.id ? 'loading…' : meta(m)}
          </span>
        </li>
      )) : <li className='map-library-empty'>No model matches “{filter}”</li>}
    </ul>
  )
}
