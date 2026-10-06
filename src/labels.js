/**
 * Label text and size.
 *
 * Draw.js decides what a label says and how large it is drawn, and the editor
 * needs the same answers to tell whether a label it moved now sits on top of
 * something. Both read them from here so the two cannot drift apart.
 */

/**
 * A label with `font_size_base` is drawn at that base times a factor for its
 * kind. Map generators lay labels out against these same factors, so changing
 * one changes the size of every label they placed.
 */
export const FONT_FACTORS = { node: 1.1, reaction: 1.5, text: 3.0 }

/** gene_font_size when the setting is missing. */
export const DEFAULT_FONT_BASE = 18

/**
 * Inline font size in px for a label, or null to leave it to the stylesheet.
 *
 * A label with `font_size_base` is drawn at that base times the factor for its
 * kind. A label without one keeps the stylesheet size, except on a map that was
 * laid out against font bases (`useFontBase`, see Map.labels_use_font_base):
 * there the generator sized every such label as gene_font_size times the
 * factor, and the stylesheet's 30px reaction labels would be 11% wider than the
 * room it left for them.
 *
 * @param {String} kind - 'node', 'reaction' or 'text'.
 * @param {Object} d - The node, reaction or text label.
 * @param {Number} geneFontSize - The gene_font_size setting.
 * @param {Boolean} useFontBase - Whether the map was laid out against font bases.
 */
export function labelFontSize (kind, d, geneFontSize, useFontBase) {
  let base = d ? d.font_size_base : null
  if (!base && useFontBase) base = geneFontSize || DEFAULT_FONT_BASE
  // round away float noise (12 * 1.1 is 13.200000000000001)
  return base ? Math.round(base * FONT_FACTORS[kind] * 100) / 100 : null
}

/**
 * What a metabolite or reaction label says for an identifiers_on_map value.
 *
 * 'label_text' shows the map's own short label (`Mal` for mal__L_c, or a name
 * where the model's ids are opaque) and falls back to the BiGG id where the map
 * has none, so a map without short labels reads exactly as it does with
 * 'bigg_id'.
 */
export function labelText (d, identifiersOnMap) {
  if (identifiersOnMap === 'label_text') {
    return (typeof d.label_text === 'string' && d.label_text !== '')
      ? d.label_text
      : d.bigg_id
  }
  return d[identifiersOnMap]
}

/**
 * The identifier that cofactor colouring matches its prefixes (atp_, h2o_ ...)
 * against. A short label is display text, so it falls back to the BiGG id.
 */
export function colourKey (d, identifiersOnMap) {
  return identifiersOnMap === 'name' ? d.name : d.bigg_id
}

// -----------------------------------------------------------------------------
// Keeping moved labels clear
// -----------------------------------------------------------------------------

/** Sizes the stylesheet gives labels without an inline size (Builder-embed.css). */
const CSS_FONT_SIZES = { node: 20, reaction: 30, text: 50 }

/** Average advance of a bold italic sans-serif character, per px of font size. */
const CHAR_WIDTH = 0.6

/** Boxes may overlap by this many px on each side without counting. */
const TOLERANCE = 2

/** Space between a label and the node it names. */
const GAP = 4

/** Grid cell for the spatial index, px. */
const CELL = 200

/**
 * Box of a label drawn the way Escher draws them: text starting at x, on a
 * baseline at y.
 */
function textBox (x, y, text, size) {
  const width = text.length * size * CHAR_WIDTH
  return { x0: x, y0: y - 0.8 * size, x1: x + width, y1: y + 0.25 * size }
}

function shiftBox (box, dx, dy) {
  return { x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy }
}

function overlaps (a, b) {
  return (a.x0 < b.x1 - TOLERANCE && b.x0 < a.x1 - TOLERANCE &&
          a.y0 < b.y1 - TOLERANCE && b.y0 < a.y1 - TOLERANCE)
}

/** A uniform grid over boxes, so a query only looks at its neighbourhood. */
class BoxGrid {
  constructor () {
    this.cells = {}
  }

  eachCell (box, fn) {
    const i1 = Math.floor(box.x1 / CELL)
    const j1 = Math.floor(box.y1 / CELL)
    for (let i = Math.floor(box.x0 / CELL); i <= i1; i++) {
      for (let j = Math.floor(box.y0 / CELL); j <= j1; j++) fn(i + ',' + j)
    }
  }

  add (item) {
    this.eachCell(item.box, key => {
      if (!this.cells[key]) this.cells[key] = []
      this.cells[key].push(item)
    })
  }

  remove (item) {
    this.eachCell(item.box, key => {
      const cell = this.cells[key]
      if (cell) this.cells[key] = cell.filter(other => other !== item)
    })
  }

  /** The keys of the items overlapping box, leaving out `except`. */
  hits (box, except) {
    const out = {}
    this.eachCell(box, key => {
      (this.cells[key] || []).forEach(item => {
        if (item !== except && overlaps(box, item.box)) out[item.key] = true
      })
    })
    return Object.keys(out)
  }
}

/** Settings and map state that decide how labels are drawn. */
function drawingContext (map) {
  const get = key => (map.settings ? map.settings.get(key) : undefined)
  const includesText = styles => Boolean(styles && styles.indexOf('text') !== -1)
  return {
    identifiers: get('identifiers_on_map'),
    geneFontSize: get('gene_font_size'),
    useFontBase: Boolean(map.labels_use_font_base),
    hideSecondary: Boolean(get('hide_secondary_metabolites')),
    hideLabels: Boolean(get('hide_all_labels')),
    primaryR: get('primary_metabolite_radius') || 20,
    secondaryR: get('secondary_metabolite_radius') || 10,
    markerR: get('marker_radius') || 5,
    nodeData: Boolean(map.has_data_on_nodes) && includesText(get('metabolite_styles')),
    reactionData: Boolean(map.has_data_on_reactions) && includesText(get('reaction_styles'))
  }
}

function fontPx (kind, d, ctx) {
  return labelFontSize(kind, d, ctx.geneFontSize, ctx.useFontBase) || CSS_FONT_SIZES[kind]
}

/** The text Draw.js puts in a metabolite or reaction label. */
function displayedText (d, ctx, withData) {
  const text = labelText(d, ctx.identifiers)
  const out = (text === undefined || text === null) ? '' : String(text)
  return withData ? out + ' ' + d.data_string : out
}

function nodeRadius (node, ctx) {
  if (node.node_type !== 'metabolite') return ctx.markerR
  return node.node_is_primary ? ctx.primaryR : ctx.secondaryR
}

/**
 * Everything drawn that a label should keep clear of, as items
 * { key, kind, id, box }, kind being 'node' (a circle), 'nodeLabel',
 * 'reactionLabel' or 'textLabel'. Hidden secondary metabolites are left out.
 */
function drawnItems (map, ctx) {
  const items = []
  for (let id in map.nodes) {
    const node = map.nodes[id]
    if (ctx.hideSecondary && node.node_type === 'metabolite' && !node.node_is_primary) continue
    const r = nodeRadius(node, ctx)
    items.push({ key: 'n' + id,
                 kind: 'node',
                 id,
                 box: { x0: node.x - r, y0: node.y - r, x1: node.x + r, y1: node.y + r } })
    if (node.node_type === 'metabolite' && node.label_x !== undefined) {
      const text = displayedText(node, ctx, ctx.nodeData)
      items.push({ key: 'nl' + id,
                   kind: 'nodeLabel',
                   id,
                   box: textBox(node.label_x, node.label_y, text, fontPx('node', node, ctx)) })
    }
  }
  for (let id in map.reactions) {
    const reaction = map.reactions[id]
    const text = displayedText(reaction, ctx, ctx.reactionData)
    items.push({ key: 'rl' + id,
                 kind: 'reactionLabel',
                 id,
                 box: textBox(reaction.label_x, reaction.label_y, text,
                              fontPx('reaction', reaction, ctx)) })
  }
  for (let id in map.text_labels) {
    const label = map.text_labels[id]
    const text = (label.text === undefined || label.text === null) ? '' : String(label.text)
    items.push({ key: 't' + id,
                 kind: 'textLabel',
                 id,
                 box: textBox(label.x, label.y, text, fontPx('text', label, ctx)) })
  }
  return items
}

/** The midmarker of a reaction, or null. */
function midmarkerOf (map, reactionId) {
  const reaction = map.reactions[reactionId]
  if (!reaction) return null
  for (let segmentId in reaction.segments) {
    const segment = reaction.segments[segmentId]
    const ends = [ map.nodes[segment.from_node_id], map.nodes[segment.to_node_id] ]
    const midmarker = ends.filter(node => node && node.node_type === 'midmarker')[0]
    if (midmarker) return midmarker
  }
  return null
}

/**
 * Places a label could move to: beside, above, below and at the corners of
 * its anchor, on a ring right next to it and on one a line further out.
 * Returned as { x, y, ring, box }, (x, y) being the new label_x and label_y,
 * ring 0 or 1, and box the label's box moved there.
 */
function candidatePlaces (box, labelX, labelY, anchor, radius, size) {
  const width = box.x1 - box.x0
  // baselines that centre the text on y, end it at y, or start it at y
  const middle = y => y + 0.275 * size
  const ending = y => y - 0.25 * size
  const starting = y => y + 0.8 * size
  const ring = d => {
    const k = d * Math.SQRT1_2
    return [
      [ anchor.x + d, middle(anchor.y) ],
      [ anchor.x - d - width, middle(anchor.y) ],
      [ anchor.x - width / 2, ending(anchor.y - d) ],
      [ anchor.x - width / 2, starting(anchor.y + d) ],
      [ anchor.x + k, ending(anchor.y - k) ],
      [ anchor.x - k - width, ending(anchor.y - k) ],
      [ anchor.x + k, starting(anchor.y + k) ],
      [ anchor.x - k - width, starting(anchor.y + k) ]
    ]
  }
  const near = radius + GAP
  const place = r => ([ x, y ]) => ({ x, y, ring: r, box: shiftBox(box, x - labelX, y - labelY) })
  return ring(near).map(place(0)).concat(ring(near + size).map(place(1)))
}

/**
 * Find new places for labels that a move has put on top of something.
 *
 * Only labels that moved with their node -- the labels of moved metabolites,
 * and of reactions whose midmarker moved -- are considered, and only if they
 * now overlap a node or label that stayed put which they did not overlap
 * before the move. Each such label goes to a clear place among a few around
 * its node (or its reaction's midmarker), preferring places right next to
 * the node -- a label further out with something between it and its node no
 * longer reads as that node's -- and then the one nearest to where it was.
 * If none is clear it stays where it is. Nothing else is ever moved. Boxes are estimated from the
 * text length and the font size Draw.js uses.
 *
 * @param {Map} map - The map, after the move.
 * @param {Object} moved - { nodeIds, textLabelIds, labelReactionIds }: what
 *                         moved, as passed to Behavior.moveGroup.
 * @param {Object} displacement - The total displacement of the move, { x, y }.
 * @return {Array} Shifts [{ kind: 'node' | 'reaction', id, dx, dy }] to add to
 *                 label_x and label_y. See applyLabelShifts.
 */
export function labelShiftsAfterMove (map, moved, displacement) {
  const ctx = drawingContext(map)
  if (ctx.hideLabels || !moved.nodeIds.length) return []

  // what moved together
  const movedKeys = {}
  const movedReactions = {}
  ;(moved.labelReactionIds || []).forEach(id => { movedReactions[id] = true })
  moved.nodeIds.forEach(id => {
    const node = map.nodes[id]
    if (!node) return
    movedKeys['n' + id] = true
    movedKeys['nl' + id] = true
    if (node.node_type === 'midmarker') {
      node.connected_segments.forEach(s => { movedReactions[s.reaction_id] = true })
    }
  })
  Object.keys(movedReactions).forEach(id => { movedKeys['rl' + id] = true })
  ;(moved.textLabelIds || []).forEach(id => { movedKeys['t' + id] = true })

  const items = drawnItems(map, ctx)
  const grid = new BoxGrid()
  items.forEach(item => { if (!(item.key in movedKeys)) grid.add(item) })

  // moved labels that landed on something they were not on before
  const toPlace = items.filter(item => {
    if (!(item.key in movedKeys)) return false
    if (item.kind !== 'nodeLabel' && item.kind !== 'reactionLabel') return false
    const now = grid.hits(item.box)
    if (!now.length) return false
    const before = grid.hits(shiftBox(item.box, -displacement.x, -displacement.y))
    return now.some(key => before.indexOf(key) === -1)
  })
  if (!toPlace.length) return []

  // a new place has to be clear of what moved too, including labels placed
  // before it
  items.forEach(item => { if (item.key in movedKeys) grid.add(item) })

  const shifts = []
  toPlace.forEach(item => {
    let holder, anchor, radius, size
    if (item.kind === 'nodeLabel') {
      holder = map.nodes[item.id]
      anchor = holder
      radius = nodeRadius(holder, ctx)
      size = fontPx('node', holder, ctx)
    } else {
      holder = map.reactions[item.id]
      size = fontPx('reaction', holder, ctx)
      // clear of the midmarker and the stroke of the segments through it
      radius = Math.max(ctx.markerR, 5) + 5
      anchor = midmarkerOf(map, item.id) || {
        x: (item.box.x0 + item.box.x1) / 2,
        y: (item.box.y0 + item.box.y1) / 2
      }
    }
    const distance = place => Math.hypot(place.x - holder.label_x, place.y - holder.label_y)
    const free = candidatePlaces(item.box, holder.label_x, holder.label_y, anchor, radius, size)
      .sort((a, b) => (a.ring - b.ring) || (distance(a) - distance(b)))
      .filter(place => grid.hits(place.box, item).length === 0)[0]
    if (!free) return
    grid.remove(item)
    item.box = free.box
    grid.add(item)
    shifts.push({
      kind: item.kind === 'nodeLabel' ? 'node' : 'reaction',
      id: item.id,
      dx: free.x - holder.label_x,
      dy: free.y - holder.label_y
    })
  })
  return shifts
}

/**
 * Apply shifts from labelShiftsAfterMove, or take them back with sign -1.
 * @return {Object} { nodeIds, reactionIds } whose labels changed.
 */
export function applyLabelShifts (map, shifts, sign = 1) {
  const out = { nodeIds: [], reactionIds: [] }
  shifts.forEach(shift => {
    const holder = shift.kind === 'node' ? map.nodes[shift.id] : map.reactions[shift.id]
    if (!holder) return
    holder.label_x = holder.label_x + sign * shift.dx
    holder.label_y = holder.label_y + sign * shift.dy
    if (shift.kind === 'node') out.nodeIds.push(shift.id)
    else out.reactionIds.push(shift.id)
  })
  return out
}
