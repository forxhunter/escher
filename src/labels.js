/**
 * Label text and size.
 *
 * Draw.js decides how large a label is drawn, and the editor needs the same
 * answer to tell whether a label it moved now sits on top of something. Both
 * read it from here so the two cannot drift apart.
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
  // round away float noise (18 * 1.1 is 19.800000000000001)
  return base ? Math.round(base * FONT_FACTORS[kind] * 100) / 100 : null
}
