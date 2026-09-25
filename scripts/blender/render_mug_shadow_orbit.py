"""Re-render the watercolor mug with a real floor shadow for each turn angle.

The separate floor-only baseline lets the packer extract a transparent shadow
without baking a rectangular background into the painting. Source scene intact.
"""
from pathlib import Path
from math import radians
from mathutils import Vector
import bpy

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/mug/lit-orbit';OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.data.scenes.get('Migrene | Mug and cast shadow')
if scene is None:
    source=bpy.data.scenes['Migrene | Watercolor Mug']
    scene=bpy.data.scenes.new('Migrene | Mug and cast shadow')
    scene.render.engine=source.render.engine
    scene.world=source.world
    scene.view_settings.view_transform=source.view_settings.view_transform
    scene.render.image_settings.file_format=source.render.image_settings.file_format
    scene.render.image_settings.color_mode=source.render.image_settings.color_mode
    for original in source.objects:
        obj=original.copy();obj.data=original.data.copy()
        obj.name='Lit mug | '+original.name.split(' | ')[-1]
        scene.collection.objects.link(obj)
        if obj.type=='CAMERA':scene.camera=obj
        if obj.type=='LIGHT' and 'window' in obj.name:obj.data.energy=205;obj.data.size=2.6
    mesh=bpy.data.meshes.new('Lit mug | shadow receiver')
    mesh.from_pydata([(-40,-40,-.015),(40,-40,-.015),(40,40,-.015),(-40,40,-.015)],[],[(0,1,2,3)])
    floor=bpy.data.objects.new('Lit mug | paper floor',mesh);scene.collection.objects.link(floor)
    mat=bpy.data.materials.new('Lit mug | neutral shadow receiver')
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    diffuse=nodes.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Color'].default_value=(1,1,1,1)
    diffuse.inputs['Roughness'].default_value=1
    links.new(diffuse.outputs[0],output.inputs['Surface'])
    mesh.materials.append(mat)
else:
    floor=next(o for o in scene.objects if o.name=='Lit mug | paper floor')
bpy.context.window.scene=scene
objects=[o for o in scene.objects if o.type=='MESH' and o!=floor]
camera=scene.camera;camera.location=(0,-9,3.8)
camera.rotation_euler=(Vector((0,0,1.12))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=5.6
render=scene.render;render.resolution_x=render.resolution_y=768;render.resolution_percentage=100;render.film_transparent=True
try:
    if globals().get('START',0)==0:
        for obj in objects:obj.hide_render=True
        floor.hide_render=False
        render.filepath=str(OUT/'floor-baseline.png');bpy.ops.render.render(write_still=True)
    for obj in objects:obj.hide_render=False
    for index in range(globals().get('START',0),globals().get('END',72)):
        for obj in objects:obj.rotation_euler.z=radians(index*5)
        floor.hide_render=True
        render.filepath=str(OUT/f'object-{index:02d}.png');bpy.ops.render.render(write_still=True)
        floor.hide_render=False
        render.filepath=str(OUT/f'floor-{index:02d}.png');bpy.ops.render.render(write_still=True)
finally:
    for obj in objects:obj.rotation_euler.z=0;obj.hide_render=False
    floor.hide_render=False
bpy.data.libraries.write(str(ROOT/'assets/mug/watercolor-mug-with-shadow.blend'),{scene},fake_user=True)
print('LIT_MUG_READY')
