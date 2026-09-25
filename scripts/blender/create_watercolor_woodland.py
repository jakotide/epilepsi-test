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

def tree(seed, kind):
    rng = random.Random(seed)
    verts, faces = [], []
    leaf_verts, leaf_faces, leaf_indices = [], [], []

    def tube(points, radii, sides=10):
        # Catmull-Rom interpolation gives tapering bends without conical joints.
        points = [Vector(p) for p in points]
        samples, sizes = [], []
        for j in range(len(points)-1):
            a,b,c,d = points[max(0,j-1)],points[j],points[j+1],points[min(len(points)-1,j+2)]
            for step in range(8):
                t = step/8
                samples.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
                sizes.append(radii[j]*(1-t)+radii[j+1]*t)
        samples.append(points[-1]); sizes.append(radii[-1])
        start = len(verts)
        for j,(center,radius) in enumerate(zip(samples,sizes)):
            tangent=(samples[min(j+1,len(samples)-1)]-samples[max(j-1,0)]).normalized()
            side=tangent.cross(Vector((0,1,0))).normalized()
            other=tangent.cross(side).normalized()
            for k in range(sides):
                angle=k*2*pi/sides
                uneven=1+.075*sin(k*3.7+j*.75)+.035*sin(j*2.1+k)
                verts.append(tuple(center+(side*cos(angle)+other*sin(angle))*radius*uneven))
        for j in range(len(samples)-1):
            for k in range(sides):
                a=start+j*sides+k;b=start+j*sides+(k+1)%sides
                faces.append((a,b,b+sides,a+sides))
        faces.append(tuple(start+k for k in reversed(range(sides))))
        end=start+(len(samples)-1)*sides
        faces.append(tuple(end+k for k in range(sides)))

    def leaf(center, size, material):
        # Each leaf is a slightly cupped, asymmetric pointed paint mark.
        angle=rng.uniform(-pi,pi)
        along=Vector((cos(angle),rng.uniform(-.75,.75),sin(angle)))
        across=Vector((-sin(angle),rng.uniform(-.85,.85),cos(angle)))
        base=len(leaf_verts);center=Vector(center)
        leaf_verts.append(tuple(center+Vector((0,-size*.18,0))))
        outline=[(-1,0),(-.8,.28),(-.5,.48),(-.15,.57),(.22,.59),(.55,.42),(.86,.21),(1.2,0),(.65,-.28),(.25,-.48),(-.12,-.52),(-.52,-.40),(-.8,-.20)]
        for u,v in outline:leaf_verts.append(tuple(center+along*u*size+across*v*size))
        for j in range(len(outline)):
            leaf_faces.append((base,base+1+j,base+1+(j+1)%len(outline)));leaf_indices.append(material)

    def cluster(center, radius=.22, blossom=False):
        for _ in range(rng.randint(23,38)):
            p=Vector(center)+Vector((rng.gauss(0,radius),rng.uniform(-.18,.18),rng.gauss(0,radius*.65)))
            weights=([4,6,1,1],[2,4,6,1],[4,2,1,5])[kind]
            material=4 if blossom and rng.random()<.82 else rng.choices([0,1,2,3],weights)[0]
            leaf(p,rng.uniform(.025,.072),material)

    direction=-1 if kind==2 else 1
    sway=rng.uniform(-.2,.2)
    if kind==0:
        # Crooked birch: broad lower bend and a spreading, asymmetric fork.
        trunk=[(0,0,-.08),(.09,0,.5),(-.19,.04,1.5),(-.12,.09,2.55),(-.47,.08,3.55),(-.38+sway,0,4.55),(-.19+sway,.12,5.6)]
        radii=[.27,.21,.18,.155,.11,.062,.012]
        branches=[(1.90,-1,.70),(2.8,1,1.9),(3.65,-1,1.38),(4.95,1,.74)]
    elif kind==1:
        # Tall, almost vertical blue trunk with a high, light crown.
        trunk=[(0,0,-.08),(.025,.02,.5),(.015,.03,1.5),(-.025,.04,2.55),(.015,.06,3.55),(.04,.08,4.55),(.025,.1,6.05)]
        radii=[.19,.155,.135,.115,.085,.05,.009]
        branches=[(3.35,1,.80),(4.08,-1,1.10),(4.9,1,.84),(5.35,-1,.64)]
    else:
        # Leaning gold tree: a lower blossom fork and a one-sided crown.
        trunk=[(0,0,-.08),(.04,.03,.5),(.22,.1,1.5),(.42,.13,2.55),(.30,.2,3.55),(.64,.14,4.55),(.87,.2,5.65)]
        radii=[.225,.18,.15,.13,.095,.06,.01]
        branches=[(1.7,1,.9),(2.65,-1,1.3),(3.85,1,.95),(4.75,-1,1.55)]
    tube(trunk,radii,16)
    for z,side,length in branches:
        side*=direction
        z+=rng.uniform(-.13,.13)
        a,b=next((Vector(a),Vector(b)) for a,b in zip(trunk,trunk[1:]) if a[2]<=z<=b[2])
        start=a.lerp(b,(z-a.z)/(b.z-a.z))
        end=Vector((side*length,rng.uniform(-.1,.3),min(5.8,z+rng.uniform(.85,1.65))))
        middle=start.lerp(end,.52)+Vector((side*.08,-.02,-.12))
        tube([start,middle,end],[.077 if z<4 else .045,.035,.004],10)
        for j in range(4):
            t=.34+j*.18
            a=start.lerp(end,t);a.z-=sin(t*pi)*.10
            reach=rng.uniform(.27,.52)
            b=a+Vector((side*reach*(1 if j%2 else -.45),rng.uniform(-.20,.12),reach))
            tube([a,a.lerp(b,.5)+Vector((.02,0,-.04)),b],[.018,.010,.002],7)
            cluster(b,.18,blossom=(z<3.5 and kind==2) or (z<2.5 and kind==0))
        cluster(end,.2)
    # Branches into and out of the page make the side/back views read as trees,
    # while preserving the open front composition.
    for j,z in enumerate((2.95,4.45)):
        a,b=next((Vector(a),Vector(b)) for a,b in zip(trunk,trunk[1:]) if a[2]<=z<=b[2])
        start=a.lerp(b,(z-a.z)/(b.z-a.z))
        end=start+Vector((rng.uniform(-.45,.45),(-1 if j else 1)*1.05,.95))
        tube([start,start.lerp(end,.55)+Vector((.04,0,-.10)),end],[.044,.021,.002],9)
        for t in (.5,.75,1):cluster(start.lerp(end,t),.14,kind==2 and j==0)
    # Small upper sprigs, leaving most of the trunk uncovered.
    for j in range(4):
        a=Vector(trunk[-2]).lerp(Vector(trunk[-1]),j*.23)
        b=a+Vector(((-1 if j%2 else 1)*.38,0,.25))
        tube([a,b],[.021,.002],7);cluster(b,.17)
    wood=object_mesh(f'Woodland | {kind} expressive trunk',verts,faces,[barks[kind]])
    foliage=object_mesh(f'Woodland | {kind} scattered leaves and blossom',leaf_verts,leaf_faces,leaves,leaf_indices)
    for obj in (wood,foliage):
        obj['watercolor_source']='Copied mug / rose Eevee material: light bands, pigment pooling, paper tooth'
    return [wood,foliage]

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
