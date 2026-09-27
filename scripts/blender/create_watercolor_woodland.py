"""Airy branching woodland, using the mug's original Eevee watercolor shader.

Creates a separate editable scene and three transparent paintings; preserves the
earlier grove and all supplied reference files. Execute in connected Blender.
"""
from pathlib import Path
from math import sin, cos, pi
import random
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/grove/woodland'
OUT.mkdir(parents=True, exist_ok=True)
studio = bpy.data.scenes['Migrene | Watercolor Mug']
scene = bpy.data.scenes.new('Migrene | Painted Woodland')
bpy.context.window.scene = scene
scene.render.engine = studio.render.engine
scene.view_settings.view_transform = studio.view_settings.view_transform
scene.world = studio.world
base = bpy.data.materials['Mug | ivory paper and blue-gray pigment']

def color(h):
    values = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(v/12.92 if v < .04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)

def pigment(name, palette, bark=False, pools=None):
    mat = base.copy()
    mat.name = 'Woodland | '+name
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    for n in nodes:
        if n.type == 'VALTORGB':
            stops = n.color_ramp.elements
            if len(stops) == 3 and .35 < stops[1].position < .45:
                for e, h in zip(stops, palette): e.color = color(h)
        if n.name == 'Mug | pigment blooms':
            n.inputs['Scale'].default_value = 14 if bark else 7
        if n.name == 'Mug | bloom depth':
            n.inputs[1].default_value = .45
            n.inputs[2].default_value = -.19
        if n.name == 'Mug | granulation':
            n.inputs[1].default_value = .48
            n.inputs[2].default_value = .76
    if bark:
        coord = next(n for n in nodes if n.type == 'TEX_COORD')
        flecks = nodes.new('ShaderNodeTexNoise')
        flecks.name = 'Woodland | uneven pigment pools'
        flecks.noise_dimensions = '3D'
        flecks.noise_type = 'FBM'
        flecks.normalize = True
        flecks.inputs['Scale'].default_value = 1.65
        flecks.inputs['Detail'].default_value = 4
        flecks.inputs['Roughness'].default_value = .74
        links.new(coord.outputs['Object'], flecks.inputs['Vector'])
        ramp = nodes.new('ShaderNodeValToRGB')
        ramp.name = 'Woodland | blue ochre and moss in bark'
        # Individual tree palettes with narrow dark wet edges between washes.
        dark, primary, secondary, accent = pools
        stops = [(.20,dark),(.35,primary),(.425,primary),(.443,dark),
                 (.475,'fff7e4'),(.495,'fff7e4'),(.52,secondary),
                 (.58,accent),(.60,secondary),(.68,'fff9e9')]
        ramp.color_ramp.elements[0].position = stops[0][0]
        ramp.color_ramp.elements[1].position = stops[-1][0]
        for position, _ in stops[1:-1]: ramp.color_ramp.elements.new(position)
        for e, (_, h) in zip(ramp.color_ramp.elements, stops): e.color = color(h)
        links.new(flecks.outputs[0], ramp.inputs[0])
        grain = next(n for n in nodes if n.name == 'Mug | pigment on paper fibers')
        source = grain.inputs[1].links[0].from_socket
        mix = nodes.new('ShaderNodeMixRGB')
        mix.name = 'Woodland | pigment beneath paper fibers'
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = .96
        links.new(source, mix.inputs[1]); links.new(ramp.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], grain.inputs[1])
        flecks.location=(-500,-1500);ramp.location=(-270,-1500);mix.location=(50,-1300)
    return mat

barks = [
    pigment('ink blue and warm birch', ['203647','d5d7ca','fffaf0'], True,
            ['172e42','314f6b','c3aa71','608775']),
    pigment('cobalt and turquoise birch', ['326c97','c0e0ed','f7fdff'], True,
            ['204e86','3285b9','78bcc6','3c998c']),
    pigment('sunlit gold and moss birch', ['697638','e9db9b','fffceb'], True,
            ['37625d','c7aa30','e4c95a','499b7f']),
]
leaves = [
    pigment('new yellow green', ['517b24','a5bd3c','e9ee85']),
    pigment('deep sage leaf', ['285953','599b78','a8cc91']),
    pigment('blue leaf wash', ['285c87','489ea6','acd9cf']),
    pigment('warm ochre leaf', ['9e8e23','d6c438','fff08a']),
    pigment('rose blossom wash', ['a83d70','dc729d','f6b4c6']),
]

def object_mesh(name, verts, faces, materials, indices=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces); mesh.update()
    for mat in materials: mesh.materials.append(mat)
    for i, poly in enumerate(mesh.polygons):
        poly.use_smooth = True
        if indices: poly.material_index = indices[i]
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return obj

import runpy
build_tree = runpy.run_path(str(ROOT / "scripts/blender/woodland_geometry.py"))["tree"]

def tree(seed, kind):
    return build_tree(seed, kind, object_mesh, barks, leaves)

trees=[tree(87,0),tree(141,1),tree(296,2)]
for original in studio.objects:
    if original.type not in {'LIGHT','CAMERA'}:continue
    obj=original.copy();obj.data=original.data.copy();obj.name='Woodland | '+original.name.split(' | ')[-1]
    scene.collection.objects.link(obj)
    if obj.type=='CAMERA':scene.camera=obj
    elif 'window' in obj.name:
        obj.location=(-3,-5,8);obj.data.energy=225;obj.data.size=5
    else:obj.location=(4,-2,5);obj.data.energy=12;obj.data.size=5
    if obj.type=='LIGHT':obj.rotation_euler=(Vector((0,0,3))-obj.location).to_track_quat('-Z','Y').to_euler()
camera=scene.camera
camera.location=(0,-12,3.4)
camera.rotation_euler=(Vector((0,0,2.85))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=7.7
render=scene.render
render.resolution_x=900;render.resolution_y=1350;render.resolution_percentage=100
render.image_settings.file_format=studio.render.image_settings.file_format
render.image_settings.color_mode=studio.render.image_settings.color_mode
render.film_transparent=True
for index,name in enumerate(['birch-ink','birch-blue','birch-gold']):
    for j,objects in enumerate(trees):
        for obj in objects:obj.hide_render=j!=index
    render.filepath=str(OUT / f'{name}.png')
    bpy.ops.render.render(write_still=True)
# Arrange the editable studio as a small open woodland after exporting layers.
for j,objects in enumerate(trees):
    for obj in objects:
        obj.hide_render=False
        obj.location=((j-1)*1.75, .9 if j==1 else 0,0)
camera.location=(0,-15,3.7)
camera.rotation_euler=(Vector((0,0,2.8))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=8.2
render.resolution_x=1400;render.resolution_y=1100
render.film_transparent=False
render.filepath=str(OUT/'woodland-study.png')
bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(str(OUT/'watercolor-woodland.blend'),{scene},fake_user=True)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
print('WOODLAND_READY', [(o.name,len(o.data.polygons)) for pair in trees for o in pair])
