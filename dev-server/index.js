// The map the viewer opens on: the mevalonate pathway of Recon3D, drawn by
// MetaCarto. It is the figure the manuscript uses, so what a visitor sees
// first is the output of the tool this deployment exists to show, rather than
// a curated Escher map from upstream.
//
// No cobra model is loaded with it. The model only drives model-dependent
// editing -- adding a reaction, highlighting ones the map is missing -- and
// Recon3D's COBRA JSON is 10,600 reactions, far too large to bundle for that.
// `Builder.load_model` handles null explicitly, and a model can still be
// loaded from the Model menu.
import map from './default_map.json'
import { Builder, libs } from '../src/main'

// Where "Map > Load map from library…" reads its index from.
//
// Taken from the query string so a deployment -- or a local check against maps
// that are not published yet -- can point somewhere else without a rebuild:
//
//   ?map_library=http://localhost:8000/map_index.json
//
// Falls back to the built-in default (forxhunter/Awesome_visualization_Metabolic_Network) when absent.
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
