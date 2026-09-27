"""A small bouquet based on the user's supplied rose geometry and watercolor shader.

Run in connected Blender with __file__ set. Preserves the supplied file and scenes.
"""
from pathlib import Path
from math import radians, sin
import bpy
from mathutils import Matrix, Vector, Euler

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/bouquet'
OUT.mkdir(parents=True,exist_ok=True)
source=bpy.data.scenes.get('Reference | supplied watercolor rose')
if source is None:
    with bpy.data.libraries.load(str(ROOT/'public/blender/watercolor_rose.blend'),link=False) as (_,library):
        library.scenes=['Scene']
    source=library.scenes[0]
    source.name='Reference | supplied watercolor rose'
bpy.context.window.scene=source
bpy.context.view_layer.update()
originals={o.name.split('.')[0]:o for o in source.objects if o.type=='MESH' and o.name.split('.')[0] in {'Petals','Stem'}}
foliage=[o for o in source.objects if o.type=='MESH' and o.name.startswith('Leaf')]
sepals=[o for o in source.objects if o.type=='MESH' and o.name.startswith('Big_leaf')]
worlds={o:o.matrix_world.copy() for o in source.objects if o.type=='MESH'}
scene=bpy.data.scenes.new('Migrene | Watercolor Bouquet')
bpy.context.window.scene=scene
scene.render.engine=source.render.engine
scene.view_settings.view_transform=source.view_settings.view_transform
scene.view_settings.look=source.view_settings.look
scene.world=source.world
scene.eevee.taa_render_samples=64
root=bpy.data.objects.new('Bouquet | gathered roses',None)
scene.collection.objects.link(root)

def color(h):
    rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)

def painted_washes(mat,paper,strength=1):
    """Uneven dilution, pooled borders and granulation without blurring folds."""
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    coord=next(n for n in nodes if n.type=='TEX_COORD')
    emission=next(n for n in nodes if n.type=='EMISSION')
    original=emission.inputs[0].links[0].from_socket
    bloom=nodes.new('ShaderNodeTexNoise');bloom.name='Bouquet | wet watercolor blooms'
    bloom.noise_dimensions='3D';bloom.noise_type='FBM';bloom.normalize=True
    bloom.inputs['Scale'].default_value=2.8;bloom.inputs['Detail'].default_value=1.5
    bloom.inputs['Roughness'].default_value=.55
    links.new(coord.outputs['Generated'],bloom.inputs['Vector'])
    ramp=nodes.new('ShaderNodeValToRGB');ramp.name='Bouquet | layered pigment and exposed paper'
    stops=[(.22,.01),(.34,.025),(.40,.035),(.45,.13),(.53,.19),(.57,.10),(.67,.24),(.80,.30)]
    ramp.color_ramp.elements[0].position=stops[0][0];ramp.color_ramp.elements[1].position=stops[-1][0]
    for position,_ in stops[1:-1]:ramp.color_ramp.elements.new(position)
    for element,(_,value) in zip(ramp.color_ramp.elements,stops):element.color=(value*strength,)*3+(1,)
    links.new(bloom.outputs[0],ramp.inputs[0])
    wash=nodes.new('ShaderNodeMixRGB');wash.name='Bouquet | diluted paint on paper';wash.blend_type='MIX'
    links.new(ramp.outputs[0],wash.inputs[0]);links.new(original,wash.inputs[1]);wash.inputs[2].default_value=color(paper)
    grain=nodes.new('ShaderNodeTexNoise');grain.name='Bouquet | pigment granulation'
    grain.noise_dimensions='3D';grain.noise_type='FBM';grain.normalize=True
    grain.inputs['Scale'].default_value=145;grain.inputs['Detail'].default_value=2
    links.new(coord.outputs['Generated'],grain.inputs[0])
    tooth=nodes.new('ShaderNodeValToRGB');tooth.name='Bouquet | paper tooth contrast'
    tooth.color_ramp.elements[0].color=(.58,.58,.58,1);tooth.color_ramp.elements[1].color=(1,1,1,1)
    links.new(grain.outputs[0],tooth.inputs[0])
    pigment=nodes.new('ShaderNodeMixRGB');pigment.name='Bouquet | granular wash finish';pigment.blend_type='MULTIPLY'
    pigment.inputs[0].default_value=.18*strength
    links.new(wash.outputs[0],pigment.inputs[1]);links.new(tooth.outputs[0],pigment.inputs[2])
    links.new(pigment.outputs[0],emission.inputs[0])
    for index,node in enumerate([bloom,ramp,wash,grain,tooth,pigment]):node.location=(1200+(index%3)*230,-700-(index//3)*300)

def petal_material(name,palette):
    mat=originals['Petals'].data.materials[0].copy();mat.name='Bouquet | '+name
    for node in mat.node_tree.nodes:
        if node.type=='VALUE':
            # The source uses this value for painterly normal distortion.
            # Retain the wet edges while keeping the petal folds more legible.
            node.outputs[0].default_value=.48
        if node.type!='VALTORGB':continue
        stops=node.color_ramp.elements
        if len(stops)==3 and .35<stops[1].position<.45:
            for stop,tint in zip(stops,palette):stop.color=color(tint)
        elif len(stops)==2 and stops[0].position>.6:
            stops[0].color=color(palette[1])
    painted_washes(mat,palette[2])
    return mat

petals=[petal_material(name,palette) for name,palette in [
    ('dusty rose',['a84771','e2aca6','fff6ef']),
    ('warm blush',['ad695c','f0c7a9','fffbef']),
    ('muted mauve',['945677','d4afc0','fcf6f2']),
    ('soft coral',['b66a6a','efbdb2','fff7ef']),
    ('cream rose',['a67e65','eed5b6','fffcf2']),
    ('antique pink',['a55d7a','e1b7c7','fff6f3']),
]]
green=originals['Stem'].data.materials[0].copy();green.name='Bouquet | sage foliage'
for node in green.node_tree.nodes:
    if node.type=='VALTORGB':
        stops=node.color_ramp.elements
        if len(stops)==3 and .2<stops[1].position<.3:
            for stop,tint in zip(stops,['45645c','8d9d6d','f4f2d9']):stop.color=color(tint)
        elif len(stops)==2 and .70<stops[1].position<.80:
            stops[0].color=color('b6c6a7');stops[1].color=color('e6dfbe')
painted_washes(green,'eff1d9',.35)

def flower(index,scale,angles,offset,bud=False,palette=None):
    rotation=Euler(tuple(radians(a) for a in angles)).to_matrix().to_4x4()
    transform=Matrix.Translation(Vector(offset))@rotation@Matrix.Diagonal((*scale,1))
    selected=[originals['Stem'],originals['Petals']]+(foliage[:1] if bud else [foliage[1],foliage[-1]])+sepals[index%len(sepals):index%len(sepals)+1]
    for original in selected:
        obj=original.copy();obj.data=original.data.copy();obj.animation_data_clear()
        obj.name=f'Bouquet | {index+1} '+('bud ' if bud else 'rose ')+original.name
        scene.collection.objects.link(obj)
        obj.parent=root;obj.matrix_parent_inverse=Matrix.Identity(4)
        obj.matrix_world=transform@worlds[original]
        obj.data.materials.clear();obj.data.materials.append(petals[index%3 if palette is None else palette] if original==originals['Petals'] else green)
        if original==originals['Petals']:
            # Gentle asymmetry to distinguish the flower openings, keeping the
            # source's spiral petals and subdivision modifiers intact.
            for vertex in obj.data.vertices:
                x,y,z=vertex.co
                vertex.co.x=x*(1+.035*sin(z*.8+index))
                vertex.co.y=y*(1+.028*sin(x*.7+index*1.7))
        obj['source']='public/blender/watercolor_rose.blend'
        obj['bouquet_role']='small bud' if bud else 'open rose'

flower(0,(.132,.132,.132),(18,-12,-12),(-.03,-.12,.02))
flower(1,(.120,.120,.120),(12,15,18),(.10,-.05,.10))
flower(2,(.124,.124,.133),(3,-3,-24),(-.06,.20,.16))
flower(3,(.066,.066,.104),(12,-31,25),(-.14,-.08,-.16),True)
flower(4,(.061,.061,.098),(-12,32,-18),(.08,.12,.10),True)
flower(5,(.112,.112,.113),(27,2,8),(0,-.06,.05),palette=3)
flower(6,(.115,.115,.124),(-18,-19,-15),(-.06,.14,.09),palette=4)
flower(7,(.119,.119,.126),(-17,18,16),(.09,.09,.02),palette=5)
flower(8,(.107,.107,.110),(22,-25,-20),(-.10,.65,.03),palette=1)
flower(10,(.108,.108,.108),(-34,0,5),(0,.34,-.13),palette=0)

# Validate spacing on the full petal surfaces, including subdivision and
# solidify, with a little extra clearance around each bloom.
from mathutils.bvhtree import BVHTree
bpy.context.view_layer.update()
dg=bpy.context.evaluated_depsgraph_get()
heads=[]
for obj in list(scene.objects):
    if 'Petals' not in obj.name:continue
    evaluated=obj.evaluated_get(dg);mesh=evaluated.to_mesh()
    vertices=[evaluated.matrix_world@v.co for v in mesh.vertices]
    center=sum(vertices,Vector())/len(vertices)
    faces=[tuple(p.vertices) for p in mesh.polygons]
    heads.append((obj.name,BVHTree.FromPolygons(vertices,faces),
                  BVHTree.FromPolygons([center+(v-center)*1.045 for v in vertices],faces)))
    evaluated.to_mesh_clear()
for i,a in enumerate(heads):
    for b in heads[i+1:]:
        if a[1].overlap(b[1]) or a[2].overlap(b[2]):
            raise RuntimeError(f'Petal clearance failed: {a[0]} / {b[0]}')
scene['petal_clearance_check']='No intersections between petal meshes enlarged by 4.5%'
print('PETAL_CLEARANCE_PASSED',len(heads),'blooms')

# Preserve the rose reference's lighting ratios while scaling its large model.
for original in source.objects:
    if original.type!='LIGHT':continue
    light=original.copy();light.data=original.data.copy();light.name='Bouquet | '+original.name
    scene.collection.objects.link(light)
    light.location=original.location*.132
    light.data.energy*=.132**2
    light.data.size*=.132

camera_data=bpy.data.cameras.new('Bouquet | portrait camera')
camera_data.type='ORTHO';camera_data.ortho_scale=5.5
camera=bpy.data.objects.new('Bouquet | portrait camera',camera_data)
scene.collection.objects.link(camera);scene.camera=camera
camera.location=(0,-9,8.2)
camera.rotation_euler=(Vector((0,0,2.0))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.render.filepath=str(OUT/'bouquet-preview.png')
scene['notes']='Eight open roses and two buds; separated petal volumes, layered pigment blooms and granulation. No migraine effect applied.'
bpy.data.libraries.write(str(OUT/'watercolor-bouquet.blend'),{scene},fake_user=True)
bpy.ops.render.render(write_still=True)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
print('BOUQUET_READY',len([o for o in scene.objects if o.type=='MESH']))
