import map from '../docs/_static/example_data/S5_iJO1366.Glycolysis_PPP_AA_Nucleotides.json'
import model from '../docs/_static/example_data/iJO1366.json'
import { Builder, libs } from '../src/main'

// Where "Map > Load map from library…" reads its index from.
//
// Taken from the query string so a deployment -- or a local check against maps
// that are not published yet -- can point somewhere else without a rebuild:
//
//   ?map_library=http://localhost:8000/map_index.json
//
// Falls back to the built-in default (forxhunter/escher_maps_BiGG) when absent.
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
  model,
  null,
  libs.d3_select('#root'),
  {
    fill_screen: true,
    never_ask_before_quit: true,
    map_library_url: mapLibraryUrl()
  }
)
