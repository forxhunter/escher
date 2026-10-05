const Draw = require('../Draw')

const describe = require('mocha').describe
const it = require('mocha').it
const assert = require('chai').assert
const beforeEach = require('mocha').beforeEach;
const d3Body = require('./helpers/d3Body')
const d3_select = require('d3-selection').select

const draw = new Draw()

function get_all_attrs (selection, attr) {
  return selection.nodes().map(n => d3_select(n).attr(attr))
}

describe('Draw', function () {
  it('create_reaction', function () {
    const parent_sel = d3Body.append('div')

    // set up
    const d_sel = parent_sel
          .selectAll('.reaction')
          .data([{ reaction_id: '1234' }, { reaction_id: '5678' }])

    // run create_reaction
    const e_sel = draw.create_reaction.bind(draw)(d_sel.enter())

    // check length
    assert.strictEqual(e_sel.size(), 2)
    // check ids
    assert.sameMembers(get_all_attrs(e_sel, 'id'), [ 'r1234', 'r5678' ])
    // check classes
    assert.isTrue(get_all_attrs(e_sel, 'class').every(c => c === 'reaction'))
    // check label
    assert.strictEqual(e_sel.selectAll('.reaction-label').size(), 2)

    parent_sel.remove()
  })
})

/** A Draw with plain-object settings and a behavior that does nothing. */
function makeDraw (options, map) {
  const all = Object.assign({
    hide_secondary_metabolites: false,
    primary_metabolite_radius: 20,
    secondary_metabolite_radius: 10,
    marker_radius: 5,
    hide_all_labels: false,
    identifiers_on_map: 'bigg_id',
    metabolite_styles: [],
    reaction_styles: [],
    show_gene_reaction_rules: false,
    gene_font_size: 18
  }, options)
  const noop = () => {}
  const behavior = {
    turnOffDrag: noop,
    reactionLabelDrag: noop,
    selectableDrag: noop
  }
  return new Draw(behavior, { get: key => all[key] }, map || {})
}

function drawNodes (testDraw, parent, nodes) {
  const sel = parent.selectAll('.node').data(nodes, d => d.node_id)
  const nodeSel = testDraw.create_node(sel.enter())
  testDraw.update_node(nodeSel, null, false, null, null, null, null, () => {}, () => {})
  return nodeSel
}

function fontSizes (sel, selector) {
  return sel.select(selector).nodes().map(n => n.style.getPropertyValue('font-size'))
}

function metabolite (id, extra) {
  return Object.assign({
    node_id: id,
    node_type: 'metabolite',
    bigg_id: 'g6p_c',
    name: 'Glucose 6-phosphate',
    x: 0,
    y: 0,
    label_x: 10,
    label_y: 10,
    node_is_primary: true
  }, extra)
}

describe('Draw label sizes', () => {
  let parent
  beforeEach(() => { parent = d3Body.append('svg') })

  it('draws a node label at font_size_base, and leaves the rest to the stylesheet', () => {
    const sel = drawNodes(makeDraw({}, { labels_use_font_base: false }), parent, [
      metabolite('1', { font_size_base: 10 }),
      metabolite('2')
    ])
    // 10 * 1.1; nothing inline for the stock node, so the 20px rule applies
    assert.deepEqual(fontSizes(sel, '.node-label'), [ '11px', '' ])
    parent.remove()
  })

  it('sizes every label from gene_font_size on a map laid out against font bases', () => {
    const sel = drawNodes(makeDraw({ gene_font_size: 18 }, { labels_use_font_base: true }),
                          parent, [ metabolite('1', { font_size_base: 10 }), metabolite('2') ])
    assert.deepEqual(fontSizes(sel, '.node-label'), [ '11px', '19.8px' ])
    parent.remove()
  })

  it('draws reaction labels and text labels at font_size_base', () => {
    const testDraw = makeDraw({}, { labels_use_font_base: false })
    const reactions = parent.selectAll('.reaction')
      .data([ { reaction_id: 'a', bigg_id: 'PGI', label_x: 0, label_y: 0, font_size_base: 12, segments: {} },
              { reaction_id: 'b', bigg_id: 'PFK', label_x: 0, label_y: 0, segments: {} } ])
    const reactionSel = testDraw.create_reaction(reactions.enter())
    testDraw.update_reaction(reactionSel, null, null, {}, null, false)
    // 12 * 1.5
    assert.deepEqual(fontSizes(reactionSel, '.reaction-label'), [ '18px', '' ])

    const labels = parent.selectAll('.text-label')
      .data([ { text_label_id: 'x', text: 'A', x: 0, y: 0, font_size_base: 12 },
              { text_label_id: 'y', text: 'B', x: 0, y: 0 } ])
    const labelSel = testDraw.create_text_label(labels.enter())
    testDraw.update_text_label(labelSel)
    // 12 * 3
    assert.deepEqual(fontSizes(labelSel, '.label'), [ '36px', '' ])
    parent.remove()
  })

  it('tolerates nodes without the identifier it colours by', () => {
    const testDraw = makeDraw({ identifiers_on_map: 'name' }, {})
    // name mode: this node has no name to match, so it must not throw
    const sel = drawNodes(testDraw, parent, [ metabolite('1', { bigg_id: 'atp_c', name: undefined }) ])
    assert.strictEqual(sel.select('.node-circle').node().style.getPropertyValue('fill'), '')
    parent.remove()
  })
})

describe('Draw label text', () => {
  let parent
  beforeEach(() => { parent = d3Body.append('svg') })

  const nodes = () => [
    metabolite('1', { bigg_id: 'mal__L_c', name: 'L-Malate', label_text: 'Mal' }),
    metabolite('2', { bigg_id: 'fum_c', name: 'Fumarate' })
  ]
  const texts = sel => sel.select('.node-label').nodes().map(n => n.textContent)

  it('shows label_text, falling back to the BiGG id where a node has none', () => {
    const sel = drawNodes(makeDraw({ identifiers_on_map: 'label_text' }), parent, nodes())
    assert.deepEqual(texts(sel), [ 'Mal', 'fum_c' ])
    parent.remove()
  })

  it('still shows BiGG ids or names when asked', () => {
    const ids = drawNodes(makeDraw({ identifiers_on_map: 'bigg_id' }), parent, nodes())
    assert.deepEqual(texts(ids), [ 'mal__L_c', 'fum_c' ])
    parent.remove()
    parent = d3Body.append('svg')
    const names = drawNodes(makeDraw({ identifiers_on_map: 'name' }), parent, nodes())
    assert.deepEqual(texts(names), [ 'L-Malate', 'Fumarate' ])
    parent.remove()
  })

  it('shows reaction label_text, or the BiGG id', () => {
    const testDraw = makeDraw({ identifiers_on_map: 'label_text' })
    const sel = testDraw.create_reaction(parent.selectAll('.reaction')
      .data([ { reaction_id: 'a', bigg_id: 'PGI', label_text: 'Pgi', label_x: 0, label_y: 0, segments: {} },
              { reaction_id: 'b', bigg_id: 'PFK', label_x: 0, label_y: 0, segments: {} } ]).enter())
    testDraw.update_reaction(sel, null, null, {}, null, false)
    assert.deepEqual(sel.select('.reaction-label').nodes().map(n => n.textContent), [ 'Pgi', 'PFK' ])
    parent.remove()
  })

  it('keeps colouring cofactors by BiGG id when showing short labels', () => {
    const sel = drawNodes(makeDraw({ identifiers_on_map: 'label_text' }), parent,
                          [ metabolite('1', { bigg_id: 'atp_c', label_text: 'ATP' }) ])
    assert.strictEqual(sel.select('.node-circle').node().style.getPropertyValue('fill'),
                       '#ff0000')
    parent.remove()
  })
})
