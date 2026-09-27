# Watercolor bouquet

Source geometry and shader: user-supplied `public/blender/watercolor_rose.blend`.
It includes a modeled rose (`Petals`, `Stem`, leaves and sepals), not just a shader.
The original file is preserved.

`watercolor-bouquet.blend` is the editable scene. It contains eight open roses
in dusty rose, warm blush, muted mauve, coral, cream and antique pink, plus two
smaller narrow blooms. The flowers occupy staggered positions around the bunch.
The build checks evaluated petal meshes for intersections at their actual size
and enlarged by 4.5%, preserving clearance through a complete turn.
Each flower has a different scale, tilt and gentle petal asymmetry. Selected
source leaves and sepals retain their modifiers, with sage-colored foliage.
Stems gather loosely at the base. The source's Eevee material, fixed paper,
Filmic view and lighting ratios are retained. Petal normal distortion is reduced
from 0.70 to 0.48 so the folds remain clearer while keeping watercolor edges.
Broad uneven pigment washes, pale paper patches and fine granulation add
watercolor variation without increasing normal distortion.

Build with `scripts/blender/create_watercolor_bouquet.py`, setting `__file__`
to its absolute path in connected Blender. This makes a separate scene and
does not change the source rose, woodland, brain or mug scenes.

With the bouquet active, execute `scripts/blender/render_bouquet_orbit.py`, then
`node scripts/pack-bouquet-orbit.cjs`. Optional START/END globals select frame
batches. The website uses 144 transparent 1024 x 1152 WebP views in
`orbit-airy`, approximately 13.80 MB for a complete turn. The 2.5-degree
spacing uses the closest single view instead of crossfading view-dependent
paint, preventing doubled petal contours when stopped between angles.
Views load only when selected; four textures are retained at a time
to bound memory despite the higher resolution. The previous 72-frame orbit
and earlier `orbit-fuller` / `orbit-wash` sets are retained but no longer requested by the website.

A narrow fade conceals the cut tips, with sparse, low-opacity watercolor wisps
above it revealing the website's own paper background. The wash drifts slowly; reduced motion
freezes the pattern. Animation pauses when the scene is offscreen or hidden.

The third button, “Bukett”, now selects this object. Horizontal drag, arrow
keys and Home control the full turn. Existing painted scene journeys carry
the camera from the woodland to the bouquet. The paper treatment remains;
the bouquet has a painted zigzag crescent around a clearer central field,
with Gaussian blur increasing toward the periphery. Rose, lavender, blue,
sage and gold bands use broken pigment edges. Ten wider-spaced bands paint in
over 1.8 animation seconds, with a gentle roughly 11-second breathing cycle.
Outer bands are more diluted. Rotation input adds a bounded swell and directional
drift that decays after release; the comparison toggle replays the painted entrance.
The effect
stays in screen space while the flowers rotate behind it. Its center and
radius adapt to the mobile composition; reduced motion freezes the bands.
The comparison toggle removes both zigzags and blur. An extra render target
preserves the sharp center; it is resized and disposed with the scene.
Earlier scenes keep their effects and setting.
