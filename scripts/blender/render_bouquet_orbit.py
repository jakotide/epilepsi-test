"""Render a full bouquet turn while retaining the rose's Eevee watercolor."""
from pathlib import Path
from math import radians
import bpy

ROOT=Path(__file__).resolve().parents[2]
scene=bpy.context.scene
assert scene.name.startswith('Migrene | Watercolor Bouquet')
root=next(o for o in scene.objects if o.name.startswith('Bouquet | gathered roses'))
render=scene.render
folder=ROOT/'assets/bouquet/orbit-airy';folder.mkdir(parents=True,exist_ok=True)
original=(root.rotation_euler.copy(),render.resolution_x,render.resolution_y,render.film_transparent,render.filepath)
try:
    render.resolution_x=1024;render.resolution_y=1152;render.film_transparent=True
    for index in range(globals().get('START',0),globals().get('END',144)):
        root.rotation_euler.z=radians(index*2.5)
        render.filepath=str(folder/f'view-{index:02d}.png')
        bpy.ops.render.render(write_still=True)
    print('BOUQUET_ORBIT_READY')
finally:
    root.rotation_euler,render.resolution_x,render.resolution_y,render.film_transparent,render.filepath=original
