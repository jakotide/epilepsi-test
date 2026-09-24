"""Export tree views and sparse grass; leave the editable studio restored."""
from pathlib import Path
from math import radians
from mathutils import Vector
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/grove'
scene = bpy.data.scenes['Migrene | Watercolor Grove']
bpy.context.window.scene = scene
trunk = bpy.data.objects['Grove | source tree trunk']
crown = bpy.data.objects['Grove | sparse watercolor foliage']
grass = bpy.data.objects['Grove | grass tufts']
camera = scene.camera
render = scene.render
original = (render.resolution_x, render.resolution_y, render.filepath, render.film_transparent,
            camera.location.copy(), camera.rotation_euler.copy(), camera.data.ortho_scale)
rotations = [o.rotation_euler.copy() for o in (trunk, crown)]
try:
    render.film_transparent = True
    render.resolution_x, render.resolution_y = 1000, 1100
    for name, angle in [('tree-sage', 0), ('tree-gold', 38), ('tree-blue', -38)]:
        for obj, rotation in zip((trunk, crown), rotations):
            obj.rotation_euler = rotation
            obj.rotation_euler.z += radians(angle)
        render.filepath = str(OUT / f'{name}.png')
        bpy.ops.render.render(write_still=True)
    trunk.hide_render = crown.hide_render = True
    grass.hide_render = False
    camera.location = (0, -8, 2)
    camera.rotation_euler = (Vector((0, 0, .15))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = 3.15
    render.resolution_x, render.resolution_y = 1200, 400
    render.filepath = str(OUT / 'grass-tufts.png')
    bpy.ops.render.render(write_still=True)
finally:
    trunk.hide_render = crown.hide_render = False
    grass.hide_render = True
    for obj, rotation in zip((trunk, crown), rotations):
        obj.rotation_euler = rotation
    (render.resolution_x, render.resolution_y, render.filepath, render.film_transparent,
     camera.location, camera.rotation_euler, camera.data.ortho_scale) = original
bpy.data.libraries.write(str(OUT / 'watercolor-grove.blend'), {scene}, fake_user=True)
print('GROVE_LAYERS_READY')
