"""Render 72 painted turntable angles. Optional START/END permit short batches."""
from pathlib import Path
from math import radians
from mathutils import Vector
import bpy

ROOT = Path(__file__).resolve().parents[2]
scene = bpy.data.scenes['Migrene | Watercolor Mug']
previous_scene = bpy.context.window.scene
bpy.context.window.scene = scene
objects = [o for o in scene.objects if o.type == 'MESH']
original = [(o, o.rotation_euler.copy()) for o in objects]
camera = scene.camera
camera_settings = (camera.location.copy(), camera.rotation_euler.copy(), camera.data.ortho_scale)
render = scene.render
settings = (render.resolution_x, render.resolution_y, render.resolution_percentage, render.film_transparent, render.filepath)
key = bpy.data.objects['Mug | broad window light'].data
energy = key.energy
output = ROOT / 'assets/mug/orbit'
output.mkdir(parents=True, exist_ok=True)
try:
    key.energy = 205
    camera.location = (0, -9, 3.8)
    camera.rotation_euler = (Vector((0, 0, 1.12)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = 4.4
    render.resolution_x = render.resolution_y = 640
    render.resolution_percentage = 100
    render.film_transparent = True
    for index in range(globals().get('START', 0), globals().get('END', 72)):
        for obj, rotation in original:
            obj.rotation_euler = rotation
            obj.rotation_euler.z += radians(index * 5)
        render.filepath = str(output / f'mug-{index:02d}.png')
        bpy.ops.render.render(write_still=True)
    print('MUG_ORBIT_READY', output)
finally:
    for obj, rotation in original:
        obj.rotation_euler = rotation
    camera.location, camera.rotation_euler, camera.data.ortho_scale = camera_settings
    (render.resolution_x, render.resolution_y, render.resolution_percentage, render.film_transparent, render.filepath) = settings
    key.energy = energy
    bpy.context.window.scene = previous_scene
