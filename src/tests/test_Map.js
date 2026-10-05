// jsdom first: Mousetrap, imported by Map, needs a window when it loads
const d3Body = require('./helpers/d3Body')
const Map = require('../Map').default
const Settings = require('../Settings').default
const CobraModel = require('../CobraModel')

const describe = require('mocha').describe
const it = require('mocha').it
const beforeEach = require('mocha').beforeEach
const assert = require('chai').assert

const get_map = require('./helpers/get_map')
const getV2Map = require('./helpers/get_v2_map')

const _ = require('underscore')

function matching_reaction (reactions, id) {
  let match = null
  for (let r_id in reactions) {
    const r = reactions[r_id]
    if (r.bigg_id === id) {
      match = r
      break
    }
  }
  return match
}

/**
 * Load map data the way Builder does, into a fresh svg, with the settings that
 * need streams.
 */
function loadMap (data, options) {
  const svg = d3Body.append('svg')
  const sel = svg.append('g')
  const requiredOptions = Object.assign({
    reaction_scale: [],
    reaction_scale_preset: null,
    metabolite_scale: [],
    metabolite_scale_preset: null,
    reaction_styles: [],
    reaction_compare_style: 'diff',
    metabolite_styles: [],
    metabolite_compare_style: 'diff',
    cofactors: []
  }, options)
  const requiredConditionalOptions = [ 'reaction_scale', 'metabolite_scale' ]
  return Map.from_data(
    data,
    svg,
    null,
    sel,
    null,
    new Settings(requiredOptions, requiredConditionalOptions),
    null,
    true
  )
}

describe('Map', () => {
  let map

  beforeEach(() => {
    map = loadMap(get_map())
  })

  it('initializes', () => {
    assert.ok(map)
  })

  it('def is the first element in the svg', () => {
    // this fixes a bug with export SVG files to certain programs,
    // e.g. Inkscape for Windows
    const defs_node = d3Body.select('defs').node()
    assert.strictEqual(defs_node.parentNode.firstChild, defs_node)
  })

  it('loads with reaction/metabolite data', () => {
    // no data
    assert.strictEqual(map.has_data_on_reactions, false)
    assert.strictEqual(map.has_data_on_nodes, false)
  })

  it('loads without reaction/metabolite data', () => {
    // data
    map.apply_reaction_data_to_map({'GLCtex': 100})
    map.apply_metabolite_data_to_map({'glc__D_p': 3})

    // make sure ids are saved correctly
    for (let id in map.reactions) {
      // ids should be strings that eval to integers
      assert.strictEqual(isNaN(id), false)
      // bigg ids should be present
      assert.isDefined(map.reactions[id].bigg_id)
      assert.isUndefined(map.reactions[id].bigg_id_compartmentalized)
    }

    for (let id in map.nodes) {
      const node = map.nodes[id]
      // ids should be strings that eval to integers
      assert.strictEqual(isNaN(id), false)
      if (node.node_type === 'metabolite') {
        // bigg ids and compartments should be present
        assert.isDefined(map.nodes[id].bigg_id)
      }
    }

    assert.isTrue(map.has_data_on_reactions)
    for (let id in map.reactions) {
      const reaction = map.reactions[id]
      if (reaction.bigg_id === 'GLCtex') {
        assert.strictEqual(reaction.data, 100)
        assert.strictEqual(reaction.data_string, '100.0')
      } else {
        assert.strictEqual(reaction.data, null)
      }
    }

    assert.strictEqual(map.has_data_on_nodes, true)
    for (let id in map.nodes) {
      const node = map.nodes[id]
      if (node.bigg_id_compartmentalized === 'glc__D_p') {
        assert.strictEqual(map.nodes[id].data, 3)
      } else {
        assert.strictEqual(map.nodes[id].data, null)
      }
    }

    map.apply_reaction_data_to_map(null)
    assert.strictEqual(map.has_data_on_reactions, false)
    for (let id in map.reactions) {
      assert.strictEqual(map.reactions[id].data, null)
    }

    map.apply_metabolite_data_to_map(null)
    assert.isFalse(map.has_data_on_nodes)
    for (let id in map.nodes) {
      assert.strictEqual(map.nodes[id].data, null)
    }
  })

  it('search index reactions', () => {
    assert.deepEqual(map.search_index.find('glyceraldehyde-3-phosphate dehydrogenase')[0],
                     { type: 'reaction', reaction_id: '1576769' })
    assert.deepEqual(map.search_index.find('GAPD')[0],
                     { type: 'reaction', reaction_id: '1576769' })
    assert.deepEqual(map.search_index.find('b1779')[0],
                     { type: 'reaction', reaction_id: '1576769' })
    assert.deepEqual(map.search_index.find('gapA')[0],
                     { type: 'reaction', reaction_id: '1576769' })
  })

  it('search index metabolites', () => {
    assert.deepEqual(map.search_index.find('Glyceraldehyde-3-phosphate')[0],
                     { type: 'metabolite', node_id: '1576545' })
    assert.deepEqual(map.search_index.find('^g3p_c$')[0],
                     { type: 'metabolite', node_id: '1576545' })
  })

  it('search index text labels', () => {
    assert.deepEqual(map.search_index.find('TEST')[0],
                     { type: 'text_label', text_label_id: '1' })
  })

  it('search index delete', () => {
    // delete reactions
    map.delete_reaction_data(['1576769'])
    assert.deepEqual(map.search_index.find('glyceraldehyde-3-phosphatedehydrogenase'), [])
    assert.deepEqual(map.search_index.find('GAPD'), [])
    assert.deepEqual(map.search_index.find('b1779'), [])
    // delete nodes
    map.delete_node_data(['1576545', '1576575'])
    assert.deepEqual(map.search_index.find('Glyceraldehyde-3-phosphate'), [])
    assert.deepEqual(map.search_index.find('^g3p_c$'), [])
    // delete text_labels
    map.delete_text_label_data(['1'])
    assert.deepEqual(map.search_index.find('TEST'), [])
  })

  it('search index extend reactions', () => {
    map.extend_reactions({ '123456789': { bigg_id: 'EX_glc__D_p',
                                          name: 'periplasmic glucose exchange',
                                          gene_reaction_rule: 's0001',
                                          genes: [ { 'bigg_id': 's0001',
                                                     'name': 'spontaneous'} ] } })
    assert.deepEqual(map.search_index.find('EX_glc__D_p')[0],
                     { type: 'reaction', reaction_id: '123456789' })
    assert.deepEqual(map.search_index.find('periplasmic glucose exchange')[0],
                     { type: 'reaction', reaction_id: '123456789' })
    assert.deepEqual(map.search_index.find('s0001')[0],
                     { type: 'reaction', reaction_id: '123456789' })
    assert.deepEqual(map.search_index.find('spontaneous')[0],
                     { type: 'reaction', reaction_id: '123456789' })
  })

  it('search index extend nodes', () => {
    map.extend_nodes({ '123456789': { bigg_id: 'glc__D_p',
                                      name: 'periplasmic glucose',
                                      node_type: 'metabolite' }})
    assert.deepEqual(map.search_index.find('^glc__D_p')[0],
                     { type: 'metabolite', node_id: '123456789' })
    assert.deepEqual(map.search_index.find('periplasmic glucose$')[0],
                     { type: 'metabolite', node_id: '123456789' })
  })

  it('search index new/edit text label', () => {
    const id = map.new_text_label({ x: 0, y: 0 }, 'TESTEST')
    assert.deepEqual(map.search_index.find('TESTEST')[0],
                     { type: 'text_label', text_label_id: id })
    map.edit_text_label(id, 'TESTESTEST', false)
    assert.deepEqual(map.search_index.find('^TESTEST$'), [])
    assert.deepEqual(map.search_index.find('TESTESTEST')[0],
                     { type: 'text_label', text_label_id: id })
  })

  it('new_reaction_from_scratch', () => {
    const model_data = { reactions: [ { id: 'acc_tpp',
                                        metabolites: { acc_c: 1, acc_p: -1 },
                                        gene_reaction_rule: 'Y1234'
                                      }
                                    ],
                         metabolites: [ { id: 'acc_c',
                                          formula: 'C3H2' },
                                        { id: 'acc_p',
                                          formula: 'C3H2' }
                                      ],
                         genes: []
                       }
    const model = CobraModel.from_cobra_json(model_data)
    map.cobra_model = model

    map.new_reaction_from_scratch('acc_tpp', { x: 0, y: 0 }, 0)

    // find the reaction
    const match = matching_reaction(map.reactions, 'acc_tpp')
    assert.ok(match)
    // gene reaction rule
    assert.strictEqual(match.gene_reaction_rule,
                       model_data.reactions[0].gene_reaction_rule)
  })

  it('new_reaction_from_scratch exchanges', () => {
    ;[ 'uptake', 'secretion' ].map(direction => {
      const model_data = {
        reactions: [ {
          id: 'EX_glc__D_e',
          metabolites: { glc__D_e: direction === 'uptake' ? 1 : -1 },
          gene_reaction_rule: ''
        } ],
        metabolites: [{
          id: 'glc__D_e',
          formula: 'C6H12O6'
        }],
        genes: []
      }
      const model = CobraModel.from_cobra_json(model_data)
      map.cobra_model = model

      map.new_reaction_from_scratch('EX_glc__D_e', { x: 0, y: 0 }, 30)

      // find the reaction
      const match = matching_reaction(map.reactions, 'EX_glc__D_e')
      assert.ok(match)
      // segments
      assert.strictEqual(_.size(match.segments), 3)
    })
  })

  it('get_data_statistics accepts numbers or strings as floats; ignores empty strings and nulls', () => {
    const dataReactions = { PGI: [10], GAPD: ['5'], TPI: [''], PGK: [null] }
    map.apply_reaction_data_to_map(dataReactions)
    map.calc_data_stats('reaction')
    assert.deepEqual(
      map.get_data_statistics(),
      {
        reaction: { min: 5, median: 7.5, mean: 7.5, Q1: 5, Q3: 10, max: 10 },
        metabolite: null
      }
    )
    // metabolites
    const dataMetabolites = { g3p_c: [10], fdp_c: ['4'] }
    map.apply_metabolite_data_to_map(dataMetabolites)
    map.calc_data_stats('metabolite')
    assert.deepEqual(
      map.get_data_statistics(),
      { reaction: { min: 5, median: 7.5, mean: 7.5, Q1: 5, Q3: 10, max: 10 },
        metabolite: { min: 4, median: 10, mean: 8, Q1: 4, Q3: 10, max: 10 }
      }
    )
  })

  it('get_data_statistics uses defaults for no data -- reactions', () => {
    assert.deepEqual(map.get_data_statistics(), { reaction: null, metabolite: null })
    const dataReactions = {}
    map.apply_reaction_data_to_map(dataReactions)
    map.calc_data_stats('reaction')
    assert.deepEqual(map.get_data_statistics(), { reaction: null, metabolite: null })
  })

  it('get_data_statistics uses defaults for no data', () => {
    assert.deepEqual(map.get_data_statistics(), { reaction: null, metabolite: null })
    const dataMetabolites = {}
    map.apply_metabolite_data_to_map(dataMetabolites)
    map.calc_data_stats('metabolite')
    assert.deepEqual(map.get_data_statistics(), { reaction: null, metabolite: null })
  })

  it('map_for_export removes unnecessary attributes', () => {
    // check that unnecessary attributes are removed
    ;[ 'reactions', 'nodes', 'text_labels' ].forEach(function (type) {
      const first = Object.keys(map[type])[0]
      map[type][first].to_remove = true
      const data = map.map_for_export()
      assert.isUndefined(data[1][type][first].to_remove)
    })
    map.canvas.to_remove = true
    const data = map.map_for_export()
    assert.isUndefined(data[1].canvas.to_remove)
  })

  it('map_for_export writes a stock map exactly as before', () => {
    const data = map.map_for_export()
    assert.sameMembers(Object.keys(data[0]),
                       [ 'map_name', 'map_id', 'map_description', 'homepage', 'schema' ])
    _.values(data[1].reactions).forEach(r => {
      assert.sameMembers(Object.keys(r), [ 'name', 'bigg_id', 'reversibility', 'label_x',
                                           'label_y', 'gene_reaction_rule', 'genes',
                                           'metabolites', 'segments' ])
    })
    _.values(data[1].nodes).forEach(n => {
      assert.notProperty(n, 'label_text')
      assert.notProperty(n, 'font_size_base')
    })
    _.values(data[1].text_labels).forEach(t => {
      assert.sameMembers(Object.keys(t), [ 'x', 'y', 'text' ])
    })
  })
})

describe('Map with a generated map', () => {
  let map, input

  beforeEach(() => {
    input = getV2Map()
    map = loadMap(getV2Map())
  })

  it('keeps label_text, font_size_base, pathways and regions on export', () => {
    const data = map.map_for_export()
    assert.deepEqual(data[0].pathways, input[0].pathways)
    assert.deepEqual(data[0].regions, input[0].regions)
    for (let id in input[1].nodes) {
      const node = input[1].nodes[id]
      assert.strictEqual(data[1].nodes[id].label_text, node.label_text, id)
      assert.strictEqual(data[1].nodes[id].font_size_base, node.font_size_base, id)
    }
    // t1_19 is drawn smaller than the default
    assert.strictEqual(data[1].nodes.t1_19.font_size_base, 9)
    for (let id in input[1].reactions) {
      assert.strictEqual(data[1].reactions[id].label_text, input[1].reactions[id].label_text)
      assert.strictEqual(data[1].reactions[id].font_size_base, input[1].reactions[id].font_size_base)
    }
    for (let id in input[1].text_labels) {
      assert.deepEqual(data[1].text_labels[id], input[1].text_labels[id])
    }
  })

  it('survives a save and reload unchanged', () => {
    const first = map.map_for_export()
    const again = loadMap(JSON.parse(JSON.stringify(first))).map_for_export()
    // the description gets a fresh "Last Modified" line on every load
    first[0].map_description = again[0].map_description = null
    assert.deepEqual(again, first)
  })

  it('drops deleted reactions and captions from the exported pathways', () => {
    map.delete_reaction_data([ 'PFK' ])
    map.delete_text_label_data([ 'title_1', 'region_Transport and exchange' ])
    const data = map.map_for_export()
    assert.deepEqual(data[0].pathways[0].reactions, [ 'FBA', 'PGI' ])
    assert.deepEqual(data[0].pathways[0].parts[0].reactions, [ 'PGI', 'FBA' ])
    assert.notProperty(data[0].pathways[1], 'caption')
    assert.deepEqual(Object.keys(data[0].regions), [ 'Carbohydrate metabolism' ])
    // the map itself still has the full lists, for undo
    assert.include(map.pathways[0].reactions, 'PFK')
  })

  it('numbers new elements past non-numeric ids', () => {
    // ids like t0_12, PFK and title_0 used to make every largest id NaN
    assert.isFalse(isNaN(map.largest_ids.nodes))
    assert.isFalse(isNaN(map.largest_ids.reactions))
    assert.isFalse(isNaN(map.largest_ids.segments))
    assert.isFalse(isNaN(map.largest_ids.text_labels))
    const a = map.new_text_label({ x: 0, y: 0 }, 'one')
    const b = map.new_text_label({ x: 0, y: 0 }, 'two')
    assert.notStrictEqual(a, b)
    assert.strictEqual(map.text_labels[a].text, 'one')
  })

  it('is drawn with labels sized from font bases', () => {
    assert.isTrue(map.labels_use_font_base)
  })
})
