import { labelFontSize, labelText, labelShiftsAfterMove, applyLabelShifts } from '../labels'

import { describe, it } from 'mocha'
import { assert } from 'chai'

/** A map-shaped object with metabolites at the given places, labels to their right. */
function fakeMap (nodes, textLabels) {
  const out = {
    nodes: {},
    reactions: {},
    text_labels: textLabels || {},
    labels_use_font_base: false,
    settings: { get: key => ({ identifiers_on_map: 'bigg_id' })[key] }
  }
  for (let id in nodes) {
    const [ x, y, label ] = nodes[id]
    out.nodes[id] = {
      node_type: 'metabolite',
      bigg_id: label || id,
      node_is_primary: true,
      x,
      y,
      label_x: x + 25,
      label_y: y + 6,
      connected_segments: []
    }
  }
  return out
}

/** Move nodes (and their labels) as a drag would, before asking for shifts. */
function move (map, ids, dx, dy) {
  ids.forEach(id => {
    const n = map.nodes[id]
    n.x += dx
    n.y += dy
    n.label_x += dx
    n.label_y += dy
  })
}

describe('labels', () => {
  it('labelFontSize', () => {
    assert.strictEqual(labelFontSize('node', { font_size_base: 10 }, 18, false), 11)
    assert.strictEqual(labelFontSize('reaction', { font_size_base: 10 }, 18, false), 15)
    assert.strictEqual(labelFontSize('text', { font_size_base: 10 }, 18, false), 30)
    assert.isNull(labelFontSize('node', {}, 18, false))
    assert.strictEqual(labelFontSize('reaction', {}, 18, true), 27)
    assert.strictEqual(labelFontSize('reaction', {}, undefined, true), 27)
  })

  it('labelText', () => {
    assert.strictEqual(labelText({ bigg_id: 'mal__L_c', label_text: 'Mal' }, 'label_text'), 'Mal')
    assert.strictEqual(labelText({ bigg_id: 'mal__L_c', label_text: '' }, 'label_text'), 'mal__L_c')
    assert.strictEqual(labelText({ bigg_id: 'mal__L_c' }, 'label_text'), 'mal__L_c')
    assert.strictEqual(labelText({ bigg_id: 'mal__L_c', label_text: 'Mal' }, 'bigg_id'), 'mal__L_c')
    assert.strictEqual(labelText({ name: 'L-Malate', label_text: 'Mal' }, 'name'), 'L-Malate')
  })

  it('moves a dropped label off a label that stayed put', () => {
    const map = fakeMap({ a: [ 0, 0 ], b: [ 0, 200 ] })
    // drop a exactly on b: a's label lands on b's label
    move(map, [ 'a' ], 0, 200)
    const shifts = labelShiftsAfterMove(map, { nodeIds: [ 'a' ], textLabelIds: [] }, { x: 0, y: 200 })
    assert.lengthOf(shifts, 1)
    assert.strictEqual(shifts[0].kind, 'node')
    assert.strictEqual(shifts[0].id, 'a')
    const b = Object.assign({}, map.nodes.b)
    applyLabelShifts(map, shifts)
    // b and its label did not move
    assert.deepEqual(map.nodes.b, b)
    // and a's label now sits clear of b's label and circle, right next to a
    const a = map.nodes.a
    const labelBox = n => ({ x0: n.label_x, x1: n.label_x + 12, y0: n.label_y - 16, y1: n.label_y + 5 })
    const circleBox = n => ({ x0: n.x - 20, x1: n.x + 20, y0: n.y - 20, y1: n.y + 20 })
    const apart = (p, q) => p.x1 <= q.x0 + 2 || q.x1 <= p.x0 + 2 || p.y1 <= q.y0 + 2 || q.y1 <= p.y0 + 2
    assert.isTrue(apart(labelBox(a), labelBox(b)), JSON.stringify(shifts))
    assert.isTrue(apart(labelBox(a), circleBox(b)), JSON.stringify(shifts))
    assert.isBelow(Math.hypot(a.label_x - a.x, a.label_y - a.y), 60)
    // and can be taken back
    applyLabelShifts(map, shifts, -1)
    assert.strictEqual(a.label_x, b.label_x)
  })

  it('leaves a label alone when nothing new is under it', () => {
    const map = fakeMap({ a: [ 0, 0 ], b: [ 0, 1000 ] })
    move(map, [ 'a' ], 300, 300)
    assert.deepEqual(labelShiftsAfterMove(map, { nodeIds: [ 'a' ], textLabelIds: [] },
      { x: 300, y: 300 }), [])
  })

  it('leaves a label alone when it overlapped the same thing before the move', () => {
    // a's label already sits on b's; a nudge of 2px changes nothing about that
    const map = fakeMap({ a: [ 0, 0 ], b: [ 0, 4 ] })
    move(map, [ 'a' ], 2, 0)
    assert.deepEqual(labelShiftsAfterMove(map, { nodeIds: [ 'a' ], textLabelIds: [] },
      { x: 2, y: 0 }), [])
  })

  it('leaves a label where it is when no nearby place is clear', () => {
    // a huge text label (300px font) covers everything around b
    const map = fakeMap({ a: [ 0, 0 ], b: [ 0, 300 ] },
      { big: { x: -2000, y: 450, text: 'x'.repeat(200), font_size_base: 100 } })
    move(map, [ 'a' ], 0, 300)
    assert.deepEqual(labelShiftsAfterMove(map, { nodeIds: [ 'a' ], textLabelIds: [] },
      { x: 0, y: 300 }), [])
  })

  it('never moves labels that were not part of the move', () => {
    const map = fakeMap({ a: [ 0, 0 ], b: [ 0, 200 ], c: [ 500, 500 ] })
    move(map, [ 'a' ], 0, 200)
    const shifts = labelShiftsAfterMove(map, { nodeIds: [ 'a' ], textLabelIds: [] }, { x: 0, y: 200 })
    shifts.forEach(shift => assert.strictEqual(shift.id, 'a'))
  })

  it('does nothing when labels are hidden', () => {
    const map = fakeMap({ a: [ 0, 0 ], b: [ 0, 200 ] })
    map.settings = { get: key => ({ hide_all_labels: true })[key] }
    move(map, [ 'a' ], 0, 200)
    assert.deepEqual(labelShiftsAfterMove(map, { nodeIds: [ 'a' ], textLabelIds: [] },
      { x: 0, y: 200 }), [])
  })
})
