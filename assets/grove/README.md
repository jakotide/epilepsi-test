# Watercolor grove

The current website uses the airy woodland study in `woodland/`, inspired by
the supplied image of tall birch-like trunks, open branches, and sparse foliage.
Three original branching meshes carry distinct palettes: dark ink and warm birch,
cobalt/turquoise, and sunlit gold/moss. Small cupped leaves add stronger green,
yellow, and rose-pink accents, with different color distributions on each tree. Materials
copy the mug's rose-derived Eevee shader, retaining its stepped light washes,
distorted pigment boundaries, and screen-space paper fibers. Bark adds a
second layer of broad, uneven pigment pools. The silhouettes are independently
designed: a crooked spreading birch, a straight blue trunk with high branches,
and a leaning gold tree with a low blossom fork. Branches extend in depth so the
side and back views retain volume.

Editable file: `woodland/watercolor-woodland.blend`.
Build with `scripts/blender/create_watercolor_woodland.py` in Blender, with
`__file__` set to its absolute path. With that woodland scene active, execute
`scripts/blender/render_woodland_orbit.py`, then run
`node scripts/pack-woodland-orbit.cjs`. Optional KINDS, START, END globals select
render batches. `pack-woodland.cjs` only rebuilds the earlier static stills.
The script creates a separate scene and preserves the earlier study and sources.
It requires the mug scene/material to be loaded. Individual exports are transparent;
the final studio preview includes the original paper world.

Each tree has 72 transparent 512 x 768 WebP views (five-degree spacing), about
11.72 MB for all three complete turns. Only nearby angles load on demand, with
six textures retained per tree. Ghost trees share the same texture caches.
Dragging orbits the camera around five fixed tree anchors in a roughly circular
clearing while blending matching Blender angles. Tree image planes face the
orbit direction without moving their roots. Depth order and pigment opacity
follow camera distance, so the farthest trees become pale from every angle.
Left/Right turns by 15 degrees; Home resets. Elevation stays fixed. This
hybrid avoids exporting the Eevee material as an incompatible glTF shader.
Nine fixed grass patches use crossed planes sharing the first study's texture.
Three horizontal ground washes stay attached to the clearing beneath them.
Foreground trees carry more pigment; distant trees dissolve into the paper.
The bases fade softly, with small vertex bends adding movement.
Existing effects, lazy loading, reduced motion, disposal, and scene travel remain.

## Earlier grove study (retained)

Starting geometry: user-supplied `public/blender/195-tree.blend`.
Watercolor material: derived from the supplied rose material through the mug study.

The editable `watercolor-grove.blend` retains the original tree's trunk and a
deterministic subset of 1,048 leaf instances, with softly subdivided shapes and
sage, warm ochre, and blue-green pigment. New sparse grass uses 57 blade ribbons
instead of the source scene's dense generated grass field. Source files and the
existing brain/mug studies remain unchanged.

Build in Blender with `scripts/blender/create_watercolor_grove.py`, then
`scripts/blender/render_grove_layers.py` (set `__file__` to each absolute path).
These use the previously built mug's watercolor material; load that study first
if it is not already in the Blender session. Export web images with
`node scripts/pack-grove-layers.cjs`.

The earlier browser composition used three separately rendered tree angles and one shared grass
texture, about 260 KB combined. Five painted planes and three soft ground washes
form the composition. The distant trees are smaller and more transparent.
Small vertex bends and horizontal parallax add depth; this is a layered painting,
not a freely orbitable forest. Bokeh and haze reuse the existing comparison pass.

Textures load when the experience section enters the viewport, and reuse the
same grass texture for both clumps. Animation pauses outside the viewport, in
hidden tabs, and for reduced-motion preferences. All GPU resources are disposed
when the section unmounts.

Scene changes use a roughly 2.2-second GSAP journey: the subject turns and fades,
a procedural watercolor ribbon draws into world depth, the camera follows, and
the ribbon dissolves as the destination appears. The ribbon adds no image assets.
Quick selections resolve to the latest choice.
Reduced-motion mode bypasses the journey, and transitions pause offscreen.

Leaving the woodland uses a separate 3.15-second passage. The camera moves 9.6
world units through the anchored tree layers along a straight, eased path.
Camera orientation stays fixed; there is no lateral sine sway or mid-flight turn.
Foreground trees fade first; distant pigment lingers. A low watercolor trail
follows at 82% of camera travel, with moving pigment along its length. The next
subject is positioned at the journey endpoint before fading in; camera and
subject positions reset together after arrival to avoid a visual jump. The
existing short brush journey is retained when departing the mug. Rapid choices
still resolve at the hidden scene swap, and reduced motion settles immediately.
