"""72 views of each individual tree, for a depth-preserving whole-grove turn."""
from pathlib import Path
from math import radians
from mathutils import Vector
import bpy

ROOT=Path(__file__).resolve().parents[2]
scene=bpy.context.scene
assert scene.name.startswith('Migrene | Painted Woodland')
trees=[[o for o in scene.objects if o.type=='MESH' and o.name.startswith(f'Woodland | {kind} ')] for kind in range(3)]
camera=scene.camera;render=scene.render
original=[(o,o.location.copy(),o.rotation_euler.copy(),o.hide_render) for pair in trees for o in pair]
settings=(camera.location.copy(),camera.rotation_euler.copy(),camera.data.ortho_scale,render.resolution_x,render.resolution_y,render.film_transparent,render.filepath)
try:
    camera.location=(0,-12,3.4)
    camera.rotation_euler=(Vector((0,0,2.85))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=7.7
    render.resolution_x=512;render.resolution_y=768;render.film_transparent=True
    for kind,name in enumerate(('birch-ink','birch-blue','birch-gold')):
        if kind not in globals().get('KINDS',range(3)):continue
        folder=ROOT/'assets/grove/woodland/orbit'/name
        folder.mkdir(parents=True,exist_ok=True)
        for j,pair in enumerate(trees):
            for o in pair:o.hide_render=j!=kind;o.location=(0,0,0)
        for index in range(globals().get('START',0),globals().get('END',72)):
            for o in trees[kind]:o.rotation_euler.z=radians(index*5)
            render.filepath=str(folder/f'view-{index:02d}.png')
            bpy.ops.render.render(write_still=True)
    print('WOODLAND_ORBIT_READY')
finally:
    for o,location,rotation,hidden in original:o.location=location;o.rotation_euler=rotation;o.hide_render=hidden
    (camera.location,camera.rotation_euler,camera.data.ortho_scale,render.resolution_x,render.resolution_y,render.film_transparent,render.filepath)=settings
