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

The website uses `public/models/mug/watercolor-mug-turn.webp`, a transparent atlas
of 13 Blender views from -12 to +12 degrees. A stronger window light exposes the
ivory highlights. Three.js blends adjacent views for a slow, small turn and mouse
response, preserving the exact painted finish. Soft painted shadows anchor its
base. Motion pauses offscreen, in hidden tabs, and for reduced-motion preferences.

To rebuild the views, execute `scripts/blender/render_mug_turn.py` after refinement,
then run `node scripts/pack-mug-turn.cjs`. The Blender script restores the original
scene transforms and render settings after exporting. The atlas is about 650 KB.

This is a limited rendered turn, not unrestricted live 3D rotation.
The live Eevee Shader to RGB material is not a glTF material and will need a
Three.js shader adaptation to retain this appearance on a freely rotating model.
