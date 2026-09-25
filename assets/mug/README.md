# Watercolor mug study

Original hollow ceramic mug modeled for the migraine experience. Rounded base,
thin rolled rim, full interior, and a gently irregular swept loop handle.

`watercolor-mug.blend` contains the mug scene and editable Eevee materials.
The material adapts the supplied `public/blender/watercolor_rose.blend`:
view-dependent distorted normals, layered pigment boundaries, exposed paper,
and additional blue-gray pigment blooms and fine paper granulation.
The supplied reference files and existing brain scene are unchanged.

Previews:

- `public/models/mug/watercolor-mug-preview.png`: on the rose's paper background.
- `public/models/mug/watercolor-mug-transparent.png`: painted cutout for compositing.

To reproduce in Blender, execute `scripts/blender/create_watercolor_mug.py`,
then `scripts/blender/refine_watercolor_mug.py`, with `__file__` set to each script's
absolute path. The build creates a new scene; refinement targets its default name.

The website uses `public/models/mug/lit-orbit/`: 72 transparent, 768px Blender views
at five-degree intervals, supporting a full horizontal turn. Window light exposes
the ivory highlights. Each angle includes a real Eevee area-light cast shadow,
including the changing handle shadow, extracted against an unoccluded floor
baseline and softened into the paper. Three.js blends adjacent views while
retaining the original Eevee finish. The full set is 2.49 MB;
only nearby angles load, with at most three requests in flight and eight textures
retained (plus in-flight decodes). Superseded textures are disposed.

Drag horizontally or use Left/Right to turn the cup. Home resets the view.
Vertical touch gestures still scroll the page. Automatic sway stops after manual
rotation and pauses offscreen, in hidden tabs, and for reduced-motion preferences.
Manual rotation remains available with reduced motion enabled.

To rebuild, execute `scripts/blender/render_mug_shadow_orbit.py` after refinement,
then run `node scripts/pack-mug-shadow-orbit.cjs`. Optional START/END globals select
a render batch; the first batch also renders the floor baseline. The script
creates a separate studio saved as `watercolor-mug-with-shadow.blend`, preserving
the original mug scene. Shadow extraction ignores unlit baseline pixels and uses
a smooth falloff to avoid a rectangular floor boundary. Older orbits and the
thirteen-view atlas are retained but no longer requested by the site.

This is a rendered turntable with a fixed elevation, not unrestricted live 3D
orbit. The grove similarly combines rendered angles with rotating depth layers.
Eevee Shader to RGB is not a glTF material; free camera orbit would require a
Three.js shader adaptation to retain the painted appearance.
