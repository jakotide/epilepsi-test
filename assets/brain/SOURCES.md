# Painted brain

Anatomical base: **Brain and Skull**, by **drummyfish**, released under **CC0 1.0**.

- Author's model and license: https://opengameart.org/content/brain-and-skull
- License: https://creativecommons.org/publicdomain/zero/1.0/
- Original download: https://opengameart.org/sites/default/files/head_1.blend
- Local untouched original: `source/head.blend`

Only the brain mesh is used. It has been subdivided, smoothed, normalized, and
given new watercolor vertex pigmentation and materials. The face and skull are
not included in the exported asset. This is an artistic model, not a diagnostic
or anatomically exhaustive reference.

## Files

- `painted-brain.blend`: editable brain and Eevee material in a simple studio.
- `../../public/models/brain/painted-brain.glb`: standalone, Y-up, vertex-painted
  mesh with a matte standard material for Three.js.
- `../../scripts/blender/create_painted_brain.py`: reproducible authoring script.
- `../../scripts/blender/apply_rose_watercolor.py`: run after the authoring script
  to apply the current rose-inspired material and save/render the Blender study.

The portable GLB includes pigment color, not Blender's Shader-to-RGB nodes or
compositor. The browser study supplies its own light-responsive painted shader.
No paper image or missing external image dependency is embedded in the GLB.

Current material reference: the user-supplied `public/blender/watercolor_rose.blend`
and Diego Gangl's tutorial linked in
https://80.lv/articles/setting-up-watercolor-renders-in-blender-eevee . The rose's
material is appended into the editable brain file with a quieter pigment palette.
The user's reference file is unchanged.

Paper: `rose-paper.jpg` is the packed paper photograph extracted from that rose
file (`joao-vitor-duarte-k4Lt0CjUnb0-unsplash.jpg`). It stays packed in the Blender
file and is loaded separately by the browser from `public/models/brain/`.
The earlier material using Texturelabs paper is retained in the Blender file.
The browser study is at `/migrene/brain`; it is independent of the portrait and
portal transition.

## Current study

The model contains approximately 109,000 triangles and the GLB is approximately
3 MB, with no external mesh or texture dependencies. The browser shader combines
screen-space paper, translucent pigment absorption, soft washes, narrow wet-edge
ramps, and distorted normals. Paper coordinates match on the brain and background.
Object/window-coordinate noise makes paint subtly re-form when rotating; there
is no timed flicker at rest. Reduced motion disables the extra screen-space flow.
This is a Three.js adaptation, not a byte-for-byte translation of Eevee lighting.
Rotate by dragging or with the arrow keys; reset restores the initial view.

## Scroll world

`/migrene` now reveals this asset directly through the existing watercolor portal.
A single Three.js canvas stays in the sticky stage throughout the reveal and four
story views. A GSAP ScrollTrigger timeline controls camera position, composition,
local pigment highlights, and placeholder side text. All movements reverse when
scrolling upward. The standalone `/migrene/brain` study retains its orbit controls.

`app/migrene/BrainWorld.tsx` contains the temporary chapters and selected regions.
These are illustrative selections, not an anatomical mapping. The horizontal wash
beneath the brain and seven backdrop planes are in `brain/worldPaint.ts`.
Three backdrop washes match the paper until broad pointer proximity reveals
their pigment. Layers shift and tilt at different rates with the camera, with
gentle ambient drift and pointer parallax. Story cards contain only title and text.
The cursor also adds pigment directly to the paper. Reduced motion fixes the
camera angle and disables ambient flow; scroll still changes the story and color.
