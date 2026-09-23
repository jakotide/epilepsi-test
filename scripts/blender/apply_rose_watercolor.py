"""Apply the supplied rose's watercolor material to the existing brain study.

Run after create_painted_brain.py in the connected Blender instance.
Keeps the geometry/GLB intact; view-dependent shading is implemented separately
in app/migrene/brain/paintedMaterial.ts for the browser.
"""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
scene = bpy.data.scenes.get('Migrene | Painted Brain')
if scene is None:
    raise RuntimeError('Build the brain study first.')
bpy.context.window.scene = scene
brain = next(o for o in scene.objects if o.type == 'MESH')
brain.active_material.use_fake_user = True

with bpy.data.libraries.load(str(ROOT / 'public/blender/watercolor_rose.blend'), link=False) as (src, dst):
    dst.materials = ['Watercolor']
    dst.worlds = ['World']
mat = dst.materials[0]
mat.name = 'Brain | rose watercolor on paper'
world = dst.worlds[0]
world.name = 'Brain | camera paper world'
brain.data.materials[0] = mat
scene.world = world


def color(hexcode):
    vals = [int(hexcode[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in vals) + (1,)


for node in mat.node_tree.nodes:
    if node.type != 'VALTORGB':
        continue
    stops = node.color_ramp.elements
    # Identify by topology and ramp structure rather than localized node names.
    if len(stops) == 3 and .35 < stops[1].position < .45:
        node.label = 'Dusty rose pigment / diluted warm wash / exposed paper'
        stops[0].color = color('a46e82')
        stops[1].color = color('cba391')
    elif len(stops) == 2 and stops[0].position > .6:
        node.label = 'Very diluted pigment along the contour'
        stops[0].color = color('ead5cf')
    elif len(stops) == 6:
        node.label = 'Wet pigment borders — alternating dark and light'

groups = {node.node_tree for node in mat.node_tree.nodes if node.type == 'GROUP'}
for group in groups:
    for node in group.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            image = node.image
            if image.packed_file:
                (ROOT / 'public/models/brain/rose-paper.jpg').write_bytes(image.packed_file.data)
            image.filepath = '//../../public/models/brain/rose-paper.jpg'
            if not image.packed_file:
                image.pack()

brain['style'] = 'Rose-reference watercolor: exposed screen-space paper, wet pigment edges, view-dependent normal distortion'
scene['notes'] = 'Rose material adapted from the supplied watercolor_rose.blend. Paper fixed to camera; no timed flicker.'
scene.render.film_transparent = False
scene.render.resolution_percentage = 100
scene.render.filepath = str(ROOT / 'public/models/brain/brain-preview.png')
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.overlay.show_overlays = False
        area.spaces.active.region_3d.view_perspective = 'CAMERA'

versions = bpy.context.preferences.filepaths.save_version
bpy.context.preferences.filepaths.save_version = 0
try:
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/brain/painted-brain.blend'))
finally:
    bpy.context.preferences.filepaths.save_version = versions
bpy.ops.render.render(write_still=True)
print('ROSE_WATERCOLOR_READY', brain.name, mat.name)
