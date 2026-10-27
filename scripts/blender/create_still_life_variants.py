"""Create independent mug-close and open-book compositions from the wide scene."""
from pathlib import Path
from math import sin, cos, pi, radians
from random import Random
from runpy import run_path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets/still-life'
with bpy.data.libraries.load(str(BASE / 'watercolor-still-life.blend'), link=False) as (available, library):
    library.scenes = [next(name for name in available.scenes if name.startswith('Migrene | Watercolor Still Life'))]
source = library.scenes[0]


def find(scene, name):
    return next(obj for obj in scene.objects if obj.name.startswith('Still life | ' + name))


def copy_scene(variant):
    scene = bpy.data.scenes.new('Migrene | Watercolor Still Life | ' + variant)
    scene.world = source.world
    scene.render.engine = source.render.engine
    scene.view_settings.view_transform = source.view_settings.view_transform
    scene.view_settings.look = source.view_settings.look
    scene.eevee.taa_render_samples = 32
    mapping = {}
    for original in source.objects:
        obj = original.copy()
        if original.data:
            obj.data = original.data.copy()
        scene.collection.objects.link(obj)
        mapping[original] = obj
    for original, obj in mapping.items():
        obj.parent = mapping.get(original.parent)
    scene.camera = mapping[source.camera]
    scene.render.resolution_x = scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = True
    scene['still_life_variant'] = variant
    find(scene, 'turntable').rotation_euler.z = 0
    bpy.context.window.scene = scene
    return scene


def aim(scene, position, target, scale):
    scene.camera.location = position
    scene.camera.rotation_euler = (Vector(target)-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.ortho_scale = scale


def save(scene, variant):
    destination = BASE / variant
    destination.mkdir(parents=True, exist_ok=True)
    bpy.data.libraries.write(str(destination / 'watercolor-still-life.blend'), {scene}, fake_user=True)
    print('COMPOSITION_READY', variant, len(scene.objects))


close = copy_scene('mug-close')
for name in ('hollow ceramic body', 'gently irregular loop handle'):
    obj = find(close, name)
    obj.location = (-.45, -1.05, 0)
    obj.rotation_euler.z = radians(-18)
find(close, 'hand-thrown plate').location = (-1.65, 1.25, 0)
book = find(close, 'closed linen book')
book.location = (1.20, 1.28, 0)
book.rotation_euler.z = radians(-15)
book.scale = (.82,.82,.82)
aim(close, (0,-13,6.4), (0,0,.80), 7.8)
close['notes'] = 'Low camera, closer framing. Mug in front; closed book and plate recede behind it.'
save(close, 'mug-close')

scene = copy_scene('open-book')
root = find(scene, 'turntable')
closed = find(scene, 'closed linen book')
cover_material = find(scene, 'upper book cover').data.materials[0]
page_material = find(scene, 'cream page block').data.materials[0]
edge_material = find(scene, 'fore-edge page line').data.materials[0]
ribbon_material = find(scene, 'ribbon bookmark').data.materials[0]
# These are private copies in the new scene; the closed-book source is retained.
for obj in list(closed.children_recursive) + [closed]:
    bpy.data.objects.remove(obj, do_unlink=True)
for name in ('hollow ceramic body', 'gently irregular loop handle'):
    obj = find(scene, name)
    obj.location = (-1.50, 1.70, 0)
    obj.rotation_euler.z = radians(-22)
find(scene, 'hand-thrown plate').location = (1.50, 1.95, 0)
book = bpy.data.objects.new('Still life | open linen book', None)
scene.collection.objects.link(book)
book.parent = root
book.location = (0, -1.45, 0)
book.rotation_euler.z = radians(-8)


def mesh(name, vertices, faces, material, smooth=False):
    data = bpy.data.meshes.new('Still life | ' + name)
    data.from_pydata(vertices, [], faces)
    data.update()
    data.materials.append(material)
    for face in data.polygons:
        face.use_smooth = smooth
    obj = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(obj)
    obj.parent = book
    return obj


def box(name, dimensions, location, material):
    x,y,z = [v/2 for v in dimensions]
    vertices = [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    obj = mesh(name, vertices, faces, material)
    obj.location = location
    bevel = obj.modifiers.new('Soft worn corners', 'BEVEL')
    bevel.width = .025
    bevel.segments = 3
    obj.modifiers.new('Weighted cover normals', 'WEIGHTED_NORMAL')
    return obj


box('open left lavender cover', (2.35,3.18,.08), (-1.18,0,.06), cover_material)
box('open right lavender cover', (2.35,3.18,.08), (1.18,0,.06), cover_material)
box('open rounded spine', (.20,3.18,.12), (0,0,.085), cover_material)


def page_height(x, y):
    t = min(1, abs(x)/2.25)
    return .19 + .32*sin(pi*t)**.8 + .10*t + .018*cos(y*1.5)*sin(pi*t)


for side in (-1,1):
    nx, ny = 40, 26
    vertices, faces = [], []
    for i in range(nx+1):
        x = side*(.025 + i/nx*2.225)
        for j in range(ny+1):
            y = -1.49 + j/ny*2.98
            vertices.append((x,y,page_height(x,y)))
    for i in range(nx):
        for j in range(ny):
            a = i*(ny+1)+j
            face = (a,a+ny+1,a+ny+2,a+1)
            faces.append(face if side==1 else tuple(reversed(face)))
    obj = mesh('curved left pages' if side<0 else 'curved right pages', vertices, faces, page_material, True)
    solidify = obj.modifiers.new('Layered paper block', 'SOLIDIFY')
    solidify.thickness = .12
    solidify.offset = -1

# Fine lines across the exposed edges suggest a stack of individual leaves.
vertices, faces = [], []
for side in (-1,1):
    for y in (-1.491,1.491):
        for layer in range(7):
            for i in range(64):
                x1 = side*(.035+i/64*2.205)
                x2 = side*(.035+(i+1)/64*2.205)
                z1,z2 = page_height(x1,y)-.016-layer*.014, page_height(x2,y)-.016-layer*.014
                offset = len(vertices)
                vertices.extend([(x1,y,z1),(x2,y,z2),(x2,y,z2+.003),(x1,y,z1+.003)])
                faces.append(tuple(range(offset,offset+4)))
mesh('open book page edges', vertices, faces, edge_material)


def linear_color(hexcode):
    values = [int(hexcode[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)


ink = page_material.copy()
ink.name = 'Still life | faded graphite handwriting'
for node in ink.node_tree.nodes:
    if node.type!='VALTORGB':
        continue
    stops = node.color_ramp.elements
    if len(stops)==3 and .35<stops[1].position<.45:
        for stop,tint in zip(stops,['777580','a09aa7','b5afbc']):
            stop.color = linear_color(tint)
    elif len(stops)==2 and stops[0].position>.6:
        stops[0].color = linear_color('b5afbc')

# Small continuous, irregular pen strokes read as text at website size.
# There are no readable words; breaks and paragraph spacing form the rhythm.
random = Random(2417)
vertices, faces = [], []
for side in (-1,1):
    for row in range(17):
        if row in (5,12):
            continue
        y = 1.17-row*.139
        left,right = ((-1.98,-.29) if side<0 else (.29,1.98))
        x = left + (.11 if row in (0,6,13) else 0)
        end = right - (random.uniform(.30,.55) if row in (4,11,16) else 0)
        while x<end-.08:
            length = min(random.uniform(.13,.32),end-x)
            steps = max(12,round(length/.009))
            phase = random.random()*pi*2
            width = random.uniform(.006,.009)
            for step in range(steps):
                points = []
                for t in (step/steps,(step+1)/steps):
                    px = x+length*t
                    py = y + .017*sin(t*pi*random.choice((10,12,14))+phase) + .009*sin(t*pi*4+phase)
                    points.append((px,py))
                offset = len(vertices)
                for px,py in (points[0],points[1]):
                    for dy in (-width/2,width/2):
                        vertices.append((px,py+dy,page_height(px,py+dy)+.003))
                faces.append((offset,offset+2,offset+3,offset+1))
            x += length+random.uniform(.045,.075)
mesh('small scribbled text on both pages', vertices, faces, ink)

bookmark = run_path(str(ROOT / 'scripts/blender/open_book_bookmark.py'))
bookmark['add_bookmark'](scene, book, ribbon_material)
aim(scene, (0,-11,12), (0,-.15,.5), 9.4)
scene['notes'] = 'Open book in the foreground, curved cream pages and tiny graphite scribbles; mug and plate behind. Higher camera for reading the page shapes.'
save(scene, 'open-book')
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
