// The map the viewer opens on: e_coli_core, the whole model on one canvas,
// drawn by MetaCarto 2. It is small enough to bundle (95 reactions) and shows
// at a glance what the generated maps are -- regions captioned, pathways that
// can be double-clicked to select, reactions that drag as a whole -- rather
// than a curated Escher map from upstream.
//
// No cobra model is loaded with it. The model only drives model-dependent
// editing -- adding a reaction, highlighting ones the map is missing -- and a
// model can still be loaded from the Model menu; `Builder.load_model` handles
// null explicitly.
import map from './default_map.json'
import { Builder, libs } from '../src/main'

// Where "Map > Load map from library…" reads its index from.
//
// Taken from the query string so a deployment -- or a local check against maps
// that are not published yet -- can point somewhere else without a rebuild:
//
//   ?map_library=http://localhost:8000/map_index.json
//
// When absent, the dialog offers the published collection
// (forxhunter/Awesome_visualization_Metabolic_Network) with a v1/v2 switch,
// on v2 unless the visitor picked v1 before. Given, it replaces the switch.
function mapLibraryUrl () {
  try {
    const value = new URLSearchParams(window.location.search).get('map_library')
    return value || null
  } catch (error) {
    return null
  }
}

window.builder = new Builder( // eslint-disable-line no-new
  map,
  null,
  null,
  libs.d3_select('#root'),
  {
    fill_screen: true,
    never_ask_before_quit: true,
    map_library_url: mapLibraryUrl()
  }
)
