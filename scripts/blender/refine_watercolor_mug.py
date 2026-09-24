"""Add translucent, stepped pigment blooms to the rose-derived mug shader."""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
scene = bpy.data.scenes['Migrene | Watercolor Mug']
bpy.context.window.scene = scene
m = bpy.data.materials['Mug | ivory paper and blue-gray pigment']
ns, ls = m.node_tree.nodes, m.node_tree.links


def color(h):
    v = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(x/12.92 if x < .04045 else ((x+.055)/1.055)**2.4 for x in v) + (1,)


wet = next(n for n in ns if n.type == 'VALTORGB' and len(n.color_ramp.elements) >= 6)
light = next(n for n in ns if n.bl_idname == 'ShaderNodeShaderToRGB')
coords = next(n for n in ns if n.bl_idname == 'ShaderNodeTexCoord')
noise = ns.get('Mug | pigment blooms') or ns.new('ShaderNodeTexNoise')
noise.name = 'Mug | pigment blooms'
noise.label = 'Small pools of pigment in the paper'
noise.noise_dimensions = '3D'
noise.noise_type = 'FBM'
noise.normalize = True
noise.inputs['Scale'].default_value = 6.5
noise.inputs['Detail'].default_value = 3
noise.inputs['Roughness'].default_value = .65
noise.inputs['Distortion'].default_value = .3
noise.location = (-500, -900)
ls.new(coords.outputs['Generated'], noise.inputs['Vector'])
scale = ns.get('Mug | bloom depth') or ns.new('ShaderNodeMath')
scale.name = 'Mug | bloom depth'
scale.operation = 'MULTIPLY_ADD'
scale.inputs[1].default_value = .32
scale.inputs[2].default_value = -.13
scale.location = (-250, -900)
ls.new(noise.outputs[0], scale.inputs[0])
add = ns.get('Mug | light through pigment') or ns.new('ShaderNodeMath')
add.name = 'Mug | light through pigment'
add.operation = 'ADD'
add.location = (0, -900)
ls.new(scale.outputs[0], add.inputs[0])
ls.new(light.outputs['Color'], add.inputs[1])
ls.new(add.outputs[0], wet.inputs[0])
ramp = wet.color_ramp
while len(ramp.elements) > 2:
    ramp.elements.remove(ramp.elements[-1])
stops = [(0, .07), (.025, .18), (.037, .32), (.055, .32),
         (.068, .48), (.085, .48), (.098, .65), (.12, .65),
         (.133, .82), (.16, .82), (.173, 1), (.23, 1)]
ramp.elements[0].position = stops[0][0]
ramp.elements[1].position = stops[-1][0]
for p, _ in stops[1:-1]:
    ramp.elements.new(p)
for element, (_, value) in zip(ramp.elements, stops):
    element.color = (value, value, value, 1)
wet.label = 'Layered washes with narrow wet pigment boundaries'
for node in ns:
    if node.type == 'BSDF_PRINCIPLED':
        node.inputs['Roughness'].default_value = 1
        node.inputs['Specular IOR Level'].default_value = 0
    if node.type != 'VALTORGB':
        continue
    stops = node.color_ramp.elements
    if len(stops) == 3 and .35 < stops[1].position < .45:
        stops[0].color = color('6b8b9e')
        stops[1].color = color('b9cbd2')
        stops[2].color = color('fffcf7')
    elif len(stops) == 2 and stops[0].position > .6:
        stops[0].color = color('f5f4ee')
bpy.data.objects['Mug | broad window light'].data.energy = 180
bpy.data.objects['Mug | reflected sky'].data.energy = 15

grain = ns.get('Mug | paper tooth') or ns.new('ShaderNodeTexNoise')
grain.name = 'Mug | paper tooth'
grain.noise_dimensions = '3D'
grain.noise_type = 'FBM'
grain.normalize = True
grain.inputs['Scale'].default_value = 340
grain.inputs['Detail'].default_value = 2
grain.inputs['Roughness'].default_value = .72
grain.location = (-500, -1150)
ls.new(coords.outputs['Window'], grain.inputs['Vector'])
strength = ns.get('Mug | granulation') or ns.new('ShaderNodeMath')
strength.name = 'Mug | granulation'
strength.operation = 'MULTIPLY_ADD'
strength.inputs[1].default_value = .6
strength.inputs[2].default_value = .7
strength.location = (-250, -1150)
ls.new(grain.outputs[0], strength.inputs[0])
emission = next(n for n in ns if n.type == 'EMISSION')
mix = ns.get('Mug | pigment on paper fibers')
if mix is None:
    source = emission.inputs['Color'].links[0].from_socket
    mix = ns.new('ShaderNodeMixRGB')
    mix.name = 'Mug | pigment on paper fibers'
    ls.new(source, mix.inputs[1])
mix.blend_type = 'MULTIPLY'
mix.inputs[0].default_value = 1
mix.location = (300, -1150)
ls.new(strength.outputs[0], mix.inputs[2])
ls.new(mix.outputs[0], emission.inputs['Color'])
from mathutils import Vector
scene.camera.location.z = 3.8
scene.camera.rotation_euler = (Vector((.38, 0, 1.12)) - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.film_transparent = False
scene.render.filepath = str(ROOT / 'public/models/mug/watercolor-mug-preview.png')
bpy.ops.render.render(write_still=True)

# A transparent painted still for future compositing; not a replacement for 3D.
scene.render.film_transparent = True
scene.render.filepath = str(ROOT / 'public/models/mug/watercolor-mug-transparent.png')
bpy.ops.render.render(write_still=True)
scene.render.film_transparent = False
scene.render.filepath = str(ROOT / 'public/models/mug/watercolor-mug-preview.png')

# Save only this scene and its dependencies, leaving the original brain untouched.
bpy.data.libraries.write(str(ROOT / 'assets/mug/watercolor-mug.blend'), {scene}, fake_user=True)
print('WATERCOLOR_MUG_SAVED')
