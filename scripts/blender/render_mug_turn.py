"""Render a restrained turn with the original Eevee watercolor material.

The website blends adjacent views. Geometry rotates in Blender, while camera,
paper coordinates, and studio lighting remain fixed. Run after mug refinement.
"""
from pathlib import Path
from math import radians
import bpy

ROOT = Path(__file__).resolve().parents[2]
scene = bpy.data.scenes['Migrene | Watercolor Mug']
bpy.context.window.scene = scene
objects = [o for o in scene.objects if o.type == 'MESH']
output = ROOT / 'assets/mug/turn'
output.mkdir(parents=True, exist_ok=True)
original = [(o, o.rotation_euler.copy()) for o in objects]
render = scene.render
settings = (render.resolution_x, render.resolution_y, render.resolution_percentage,
            render.film_transparent, render.filepath)
key = bpy.data.objects['Mug | broad window light'].data
energy = key.energy
try:
    # A little more window light, without washing out the blue-gray pigment.
    key.energy = 195
    render.resolution_x = render.resolution_y = 832
    render.resolution_percentage = 100
    render.film_transparent = True
    for index in range(13):
        for obj, rotation in original:
            obj.rotation_euler = rotation
            obj.rotation_euler.z += radians(-12 + index * 2)
        render.filepath = str(output / f'mug-{index:02d}.png')
        bpy.ops.render.render(write_still=True)
    print('MUG_TURN_READY', output)
finally:
    for obj, rotation in original:
        obj.rotation_euler = rotation
    (render.resolution_x, render.resolution_y, render.resolution_percentage,
     render.film_transparent, render.filepath) = settings
    key.energy = energy
