/**
 * Editing a drawn map with the mouse: dragging reactions, selecting them, and
 * the labels that follow. These go through real d3 drag and click handlers,
 * driven by mouse events dispatched in jsdom.
 */
/* global global */

// jsdom first: Mousetrap, imported by Map, needs a window when it loads
const d3Body = require('./helpers/d3Body')
const Map = require('../Map').default
const Settings = require('../Settings').default
const getV2Map = require('./helpers/get_v2_map')
const getMap = require('./helpers/get_map')

const describe = require('mocha').describe
const it = require('mocha').it
const beforeEach = require('mocha').beforeEach
const afterEach = require('mocha').afterEach
const assert = require('chai').assert

/** Load map data into a fresh svg and switch on the brush-mode behaviors. */
function loadMap (data) {
  const svg = d3Body.append('svg')
  const sel = svg.append('g')
  const options = {
    reaction_scale: [],
    reaction_scale_preset: null,
    metabolite_scale: [],
    metabolite_scale_preset: null,
    reaction_styles: [],
    reaction_compare_style: 'diff',
    metabolite_styles: [],
    metabolite_compare_style: 'diff',
    cofactors: [],
    identifiers_on_map: 'label_text',
    primary_metabolite_radius: 20,
    secondary_metabolite_radius: 10,
    marker_radius: 5,
    gene_font_size: 18
  }
  const map = Map.from_data(data, svg, null, sel, null,
                            new Settings(options, [ 'reaction_scale', 'metabolite_scale' ]),
                            null, false)
  // what Builder._setMode('brush') does
  map.behavior.toggleSelectableDrag(true)
  map.behavior.toggleSelectableClick(true)
  map.behavior.toggleLabelDrag(true)
  map.behavior.toggleTextLabelEdit(false)
  map.draw_everything()
  return map
}

function mouse (type, x, y, extra) {
  return new global.window.MouseEvent(type, Object.assign({
    bubbles: true,
    cancelable: true,
    view: global.window,
    clientX: x,
    clientY: y,
    button: 0
  }, extra))
}

/** Drag an element by (dx, dy) in two moves, the way d3-drag sees a user. */
function drag (element, dx, dy, extra) {
  element.dispatchEvent(mouse('mousedown', 100, 100, extra))
  global.window.dispatchEvent(mouse('mousemove', 100 + dx / 2, 100 + dy / 2, extra))
  global.window.dispatchEvent(mouse('mousemove', 100 + dx, 100 + dy, extra))
  global.window.dispatchEvent(mouse('mouseup', 100 + dx, 100 + dy, extra))
}

function nodeCircle (map, nodeId) {
  return map.sel.node().querySelector('#n' + nodeId + ' .node-circle')
}

function reactionLabel (map, reactionId) {
  return map.sel.node().querySelector('#r' + reactionId + ' .reaction-label-group')
}

/** Everything a drag can move, as plain numbers. */
function snapshot (map) {
  const out = { nodes: {}, labels: {}, reactions: {}, beziers: {}, text: {} }
  for (let id in map.nodes) {
    const n = map.nodes[id]
    out.nodes[id] = [ n.x, n.y ]
    if (n.node_type === 'metabolite') out.labels[id] = [ n.label_x, n.label_y ]
  }
  for (let id in map.reactions) {
    const r = map.reactions[id]
    out.reactions[id] = [ r.label_x, r.label_y ]
  }
  for (let id in map.beziers) out.beziers[id] = [ map.beziers[id].x, map.beziers[id].y ]
  for (let id in map.text_labels) out.text[id] = [ map.text_labels[id].x, map.text_labels[id].y ]
  return out
}

/** Keys whose value moved by exactly (dx, dy), and keys that moved otherwise. */
function moved (before, after, dx, dy) {
  const by = []
  const other = []
  for (let key in before) {
    const [ x0, y0 ] = before[key]
    const [ x1, y1 ] = after[key]
    if (x0 === x1 && y0 === y1) continue
    if (Math.abs(x1 - x0 - dx) < 1e-9 && Math.abs(y1 - y0 - dy) < 1e-9) by.push(key)
    else other.push(key)
  }
  return { by: by.sort(), other }
}

// PFK in the fixture: f6p_c (t0_16) and fdp_c (t0_17) are shared with PGI and
// FBA; atp_c (t0_36) and adp_c (t0_37) are PFK's alone; t0_33 is its
// midmarker and t0_34, t0_35 its multimarkers.
const PFK_OWN = [ 't0_33', 't0_34', 't0_35', 't0_36', 't0_37' ].sort()

describe('Dragging a reaction', () => {
  let map

  beforeEach(() => { map = loadMap(getV2Map()) })
  afterEach(() => { d3Body.selectAll('svg').remove() })

  it('moves its markers, its own metabolites and its label, not shared metabolites', () => {
    const before = snapshot(map)
    drag(nodeCircle(map, 't0_34'), 40, -30)
    const after = snapshot(map)

    const nodes = moved(before.nodes, after.nodes, 40, -30)
    assert.deepEqual(nodes.by, PFK_OWN)
    assert.deepEqual(nodes.other, [])
    assert.deepEqual(moved(before.labels, after.labels, 40, -30).by, [ 't0_36', 't0_37' ])
    assert.deepEqual(moved(before.reactions, after.reactions, 40, -30).by, [ 'PFK' ])
    // nothing else moved at all
    assert.deepEqual(moved(before.reactions, after.reactions, 40, -30).other, [])
    assert.deepEqual(moved(before.text, after.text, 0, 0).other, [])
  })

  it('carries the curve control points at the moved ends, and only those', () => {
    const segment = map.reactions.PFK.segments.t0_PFK_s1
    // f6p_c (shared, stays) -> t0_34 (multimarker, moves)
    assert.strictEqual(segment.from_node_id, 't0_16')
    assert.strictEqual(segment.to_node_id, 't0_34')
    const b1 = Object.assign({}, segment.b1)
    const b2 = Object.assign({}, segment.b2)

    drag(nodeCircle(map, 't0_34'), 40, -30)

    assert.deepEqual(segment.b1, b1, 'the end at the shared metabolite stays')
    assert.deepEqual(segment.b2, { x: b2.x + 40, y: b2.y - 30 })
    // and the drawn handle follows the data
    assert.deepEqual([ map.beziers.t0_PFK_s1_b2.x, map.beziers.t0_PFK_s1_b2.y ],
                     [ b2.x + 40, b2.y - 30 ])
  })

  it('selects the reaction it moved', () => {
    drag(nodeCircle(map, 't0_33'), 10, 10)
    assert.deepEqual(map.get_selected_node_ids().sort(), PFK_OWN)
  })

  it('is one undo step', () => {
    const before = snapshot(map)
    drag(nodeCircle(map, 't0_35'), 25, 15)
    const after = snapshot(map)
    map.undo_stack.undo()
    assert.deepEqual(snapshot(map), before)
    map.undo_stack.redo()
    assert.deepEqual(snapshot(map), after)
  })

  it('moves the whole reaction when its label is dragged', () => {
    const before = snapshot(map)
    drag(reactionLabel(map, 'PFK'), -20, 35)
    const after = snapshot(map)
    assert.deepEqual(moved(before.nodes, after.nodes, -20, 35).by, PFK_OWN)
    assert.deepEqual(moved(before.reactions, after.reactions, -20, 35).by, [ 'PFK' ])
    map.undo_stack.undo()
    assert.deepEqual(snapshot(map), before)
  })

  it('with Alt, moves only the grabbed marker', () => {
    const before = snapshot(map)
    drag(nodeCircle(map, 't0_34'), 40, -30, { altKey: true })
    const after = snapshot(map)
    assert.deepEqual(moved(before.nodes, after.nodes, 40, -30).by, [ 't0_34' ])
    assert.deepEqual(moved(before.nodes, after.nodes, 40, -30).other, [])
    // a multimarker does not carry the reaction label
    assert.deepEqual(moved(before.reactions, after.reactions, 40, -30).by, [])
    assert.deepEqual(map.get_selected_node_ids(), [ 't0_34' ])
    map.undo_stack.undo()
    assert.deepEqual(snapshot(map), before)
  })

  it('with Alt, moves only the label when the label is dragged', () => {
    const before = snapshot(map)
    drag(reactionLabel(map, 'PFK'), -20, 35, { altKey: true })
    const after = snapshot(map)
    assert.deepEqual(moved(before.nodes, after.nodes, -20, 35).by, [])
    assert.deepEqual(moved(before.reactions, after.reactions, -20, 35).by, [ 'PFK' ])
    map.undo_stack.undo()
    assert.deepEqual(snapshot(map), before)
  })

  it('still moves a metabolite on its own, with its label', () => {
    const before = snapshot(map)
    drag(nodeCircle(map, 't0_16'), 12, 0)
    const after = snapshot(map)
    assert.deepEqual(moved(before.nodes, after.nodes, 12, 0).by, [ 't0_16' ])
    assert.deepEqual(moved(before.labels, after.labels, 12, 0).by, [ 't0_16' ])
  })

  it('works the same on a stock map', () => {
    const stock = loadMap(getMap())
    // GAPD's markers and its own cofactors move; g3p_c and 13dpg_c stay
    const gapd = Object.keys(stock.reactions).filter(id => stock.reactions[id].bigg_id === 'GAPD')[0]
    const own = stock.node_ids_for_reaction(gapd)
    const marker = own.filter(id => stock.nodes[id].node_type === 'multimarker')[0]
    const shared = Object.keys(stock.nodes).filter(id => {
      const n = stock.nodes[id]
      return n.node_type === 'metabolite' && own.indexOf(id) === -1 &&
        n.connected_segments.some(s => s.reaction_id === gapd)
    })
    assert.isAbove(shared.length, 0)
    const before = snapshot(stock)
    drag(nodeCircle(stock, marker), 30, 30)
    const after = snapshot(stock)
    assert.deepEqual(moved(before.nodes, after.nodes, 30, 30).by, own.slice().sort())
    shared.forEach(id => assert.deepEqual(after.nodes[id], before.nodes[id]))
  })
})
