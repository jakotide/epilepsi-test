"""A continuous ribbon that clears the pages, spine, and front cover lip."""
from math import cos, sin, pi
import bpy


def add_bookmark(scene, book, material):
    # Connected rows follow the gutter, then bend over the entire cover edge.
    # The previous straight descent passed inside the rounded spine/cover.
    rows = []
    for index in range(31):
        y = 1.45 - index / 30 * 2.94
        x = .007 * sin(y * 1.8)
        half_width = .048
        t = (abs(x) + half_width) / 2.25
        z = .19 + .32 * sin(pi * t)**.8 + .10 * t + .018 * cos(y * 1.5) * sin(pi * t) + .012
        rows.append((x, y, z, half_width))
    rows.extend([
        (.001, -1.53, .240, .048),
        (.004, -1.58, .221, .048),
        (.010, -1.62, .193, .049),
        (.018, -1.66, .150, .050),
        (.028, -1.71, .100, .051),
        (.040, -1.77, .060, .052),
        (.053, -1.84, .037, .053),
    ])
    vertices, faces = [], []
    for x, y, z, width in rows:
        vertices.extend([(x-width, y, z), (x+width, y, z)])
    for index in range(len(rows)-1):
        offset = index*2
        faces.append((offset, offset+2, offset+3, offset+1))
    # A shallow V-cut terminates the same mesh, rather than a separate tail.
    last = len(vertices)-2
    tip = len(vertices)
    vertices.extend([(.008,-1.97,.027), (.065,-1.91,.028), (.121,-1.97,.027)])
    faces.extend([(last,tip,tip+1,last+1), (last+1,tip+1,tip+2)])
    data = bpy.data.meshes.new('Still life | continuous open book ribbon')
    data.from_pydata(vertices, [], faces)
    data.update()
    data.materials.append(material)
    for face in data.polygons:
        face.use_smooth = True
    obj = bpy.data.objects.new('Still life | open book ribbon', data)
    scene.collection.objects.link(obj)
    obj.parent = book
    solidify = obj.modifiers.new('Soft bookmark thickness', 'SOLIDIFY')
    solidify.thickness = .006
    solidify.offset = 0
    return obj
