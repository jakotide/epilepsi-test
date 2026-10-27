"""Render a transparent watercolor turntable and matching shadow passes.

blender -b assets/still-life/watercolor-still-life.blend -P scripts/blender/render_still_life.py -- 0 72
"""
from pathlib import Path
from math import radians
import sys
import bpy

ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
start, end = (int(args[0]), int(args[1])) if len(args) >= 2 else (0,72)
variant = args[2] if len(args)>2 else 'wide'
assert variant in ('wide','mug-close','open-book')
ASSET = ROOT / 'assets/still-life'
if variant!='wide':
    ASSET = ASSET / variant
OUT = ASSET / 'renders'
OUT.mkdir(parents=True, exist_ok=True)
scene = next(s for s in bpy.data.scenes if s.name.startswith('Migrene | Watercolor Still Life'))
bpy.context.window.scene = scene
root = next(o for o in scene.objects if o.name.startswith('Still life | turntable'))
floor = next(o for o in scene.objects if o.name.startswith('Still life | paper floor'))
subjects = [o for o in scene.objects if o.type == 'MESH' and o != floor]
try:
    if start == 0:
        for obj in subjects:
            obj.hide_render = True
        floor.hide_render = False
        scene.render.filepath = str(OUT / 'floor-baseline.png')
        bpy.ops.render.render(write_still=True)
    for obj in subjects:
        obj.hide_render = False
    for index in range(start,end):
        root.rotation_euler.z = radians(index*5)
        floor.hide_render = True
        scene.render.filepath = str(OUT / f'object-{index:02d}.png')
        bpy.ops.render.render(write_still=True)
        floor.hide_render = False
        scene.render.filepath = str(OUT / f'floor-{index:02d}.png')
        bpy.ops.render.render(write_still=True)
        print('STILL_LIFE_FRAME', index, flush=True)
finally:
    root.rotation_euler.z = 0
    floor.hide_render = False
    for obj in subjects:
        obj.hide_render = False

# Save a regular standalone file with this scene active, so opening it in the
# Blender UI lands on the still life rather than an empty library scene.
scene.render.filepath = str(OUT / 'object-00.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET / 'watercolor-still-life.blend'))
