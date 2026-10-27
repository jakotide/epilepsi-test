"""Add a plate and linen-bound book to a copy of the site's watercolor mug.

Run through send-command.cjs. Saves only the new scene and its dependencies;
existing Blender scenes, source materials, and the open file are preserved.
"""
from pathlib import Path
from math import sin, cos, pi, radians
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/still-life'
OUT.mkdir(parents=True, exist_ok=True)
with bpy.data.libraries.load(str(ROOT / 'assets/mug/watercolor-mug-with-shadow.blend'), link=False) as (_, library):
    library.scenes = ['Migrene | Mug and cast shadow']
source = library.scenes[0]
scene = bpy.data.scenes.new('Migrene | Watercolor Still Life')
bpy.context.window.scene = scene
scene.render.engine = source.render.engine
scene.world = source.world
scene.view_settings.view_transform = source.view_settings.view_transform
scene.view_settings.look = source.view_settings.look
scene.eevee.taa_render_samples = 32
root = bpy.data.objects.new('Still life | turntable', None)
scene.collection.objects.link(root)


def color(hexcode):
    values = [int(hexcode[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in values) + (1,)


original_material = next(o.data.materials[0] for o in source.objects if 'hollow ceramic' in o.name)


def watercolor(name, palette):
    material = original_material.copy()
    material.name = 'Still life | ' + name
    for node in material.node_tree.nodes:
        if node.type != 'VALTORGB':
            continue
        stops = node.color_ramp.elements
        if len(stops) == 3 and .35 < stops[1].position < .45:
            for stop, tint in zip(stops, palette):
                stop.color = color(tint)
        elif len(stops) == 2 and stops[0].position > .6:
            stops[0].color = color(palette[2])
    return material


ceramic = watercolor('blue-gray ceramic washes', ['6b8b9e', 'b9cbd2', 'fffcf7'])
plate_glaze = watercolor('diluted celadon plate', ['819b9d', 'c5d4d1', 'f9fbf7'])
plate_rim = watercolor('painted celadon rim', ['668b94', 'a1bfc2', 'd0e0df'])
cover = watercolor('lavender linen cover', ['736682', 'b5abc5', 'e5deed'])
paper = watercolor('ivory book pages', ['b2a695', 'e3dbca', 'fffaf0'])
page_lines = watercolor('page edge pigment', ['aba090', 'c8bfae', 'e6decf'])
ribbon_material = watercolor('dusty rose bookmark', ['a36b78', 'c998a1', 'eed6db'])
stamp = watercolor('faded cover embossing', ['968975', 'c0b395', 'dfd4ba'])

for original in source.objects:
    if original.type == 'MESH' and 'paper floor' not in original.name:
        obj = original.copy()
        obj.data = original.data.copy()
        obj.name = 'Still life | ' + original.name.split(' | ')[-1].split('.')[0]
        scene.collection.objects.link(obj)
        obj.parent = root
        obj.location = (-1.65, .75, 0)
        obj.rotation_euler.z = radians(-22)
        obj.data.materials.clear()
        obj.data.materials.append(ceramic)


def mesh_object(name, vertices, faces, material, parent=root):
    mesh = bpy.data.meshes.new('Still life | ' + name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(mesh.name, mesh)
    scene.collection.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(material)
    return obj


# A shallow ceramic plate, with a recessed well and a softly raised rolled rim.
profile = [(0,.12),(.55,.12),(.90,.123),(1.04,.14),(1.14,.19),
           (1.26,.26),(1.39,.31),(1.48,.325),(1.515,.31),(1.52,.28),
           (1.48,.255),(1.37,.24),(1.23,.19),(1.11,.13),(1.01,.075),
           (.91,.04),(.65,.035),(0,.035)]
vertices, faces = [], []
segments = 128
for radius, z in profile:
    for i in range(segments):
        angle = i / segments * 2*pi
        wobble = 1 + .002*sin(angle*5) + .0015*cos(angle*9)
        vertices.append((radius*cos(angle)*wobble, radius*sin(angle)*wobble, z))
for j in range(len(profile)-1):
    for i in range(segments):
        k = (i+1) % segments
        faces.append((j*segments+i, j*segments+k, (j+1)*segments+k, (j+1)*segments+i))
plate = mesh_object('hand-thrown plate', vertices, faces, plate_glaze)
plate.location = (-1.05, -1.70, 0)
plate.data.materials.append(plate_rim)
for face in plate.data.polygons:
    face.use_smooth = True
    if face.index // segments in (3, 6):
        face.material_index = 1
subdivision = plate.modifiers.new('Soft ceramic profile', 'SUBSURF')
subdivision.levels = subdivision.render_levels = 2

book = bpy.data.objects.new('Still life | closed linen book', None)
scene.collection.objects.link(book)
book.parent = root
book.location = (1.95, .05, 0)
book.rotation_euler.z = radians(-15)


def box(name, dimensions, location, material, bevel=.025):
    x, y, z = [v/2 for v in dimensions]
    vertices = [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),
                (-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    obj = mesh_object(name, vertices, faces, material, book)
    obj.location = location
    modifier = obj.modifiers.new('Worn rounded edges', 'BEVEL')
    modifier.width = bevel
    modifier.segments = 3
    obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return obj


box('lower book cover', (2.35,3.15,.085), (0,0,.065), cover)
box('cream page block', (2.21,2.98,.36), (.025,0,.285), paper, .035)
box('upper book cover', (2.35,3.15,.09), (0,0,.50), cover)
box('rounded cloth spine', (.14,3.15,.48), (-1.115,0,.285), cover, .06)
for i in range(11):
    z = .135 + i*.029
    box('fore-edge page line %02d' % i, (.008,2.90,.004), (1.134,.0,z), page_lines, .002)
    box('lower page line %02d' % i, (2.13,.008,.004), (.035,-1.493,z), page_lines, .002)
for y in (-1.04,1.04):
    box('subtle spine band', (.154,.035,.39), (-1.115,y,.285), cover, .015)
# A small unlettered foil motif; no raster text or external artwork.
box('cover stamp long', (.66,.018,.006), (.08,.58,.548), stamp, .003)
box('cover stamp short', (.36,.014,.006), (.08,.48,.548), stamp, .003)
ribbon = mesh_object('ribbon bookmark', [(-.10,-1.40,.32),(.10,-1.40,.32),
    (.10,-1.70,.13),(.12,-1.95,.04),(0,-1.87,.042),(-.10,-1.96,.04),(-.10,-1.70,.13)],
    [(0,1,2,6),(6,2,3,4,5)], ribbon_material, book)
ribbon.location.x = .58
solidify = ribbon.modifiers.new('Ribbon thickness', 'SOLIDIFY')
solidify.thickness = .006

# A neutral receiver used only for extracting transparent contact/cast shadows.
floor_material = bpy.data.materials.new('Still life | neutral shadow receiver')
floor_material.use_nodes = True
nodes, links = floor_material.node_tree.nodes, floor_material.node_tree.links
output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
diffuse = nodes.new('ShaderNodeBsdfDiffuse')
diffuse.inputs['Color'].default_value = (1,1,1,1)
diffuse.inputs['Roughness'].default_value = 1
links.new(diffuse.outputs[0], output.inputs['Surface'])
floor = mesh_object('paper floor', [(-40,-40,-.015),(40,-40,-.015),(40,40,-.015),(-40,40,-.015)], [(0,1,2,3)], floor_material, None)


def aim(obj, target=(0,0,.6)):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


for name, location, power, size in [
    ('broad window',(-3,-4,6),205,3.2), ('reflected sky',(4,-1,3),15,4),
]:
    data = bpy.data.lights.new('Still life | '+name, 'AREA')
    data.energy, data.size = power, size
    obj = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    aim(obj)
data = bpy.data.cameras.new('Still life | wider watercolor camera')
data.type = 'ORTHO'
data.ortho_scale = 9.8
camera = bpy.data.objects.new(data.name, data)
scene.collection.objects.link(camera)
camera.location = (0,-12,8.5)
aim(camera, (0,0,.55))
scene.camera = camera
scene.render.resolution_x = scene.render.resolution_y = 960
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene['notes'] = 'Mug, celadon plate, and lavender linen book. Same Eevee watercolor nodes; 72 five-degree views with shared shadows. Original scenes preserved.'
# The source material already contains its packed paper image.
bpy.data.libraries.write(str(OUT / 'watercolor-still-life.blend'), {scene}, fake_user=True)
print('STILL_LIFE_READY', scene.name, len(scene.objects))
