/**
 * Returns a fresh copy of a small generated ("v2") map.
 *
 * Trimmed from the e_coli_core whole-model canvas: PGI, PFK and FBA from the
 * Carbohydrate metabolism pathway and GLCpts and EX_glc__D_e from Transport and
 * exchange, every node they use, and the full set of text labels. It carries
 * the fields beyond the stock schema: `label_text` and `font_size_base` on
 * nodes, reactions and text labels, and `pathways` and `regions` in the header.
 *
 * Useful facts: f6p_c (t0_16) is shared by PGI and PFK, fdp_c (t0_17) by PFK and
 * FBA, while atp_c (t0_36) and adp_c (t0_37) belong to PFK alone. title_0 and
 * title_1 are the pathway captions; region_* are the region captions.
 */
const data = require('./v2_canvas.json')

module.exports = function getV2Map () {
  return JSON.parse(JSON.stringify(data))
}
