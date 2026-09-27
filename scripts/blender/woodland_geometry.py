"""Original watercolor tree silhouettes, shared by the woodland build scripts."""
from math import sin, cos, pi
import random
from mathutils import Vector

def tree(seed, kind, object_mesh, barks, leaves):
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
        for _ in range(rng.randint(16,27) if kind==3 else rng.randint(23,38)):
            p=Vector(center)+Vector((rng.gauss(0,radius),rng.uniform(-.18,.18),rng.gauss(0,radius*.65)))
            weights=([4,6,1,1],[2,4,6,1],[4,2,1,5],[1,7,4,1],[3,2,1,5])[kind]
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
    elif kind==2:
        # Leaning gold tree: a lower blossom fork and a one-sided crown.
        trunk=[(0,0,-.08),(.04,.03,.5),(.22,.1,1.5),(.42,.13,2.55),(.30,.2,3.55),(.64,.14,4.55),(.87,.2,5.65)]
        radii=[.225,.18,.15,.13,.095,.06,.01]
        branches=[(1.7,1,.9),(2.65,-1,1.3),(3.85,1,.95),(4.75,-1,1.55)]
    elif kind==3:
        # Silver sapling: a narrow vertical stem and long upward-reaching forks.
        trunk=[(0,0,-.08),(-.02,.02,.6),(.04,-.06,1.7),(.08,0,2.8),(-.04,.1,3.9),(-.17,.08,4.9),(-.12,.1,6.1)]
        radii=[.16,.115,.10,.075,.050,.026,.004]
        branches=[(2.35,-1,.72),(3.15,1,.85),(4.12,-1,.62),(5.05,1,.48)]
        tube([(0,0,.8),(-.13,.02,1.5),(-.42,.12,2.9),(-.72,.26,4.45),(-.95,.32,5.4)],
             [.087,.069,.045,.024,.003],11)
        for p in [(-.96,.33,5.4),(-.75,.25,4.7),(-.54,.16,4.0)]:cluster(p,.17)
    else:
        # Rose tree: low open Y, a bowed trunk and long, near-horizontal boughs.
        trunk=[(0,0,-.08),(.11,-.02,.5),(.18,.06,1.3),(-.10,.08,2.25),(-.28,.18,3.1),(-.51,.10,4.0),(-.67,.15,4.9)]
        radii=[.23,.18,.15,.12,.080,.043,.005]
        branches=[(1.28,1,1.72),(2.2,-1,1.43),(3.05,1,1.60),(4.12,-1,1.1)]
        tube([(.16,.06,1.3),(.53,.10,2.0),(.83,.19,2.95),(1.25,.30,3.75),(1.5,.32,4.35)],
             [.115,.092,.061,.030,.003],13)
        for p in [(1.5,.32,4.35),(1.17,.29,3.78),(.85,.2,3.25)]:cluster(p,.21,True)
    tube(trunk,radii,16)
    for z,side,length in branches:
        side*=direction
        z+=rng.uniform(-.13,.13)
        a,b=next((Vector(a),Vector(b)) for a,b in zip(trunk,trunk[1:]) if a[2]<=z<=b[2])
        start=a.lerp(b,(z-a.z)/(b.z-a.z))
        depth=rng.uniform(-.1,.3)
        rise=rng.uniform(1.15,1.85) if kind==3 else rng.uniform(.40,.92) if kind==4 else rng.uniform(.85,1.65)
        end=Vector((side*length,depth,min(5.8,z+rise)))
        middle=start.lerp(end,.52)+Vector((side*.08,-.02,-.12))
        tube([start,middle,end],[.077 if z<4 else .045,.035,.004],10)
        for j in range(4):
            t=.34+j*.18
            a=start.lerp(end,t);a.z-=sin(t*pi)*.10
            reach=rng.uniform(.27,.52)
            b=a+Vector((side*reach*(1 if j%2 else -.45),rng.uniform(-.20,.12),reach))
            tube([a,a.lerp(b,.5)+Vector((.02,0,-.04)),b],[.018,.010,.002],7)
            cluster(b,.18,blossom=kind==4 or (z<3.5 and kind==2) or (z<2.5 and kind==0))
        cluster(end,.2,blossom=kind==4)
    # Branches into and out of the page make the side/back views read as trees,
    # while preserving the open front composition.
    for j,z in enumerate((2.45,3.85) if kind==4 else (2.95,4.45)):
        a,b=next((Vector(a),Vector(b)) for a,b in zip(trunk,trunk[1:]) if a[2]<=z<=b[2])
        start=a.lerp(b,(z-a.z)/(b.z-a.z))
        end=start+Vector((rng.uniform(-.45,.45),(-1 if j else 1)*1.05,.95))
        tube([start,start.lerp(end,.55)+Vector((.04,0,-.10)),end],[.044,.021,.002],9)
        for t in (.5,.75,1):cluster(start.lerp(end,t),.14,kind==4 or (kind==2 and j==0))
    # Small upper sprigs, leaving most of the trunk uncovered.
    for j in range(4):
        a=Vector(trunk[-2]).lerp(Vector(trunk[-1]),j*.23)
        b=a+Vector(((-1 if j%2 else 1)*(.24 if kind==3 else .38),0,.25))
        tube([a,b],[.021,.002],7);cluster(b,.17,kind==4 and j%2==0)
    wood=object_mesh(f'Woodland | {kind} expressive trunk',verts,faces,[barks[kind]])
    foliage=object_mesh(f'Woodland | {kind} scattered leaves and blossom',leaf_verts,leaf_faces,leaves,leaf_indices)
    for obj in (wood,foliage):
        obj['watercolor_source']='Copied mug / rose Eevee material: light bands, pigment pooling, paper tooth'
    return [wood,foliage]
