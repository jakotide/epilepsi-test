"""Add a softly piped cupcake to a private copy of the wide watercolor scene."""
from pathlib import Path
from math import sin, cos, pi
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets/still-life'
with bpy.data.libraries.load(str(BASE / 'watercolor-still-life.blend'), link=False) as (available, library):
    library.scenes = [next(name for name in available.scenes if name.startswith('Migrene | Watercolor Still Life'))]
source = library.scenes[0]
scene = bpy.data.scenes.new('Migrene | Watercolor Still Life | cupcake')
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
bpy.context.window.scene = scene
root = next(obj for obj in scene.objects if obj.name.startswith('Still life | turntable'))
root.rotation_euler.z = 0
plate = next(obj for obj in scene.objects if obj.name.startswith('Still life | hand-thrown plate'))
cupcake = bpy.data.objects.new('Still life | cupcake on plate', None)
scene.collection.objects.link(cupcake)
cupcake.parent = root
cupcake.location = (plate.location.x, plate.location.y, .122)
source_material = plate.data.materials[0]


def color(hexcode):
    rgb = [int(hexcode[i:i+2], 16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)


def watercolor(name, palette):
    material = source_material.copy()
    material.name = 'Still life | '+name
    for node in material.node_tree.nodes:
        if node.type != 'VALTORGB':
            continue
        stops = node.color_ramp.elements
        if len(stops)==3 and .35<stops[1].position<.45:
            for stop, tint in zip(stops, palette):
                stop.color = color(tint)
        elif len(stops)==2 and stops[0].position>.6:
            stops[0].color = color(palette[2])
    return material


wrapper = watercolor('ochre pleated cupcake paper', ['ad8b62','dfcba7','fbefda'])
cake = watercolor('golden vanilla sponge', ['a77850','d5b284','f3dfb5'])
icing = watercolor('blush vanilla buttercream', ['b58791','e6c8cc','fff1e9'])


def mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new('Still life | '+name)
    data.from_pydata(vertices, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    data.materials.append(material)
    for face in data.polygons:
        face.use_smooth = True
    obj = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(obj)
    obj.parent = cupcake
    return obj


def lathe(name, profile, material, pleats=0):
    segments = 192
    vertices, faces = [], []
    for radius, z in profile:
        for index in range(segments):
            angle = index/segments*2*pi
            r = radius + (pleats*cos(angle*32) if radius>.1 else 0)
            vertices.append((r*cos(angle), r*sin(angle), z))
    for row in range(len(profile)-1):
        for index in range(segments):
            a = row*segments+index
            b = row*segments+(index+1)%segments
            faces.append((a,b,b+segments,a+segments))
    return mesh(name, vertices, faces, material)


lathe('fluted cupcake wrapper', [(0,0),(.44,0),(.46,.025),(.50,.16),(.55,.36),(.61,.61),(.62,.65),(.59,.66),(0,.66)], wrapper, .018)
lathe('softly domed sponge', [(0,.60),(.58,.60),(.60,.66),(.63,.70),(.59,.76),(.48,.81),(.27,.84),(0,.85)], cake)
# The frosting skirt covers the sponge all the way to the pleated paper rim.
# Its softly rounded lip overlaps the wrapper just enough to avoid a brown seam.
lathe('buttercream center', [(0,.635),(.605,.635),(.642,.64),(.662,.665),(.661,.71),
    (.645,.77),(.60,.84),(.49,.93),(.38,1.02),(.26,1.20),(.12,1.36),(0,1.43)], icing)


def piping_center(t):
    angle = pi/2 + t*2*pi*2.8
    radius = .465*(1-t)**.82
    return Vector((radius*cos(angle), radius*sin(angle), .82+.66*t))


# One tapered strand makes the rounded spiral and its small pointed finish.
vertices, faces = [], []
steps, sides = 360, 20
for index in range(steps+1):
    t = index/steps
    center = piping_center(t)
    tangent = (piping_center(min(1,t+.001))-piping_center(max(0,t-.001))).normalized()
    radial = tangent.cross(Vector((0,0,1))).normalized()
    normal = tangent.cross(radial).normalized()
    radius = .175*(1-t)**.65+.006
    for side in range(sides):
        angle = side/sides*2*pi
        scallop = 1+.06*cos(angle*5)
        point = center + (radial*cos(angle)+normal*sin(angle))*radius*scallop
        vertices.append(tuple(point))
for index in range(steps):
    for side in range(sides):
        a = index*sides+side
        b = index*sides+(side+1)%sides
        faces.append((a,b,b+sides,a+sides))
faces.append(tuple(reversed(range(sides))))
faces.append(tuple(steps*sides+side for side in range(sides)))
mesh('continuous buttercream swirl', vertices, faces, icing)

scene['still_life_variant'] = 'cupcake'
scene['notes'] = 'Wide still life with a cupcake on the celadon plate: blush icing covers the sponge down to the visible pleated ochre paper, using the original watercolor nodes.'
destination = BASE / 'cupcake'
destination.mkdir(parents=True, exist_ok=True)
bpy.data.libraries.write(str(destination / 'watercolor-still-life.blend'), {scene}, fake_user=True)
print('CUPCAKE_READY', len(scene.objects))
