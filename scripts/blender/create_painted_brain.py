"""Build the editable painted brain in the connected Blender instance.

Base mesh: drummyfish, Brain and Skull (CC0), see assets/brain/SOURCES.md.
Run through Blender MCP with exec(compile(open(__file__).read(), __file__, 'exec')).
"""
from pathlib import Path
import math
import bpy
import numpy as np
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'assets/brain'
WEB = ROOT / 'public/models/brain'
OUTPUT.mkdir(parents=True, exist_ok=True)
WEB.mkdir(parents=True, exist_ok=True)


def enum(obj, prop, value):
    values = [i.identifier for i in obj.bl_rna.properties[prop].enum_items]
    if value not in values:
        raise ValueError(f'{prop}: {value} not in {values}')
    setattr(obj, prop, value)


def linear(c):
    return c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4


def rgb(hexcode):
    return tuple(linear(int(hexcode[i:i+2], 16) / 255) for i in (0, 2, 4))


scene = bpy.data.scenes.get('Migrene | Painted Brain')
if scene is None:
    scene = bpy.data.scenes.new('Migrene | Painted Brain')
bpy.context.window.scene = scene
# Rebuild only this script's scene, preserving other scenes and their objects.
for obj in list(scene.objects):
    scene.collection.objects.unlink(obj)

with bpy.data.libraries.load(str(OUTPUT / 'source/head.blend'), link=False) as (src, dst):
    dst.objects = ['brain']
brain = dst.objects[0]
brain.name = 'Brain | painted cortex'
scene.collection.objects.link(brain)
bpy.context.view_layer.objects.active = brain
brain.select_set(True)

# Keep the source topology editable. Two subdivisions are only ~109k triangles.
for mod in list(brain.modifiers):
    if mod.type != 'SUBSURF':
        brain.modifiers.remove(mod)
    else:
        mod.levels = mod.render_levels = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)

coords = np.array([v.co[:] for v in brain.data.vertices], dtype=np.float64)
center = (coords.min(axis=0) + coords.max(axis=0)) * .5
coords = (coords - center) * (3.5 / np.ptp(coords, axis=0).max())
for v, co in zip(brain.data.vertices, coords):
    v.co = co
for poly in brain.data.polygons:
    poly.use_smooth = True
if 'sharp_edge' in brain.data.attributes:
    brain.data.attributes.remove(brain.data.attributes['sharp_edge'])
brain.data.update()

# Curvature is pigment accumulation, not baked directional lighting.
normals = np.array([v.normal[:] for v in brain.data.vertices])
neighbors = np.zeros_like(coords)
counts = np.zeros(len(coords))
for edge in brain.data.edges:
    a, b = edge.vertices
    neighbors[a] += coords[b]
    neighbors[b] += coords[a]
    counts[a] += 1
    counts[b] += 1
curvature = np.sum((neighbors / np.maximum(counts[:, None], 1) - coords) * normals, axis=1)
valley = np.clip(curvature / .006, 0, 1)
paint = brain.data.color_attributes.new(name='Watercolor', type='FLOAT_COLOR', domain='POINT')
brain.data.color_attributes.active_color = paint
cream = np.array(rgb('f3e2cb'))
rose = np.array(rgb('d79792'))
blue = np.array(rgb('8395ae'))
lavender = np.array(rgb('a495b3'))
ochre = np.array(rgb('dfb27f'))
colors = np.ones((len(coords), 4), dtype=np.float32)
for i, co in enumerate(coords):
    p = Vector(co)
    broad = noise.noise_vector(p * 1.9 + Vector((3, 7, 1)))
    middle = noise.noise(p * 8.0 + Vector((7, 2, 4)))
    fine = noise.noise(p * 95.0)
    # Layered pigment pools with gently stepped edges, not rainbow noise.
    wash = np.clip((broad.x + .27) * 1.2, 0, .9)
    wash = (wash * .45 + round(wash * 5) / 5 * .55)
    color = cream * (1 - wash) + rose * wash
    cool = np.clip((broad.y - .03) * 1.1 + max(0, .25 - co[2]) * .11, 0, .7)
    color = color * (1 - cool) + lavender * cool
    pool = np.clip(valley[i] * .66 + max(0, broad.z - .25) * .55, 0, .85)
    color = color * (1 - pool) + blue * pool
    warm = max(0, broad.z * -.5 - .04) * .38
    color = color * (1 - warm) + ochre * warm
    color *= 1 + middle * .09 + fine * .027
    colors[i, :3] = np.clip(color, 0, 1)
paint.data.foreach_set('color', colors.ravel())

mat = bpy.data.materials.new('Brain | watercolor studio')
mat.use_nodes = True
n = mat.node_tree.nodes
n.clear()
l = mat.node_tree.links


def node(kind, name, x, y):
    nd = n.new(kind)
    nd.label = name
    nd.location = (x, y)
    return nd


attr = node('ShaderNodeVertexColor', 'Painted pigment / exported to GLB', -850, 240)
attr.layer_name = 'Watercolor'
diffuse = node('ShaderNodeBsdfDiffuse', 'Light-responsive wash', -850, -60)
diffuse.inputs['Color'].default_value = (1, 1, 1, 1)
diffuse.inputs['Roughness'].default_value = 1
to_rgb = node('ShaderNodeShaderToRGB', 'Eevee lighting', -650, -60)
l.new(diffuse.outputs[0], to_rgb.inputs[0])
grain = node('ShaderNodeTexNoise', 'Broken pigment boundaries', -850, -300)
grain.inputs['Scale'].default_value = 29
grain.inputs['Detail'].default_value = 2
mix_noise = node('ShaderNodeMixRGB', 'Soft irregular wash transitions', -420, -70)
mix_noise.inputs[0].default_value = .12
l.new(to_rgb.outputs[0], mix_noise.inputs[1])
l.new(grain.outputs['Fac'], mix_noise.inputs[2])
ramp = node('ShaderNodeValToRGB', 'Blue shadow / cream light', -200, -70)
enum(ramp.color_ramp, 'interpolation', 'CONSTANT')
ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
for j, (pos, col) in enumerate([
    (.12, '687d9a'), (.34, 'a7a9ba'), (.48, 'd5c4c4'), (.62, 'f2dfc5'), (.85, 'fff7e9')
]):
    el = ramp.color_ramp.elements[0] if j == 0 else ramp.color_ramp.elements.new(pos)
    el.position = pos
    el.color = (*rgb(col), 1)
l.new(mix_noise.outputs[0], ramp.inputs[0])
multiply = node('ShaderNodeMixRGB', 'Pigment × painted light', 100, 180)
enum(multiply, 'blend_type', 'MULTIPLY')
multiply.inputs[0].default_value = .72
l.new(attr.outputs['Color'], multiply.inputs[1])
l.new(ramp.outputs['Color'], multiply.inputs[2])
paper_coords = node('ShaderNodeTexCoord', 'Paper coordinates', -600, 530)
paper_tex = node('ShaderNodeTexImage', 'Paper fibers — supplied reference texture', -350, 530)
paper_tex.image = bpy.data.images.load(str(ROOT / 'public/blender/Texturelabs_Paper_304L_square.jpg'), check_existing=True)
paper_tex.image.pack()
enum(paper_tex, 'projection', 'BOX')
paper_tex.projection_blend = .25
l.new(paper_coords.outputs['Generated'], paper_tex.inputs['Vector'])
paper_mix = node('ShaderNodeMixRGB', 'Subtle paper tooth', 320, 270)
enum(paper_mix, 'blend_type', 'MULTIPLY')
paper_mix.inputs[0].default_value = .13
l.new(multiply.outputs[0], paper_mix.inputs[1])
l.new(paper_tex.outputs['Color'], paper_mix.inputs[2])
emission = node('ShaderNodeEmission', 'Matte painted finish', 550, 180)
l.new(paper_mix.outputs[0], emission.inputs['Color'])
out = node('ShaderNodeOutputMaterial', 'Watercolor surface', 750, 180)
l.new(emission.outputs[0], out.inputs['Surface'])
brain.data.materials.clear()
brain.data.materials.append(mat)

# Interoperable material for the export; the richer Eevee nodes stay in .blend.
webmat = bpy.data.materials.new('Brain | portable pigment')
webmat.use_nodes = True
wn = webmat.node_tree.nodes
principled = next(nd for nd in wn if nd.type == 'BSDF_PRINCIPLED')
principled.inputs['Roughness'].default_value = 1
principled.inputs['Specular IOR Level'].default_value = 0
vc = wn.new('ShaderNodeVertexColor')
vc.layer_name = 'Watercolor'
webmat.node_tree.links.new(vc.outputs['Color'], principled.inputs['Base Color'])
webmat.use_fake_user = True

world = bpy.data.worlds.new('Brain | warm paper world')
world.use_nodes = True
bg = next(nd for nd in world.node_tree.nodes if nd.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (*rgb('f8f5ef'), 1)
bg.inputs['Strength'].default_value = .45
scene.world = world


def aim(obj, point=(0, 0, .15)):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()


for name, loc, power, size in [
    ('Key | broad daylight', (-3, -4, 6), 480, 5),
    ('Fill | soft sky', (4, 1, 3), 160, 4),
]:
    data = bpy.data.lights.new(name, type='AREA')
    data.energy = power
    data.shape = 'DISK' if 'DISK' in [i.identifier for i in data.bl_rna.properties['shape'].enum_items] else data.shape
    data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = loc
    aim(obj)

cam_data = bpy.data.cameras.new('Brain | study camera')
enum(cam_data, 'type', 'ORTHO')
cam_data.ortho_scale = 5.4
cam = bpy.data.objects.new('Brain | study camera', cam_data)
scene.collection.objects.link(cam)
cam.location = (5, -7, 4.7)
aim(cam, (0, 0, .12))
scene.camera = cam
scene.render.resolution_x = 1200
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
enum(scene.render.image_settings, 'file_format', 'PNG')
try:
    scene.view_settings.view_transform = 'Standard'
except TypeError as err:
    print(err)
scene.render.filepath = str(WEB / 'brain-preview.png')

brain['source'] = 'drummyfish — Brain and Skull — CC0 — https://opengameart.org/content/brain-and-skull'
brain['style'] = 'Cream / dusty rose / blue-gray watercolor, curvature pigment pooling'
brain['web_material'] = webmat.name
brain['purpose'] = 'Artistic illustration, not a medical reference'
scene['notes'] = 'Brain only. Floating watercolor planes and the portal scene are a later stage.'
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
        enum(area.spaces.active.shading, 'type', 'MATERIAL')
        area.spaces.active.shading.use_scene_world = True
        area.spaces.active.shading.use_scene_lights = True

# Export only the brain, never the studio camera/lights or another scene.
for obj in scene.objects:
    obj.select_set(False)
brain.select_set(True)
bpy.context.view_layer.objects.active = brain
brain.data.materials[0] = webmat
import io_scene_gltf2
# This operator uses a dynamic enum, so RNA's static list is empty in Blender 5.
export_format = next(i[0] for i in io_scene_gltf2.get_format_items(scene, bpy.context) if i[0] == 'GLB')
bpy.ops.export_scene.gltf(filepath=str(WEB / 'painted-brain.glb'), export_format=export_format, use_selection=True, export_yup=True)
brain.data.materials[0] = mat
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'painted-brain.blend'))
print('BRAIN_READY', len(brain.data.vertices), 'vertices', len(brain.data.polygons) * 2, 'triangles')
print('GLB', WEB / 'painted-brain.glb')
print('BLEND', OUTPUT / 'painted-brain.blend')
