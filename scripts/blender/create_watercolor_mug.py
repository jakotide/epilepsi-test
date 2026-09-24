"""Build an original hollow mug using the supplied rose's Eevee watercolor.

Run in Blender with __file__ set to this path. Keeps the brain scene intact.
The editable .blend retains the view-dependent shader; GLB exports geometry.
"""
from pathlib import Path
from math import sin, cos, pi
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'assets/mug'
WEB = ROOT / 'public/models/mug'
OUTPUT.mkdir(parents=True, exist_ok=True)
WEB.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('Migrene | Watercolor Mug')
bpy.context.window.scene = scene
scene.render.engine = 'BLENDER_EEVEE'
scene.view_settings.view_transform = 'Standard'
if 'Mug | Rose reference original' not in bpy.data.materials:
    with bpy.data.libraries.load(str(ROOT / 'public/blender/watercolor_rose.blend'), link=False) as (_, library):
        library.materials = ['Watercolor']
        library.worlds = ['World']
    library.materials[0].name = 'Mug | Rose reference original'
    library.worlds[0].name = 'Mug | Rose paper world'
scene.world = bpy.data.worlds['Mug | Rose paper world']
mat = bpy.data.materials['Mug | Rose reference original'].copy()
mat.name = 'Mug | ivory paper and blue-gray pigment'


def color(hexcode):
    vals = [int(hexcode[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in vals) + (1,)


for node in mat.node_tree.nodes:
    if node.type != 'VALTORGB':
        continue
    stops = node.color_ramp.elements
    if len(stops) == 3 and .35 < stops[1].position < .45:
        stops[0].color = color('63839a')
        stops[1].color = color('d9d3c2')
        node.label = 'Blue-gray pigment / warm ivory / exposed paper'
    elif len(stops) == 2 and stops[0].position > .6:
        stops[0].color = color('b3c5cd')
        node.label = 'Diluted pigment gathered at the rim'


def spline(points, subdivisions):
    """Catmull-Rom interpolation for a hand-shaped profile."""
    pts = [Vector(p) for p in points]
    result = []
    for i in range(len(pts)-1):
        a, b, c, d = pts[max(0, i-1)], pts[i], pts[i+1], pts[min(len(pts)-1, i+2)]
        for j in range(subdivisions):
            t = j / subdivisions
            result.append(.5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t))
    return result + [pts[-1]]


def mesh_object(name, vertices, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for face in mesh.polygons:
        face.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    mesh.materials.append(mat)
    return obj


# Continuous outer wall, rounded lip, inner wall, and a solid ceramic bottom.
profile = spline([(0, .035), (.60, .035), (.79, .075), (.89, .19),
                  (.94, .40), (.974, .85), (.993, 1.65), (1, 2.12),
                  (.996, 2.18), (.978, 2.209), (.952, 2.216),
                  (.927, 2.198), (.914, 2.17), (.914, 2.10),
                  (.905, 1.55), (.884, .65), (.849, .35),
                  (.78, .235), (.60, .205), (0, .205)], 7)
segments = 144
vertices, faces = [], []
for radius, z in profile:
    radius = max(0, radius)
    for i in range(segments):
        angle = i / segments * 2*pi
        wobble = 1 + .0028*sin(angle*3 + z*.9) + .0013*sin(angle*7-z)
        vertices.append((radius*wobble*cos(angle), radius*wobble*sin(angle), z))
for j in range(len(profile)-1):
    for i in range(segments):
        ni = (i+1) % segments
        faces.append((j*segments+i, j*segments+ni, (j+1)*segments+ni, (j+1)*segments+i))
body = mesh_object('Mug | hollow ceramic body', vertices, faces)

# A swept handle with an open teardrop shape and slightly thicker attachments.
path = spline([(.93, 0, 1.86), (1.21, 0, 1.96), (1.54, 0, 1.88),
               (1.77, 0, 1.57), (1.80, 0, 1.24), (1.68, 0, .87),
               (1.42, 0, .57), (1.12, 0, .43), (.91, 0, .43)], 16)
vertices, faces = [], []
rings = 28
for j, point in enumerate(path):
    tangent = (path[min(j+1, len(path)-1)] - path[max(0, j-1)]).normalized()
    across = Vector((0, 1, 0))
    outward = tangent.cross(across).normalized()
    t = j / (len(path)-1)
    radius = .12 + .038*(abs(t-.5)*2)**5 + .006*sin(pi*t)
    for i in range(rings):
        angle = i / rings * 2*pi
        vertices.append(tuple(point + radius*(cos(angle)*across + sin(angle)*outward)))
for j in range(len(path)-1):
    for i in range(rings):
        ni = (i+1) % rings
        faces.append((j*rings+i, j*rings+ni, (j+1)*rings+ni, (j+1)*rings+i))
faces.extend([tuple(reversed(range(rings))), tuple((len(path)-1)*rings+i for i in range(rings))])
handle = mesh_object('Mug | gently irregular loop handle', vertices, faces)


def aim(obj, target=(.25, 0, 1.1)):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()


for name, location, power, size in [
    ('Mug | broad window light', (-3, -4, 6), 420, 4),
    ('Mug | reflected sky', (4, -1, 3), 65, 4),
]:
    data = bpy.data.lights.new(name, type='AREA')
    data.energy, data.size = power, size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    aim(obj)

data = bpy.data.cameras.new('Mug | watercolor portrait camera')
data.type = 'ORTHO'
data.ortho_scale = 3.55
camera = bpy.data.objects.new(data.name, data)
scene.collection.objects.link(camera)
camera.location = (.38, -9, 4.35)
aim(camera, (.38, 0, 1.12))
scene.camera = camera
scene.render.resolution_x = 1100
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = False
scene.render.filepath = str(WEB / 'watercolor-mug-preview.png')
scene['notes'] = 'Original hollow mug. Supplied rose watercolor nodes recolored ivory / blue-gray. Paper fixed to the camera; no timed flicker.'
for obj in (body, handle):
    obj['style'] = 'View-dependent Eevee rose watercolor; keep editable shader in Blender.'
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
        area.spaces.active.shading.type = 'RENDERED'
        area.spaces.active.overlay.show_overlays = False

# Pack the supplied paper so the editable study is self-contained.
for group in {n.node_tree for n in mat.node_tree.nodes if n.type == 'GROUP'}:
    for n in group.nodes:
        if n.type == 'TEX_IMAGE' and n.image and not n.image.packed_file:
            n.image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'watercolor-mug.blend'))
print('MUG_READY', len(body.data.vertices), len(handle.data.vertices), scene.render.filepath)
