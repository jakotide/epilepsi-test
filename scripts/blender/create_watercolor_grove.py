"""Create a sparse watercolor tree study from the user-supplied tree file.

Render separate trees and grass for a small layered Three.js scene. The original
tree, mug, and brain files are never overwritten. Run inside connected Blender.
"""
from pathlib import Path
from math import sin, cos, pi, radians
import random
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/grove'
OUT.mkdir(parents=True, exist_ok=True)
source = next((s for s in bpy.data.scenes if any(o.name == 'Leaf' for o in s.objects)), None)
if source is None:
    with bpy.data.libraries.load(str(ROOT / 'public/blender/195-tree.blend'), link=False) as (_, library):
        library.scenes = ['Scene']
    source = library.scenes[0]
bpy.context.window.scene = source
dg = bpy.context.evaluated_depsgraph_get()
trunk_source = next(o for o in source.objects if o.name == 'Vert')
crown_source = next(o for o in source.objects if o.name == 'Icosphere')
trunk_mesh = bpy.data.meshes.new_from_object(trunk_source.evaluated_get(dg), depsgraph=dg)
trunk_mesh.transform(trunk_source.matrix_world)

rng = random.Random(73)
vertices, faces, leaf_centers = [], [], []
leaf_total = 0
for item in dg.object_instances:
    if not item.is_instance or item.parent.original != crown_source:
        continue
    if rng.random() > .55:
        continue
    leaf_total += 1
    evaluated = item.object
    mesh = evaluated.to_mesh()
    offset = len(vertices)
    vertices.extend(tuple(item.matrix_world @ v.co) for v in mesh.vertices)
    faces.extend(tuple(offset + i for i in p.vertices) for p in mesh.polygons)
    leaf_centers.extend([tuple(item.matrix_world.translation)] * len(mesh.polygons))
    evaluated.to_mesh_clear()

scene = bpy.data.scenes.new('Migrene | Watercolor Grove')
bpy.context.window.scene = scene
scene.render.engine = 'BLENDER_EEVEE'
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds['Mug | Rose paper world']
base = bpy.data.materials['Mug | ivory paper and blue-gray pigment']


def color(h):
    vals = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in vals) + (1,)


def pigment(name, dark, mid, light):
    mat = base.copy()
    mat.name = 'Grove | ' + name
    for n in mat.node_tree.nodes:
        if n.type == 'VALTORGB':
            stops = n.color_ramp.elements
            if len(stops) == 3 and .35 < stops[1].position < .45:
                stops[0].color, stops[1].color, stops[2].color = color(dark), color(mid), color(light)
            elif len(stops) == 2 and stops[0].position > .6:
                stops[0].color = color('f0eee0')
        if n.name == 'Mug | pigment blooms':
            n.inputs['Scale'].default_value = 9
        if n.name == 'Mug | granulation':
            n.inputs[1].default_value = .45
            n.inputs[2].default_value = .775
    return mat


sage = pigment('sage leaf wash', '507f73', 'a8bd94', 'f4f0d0')
gold = pigment('sunlit ochre leaf wash', '929759', 'c7c38c', 'fff3cb')
teal = pigment('blue-green leaf wash', '527e8f', 'a3bdb6', 'eaf0dc')
bark = pigment('warm bark and cool shadow', '637879', 'b8a188', 'f5e4c5')
grass_mat = pigment('grass wash', '648c7b', 'b1c49d', 'f0eccb')

trunk = bpy.data.objects.new('Grove | source tree trunk', trunk_mesh)
scene.collection.objects.link(trunk)
trunk.data.materials.clear()
trunk.data.materials.append(bark)
for p in trunk.data.polygons:
    p.use_smooth = True
crown_mesh = bpy.data.meshes.new('Grove | sparse leaf clusters')
crown_mesh.from_pydata(vertices, [], faces)
crown_mesh.update()
crown = bpy.data.objects.new('Grove | sparse watercolor foliage', crown_mesh)
scene.collection.objects.link(crown)
for mat in (sage, gold, teal):
    crown_mesh.materials.append(mat)
for p, center in zip(crown_mesh.polygons, leaf_centers):
    x, y, z = center
    p.material_index = 1 if z > 4.3 and x < .6 else 2 if x > .7 and z < 3.9 else 0
    p.use_smooth = True
# Normalize the original tree to a small studio setup.
for obj in (trunk, crown):
    obj.scale = (.65, .65, .65)
    obj['source'] = 'User-supplied public/blender/195-tree.blend'
    mod = obj.modifiers.new('Soft painted shapes', type='SUBSURF')
    mod.levels = mod.render_levels = 1
crown['leaves'] = leaf_total
crown['retained_fraction'] = .55

# Sparse handmade blade ribbons, with space between clumps and irregular tips.
rng = random.Random(12)
verts, polys = [], []
for cluster in range(8):
    cx = (cluster - 3.5) * .31 + rng.uniform(-.08, .08)
    cy = rng.uniform(-.10, .15)
    for blade in range(rng.randint(5, 9)):
        x, y = cx + rng.uniform(-.10, .10), cy + rng.uniform(-.08, .08)
        height, width = rng.uniform(.14, .40), rng.uniform(.011, .027)
        lean, heading = rng.uniform(-.18, .18), rng.uniform(0, 2*pi)
        side = Vector((cos(heading), sin(heading), 0))
        start = len(verts)
        for t, taper in ((0, 1), (.42, .8), (.76, .46), (1, 0)):
            center = Vector((x + lean*t*t, y + .04*sin(t*pi), height*t))
            verts.extend([tuple(center - side*width*taper), tuple(center + side*width*taper)])
        for j in range(3):
            polys.append((start+j*2, start+j*2+1, start+j*2+3, start+j*2+2))
mesh = bpy.data.meshes.new('Grove | sparse grass ribbons')
mesh.from_pydata(verts, [], polys)
mesh.materials.append(grass_mat)
grass = bpy.data.objects.new('Grove | grass tufts', mesh)
scene.collection.objects.link(grass)
grass.hide_render = True


def aim(obj, target=(0, 0, 1.65)):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()


for name, location, energy, size in [
    ('Grove | soft daylight', (-3, -4, 6), 160, 4),
    ('Grove | sky fill', (4, -1, 3), 35, 4),
]:
    data = bpy.data.lights.new(name, type='AREA')
    data.energy, data.size = energy, size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    aim(obj)
camera_data = bpy.data.cameras.new('Grove | paper study camera')
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 5.15
camera = bpy.data.objects.new(camera_data.name, camera_data)
scene.collection.objects.link(camera)
camera.location = (0, -10, 3.3)
aim(camera, (0, 0, 1.95))
scene.camera = camera
scene.render.resolution_x = 1100
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = False
scene.render.filepath = str(OUT / 'tree-study.png')
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
        area.spaces.active.shading.type = 'RENDERED'
        area.spaces.active.overlay.show_overlays = False
bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(str(OUT / 'watercolor-grove.blend'), {scene}, fake_user=True)
print('GROVE_STUDY_READY', leaf_total, 'leaves;', len(polys), 'grass faces')
