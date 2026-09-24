# Watercolor grove

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

The browser uses three separately rendered tree angles and one shared grass
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
Text follows the scene's arrival; quick selections resolve to the latest choice.
Reduced-motion mode bypasses the journey, and transitions pause offscreen.
