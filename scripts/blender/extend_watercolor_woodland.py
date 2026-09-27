"""Add two original trees to a copy of the active woodland, preserving the source."""
from pathlib import Path
import runpy
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/grove/woodland'
source=bpy.context.scene
assert source.name.startswith('Migrene | Painted Woodland')
scene=bpy.data.scenes.new('Migrene | Painted Woodland - five originals')
scene.render.engine=source.render.engine
scene.view_settings.view_transform=source.view_settings.view_transform
scene.view_settings.look=source.view_settings.look
scene.world=source.world
scene.eevee.taa_render_samples=source.eevee.taa_render_samples
bpy.context.window.scene=scene
for original in source.objects:
    if original.type=='MESH' and not any(original.name.startswith(f'Woodland | {k} ') for k in range(3)):continue
    obj=original.copy()
    if obj.type in {'CAMERA','LIGHT'}:obj.data=original.data.copy()
    scene.collection.objects.link(obj)
    if original==source.camera:scene.camera=obj

def rgba(h):
    rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)

def recolor(original,name,palette,pools=None):
    material=original.copy();material.name='Woodland | '+name
    for node in material.node_tree.nodes:
        if node.type!='VALTORGB':continue
        stops=node.color_ramp.elements
        if len(stops)==3 and .35<stops[1].position<.45:
            for stop,tint in zip(stops,palette):stop.color=rgba(tint)
        if pools and node.name=='Woodland | blue ochre and moss in bark':
            dark,primary,secondary,accent=pools
            colors=[dark,primary,primary,dark,'fffaf0','fffaf0',secondary,accent,secondary,'fffaf0']
            for stop,tint in zip(stops,colors):stop.color=rgba(tint)
    return material

barks=[next(o for o in scene.objects if o.name.startswith(f'Woodland | {k} expressive trunk')).data.materials[0] for k in range(3)]
leaves=list(next(o for o in scene.objects if o.name.startswith('Woodland | 0 scattered')).data.materials)
barks.extend([
    recolor(barks[1],'silver sage upright birch',['547b7a','cfdfd5','fffef6'],['405f69','729b99','bad0bb','8daac0']),
    recolor(barks[2],'rose ochre forked tree',['775341','ddbf98','fffbef'],['594b5d','b58a4b','d9b975','ae7884']),
])
silver_leaves=[recolor(m,'silver canopy '+str(i),palette) for i,(m,palette) in enumerate(zip(leaves,[
    ['688049','b4c38a','e4e8b8'],['3f7568','8cae95','d8e5c8'],['497d90','9bc4c8','dceddf'],
    ['a39b5e','d3cf98','f6eebd'],['a16b82','d1a2b3','f5d7dc'],
]))]

def object_mesh(name,verts,faces,materials,indices=None):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    for mat in materials:mesh.materials.append(mat)
    for i,face in enumerate(mesh.polygons):
        face.use_smooth=True
        if indices:face.material_index=indices[i]
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
    return obj

tree=runpy.run_path(str(ROOT/'scripts/blender/woodland_geometry.py'))['tree']
tree(483,3,object_mesh,barks,silver_leaves)
tree(729,4,object_mesh,barks,leaves)
positions=[(-2.4,0,0),(-.2,1.5,0),(2.3,0,0),(-2.2,2.6,0),(2.15,2.35,0)]
for kind,position in enumerate(positions):
    for obj in scene.objects:
        if obj.type=='MESH' and obj.name.startswith(f'Woodland | {kind} '):
            obj.location=position;obj.hide_render=False
            obj['tree_design']=['crooked ink birch','straight cobalt birch','leaning gold birch','silver upright forks','rose spreading low fork'][kind]
camera=scene.camera
camera.location=(0,-16,4.2)
camera.rotation_euler=(Vector((0,1,2.9))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=10.0
scene.render.resolution_x=1500;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format=source.render.image_settings.file_format
scene.render.image_settings.color_mode=source.render.image_settings.color_mode
scene.render.film_transparent=False
scene.render.filepath=str(OUT/'five-originals-study.png')
bpy.data.libraries.write(str(OUT/'watercolor-woodland-five-originals.blend'),{scene},fake_user=True)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
print('FIVE_ORIGINALS_READY',[(o.name,len(o.data.polygons)) for o in scene.objects if o.type=='MESH'])
