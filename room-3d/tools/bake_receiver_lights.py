"""Run with Blender -b <original V9 room.blend> -P this_file -- <output directory>."""
import math
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

out = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
out.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.max_bounces = 5
scene.cycles.use_denoising = True
scene.render.bake.margin = 0
scene.render.use_border = False
scene.render.use_compositing = False
scene.render.film_transparent = False
# A sampling sheet just above the wood and in front of the three bay panels.
# It is invisible to bounce and shadow rays; the source materials still supply the bounce.
verts = [(0,0,.025),(3.5,0,.025),(3.5,4.30,.025),(0,4.30,.025),
         (1.05,4.231,.0),(2.85,4.231,.0),(2.85,4.231,.84),(1.05,4.231,.84)]
mesh = bpy.data.meshes.new('Receiver samples')
mesh.from_pydata(verts, [], [(0,1,2,3),(4,5,6,7)])
ob = bpy.data.objects.new(mesh.name, mesh)
scene.collection.objects.link(ob)
for ray in ('diffuse','glossy','shadow','transmission','volume_scatter'):
    setattr(ob, 'visible_'+ray, False)
uv = mesh.uv_layers.new()
floor_end = 1024 / 1280
for loop,coord in zip(uv.data, [(0,0),(1,0),(1,floor_end),(0,floor_end),
                                (0,floor_end),(1,floor_end),(1,1),(0,1)]):
    loop.uv = coord
mat = bpy.data.materials.new('Diffuse receiver')
mat.use_nodes = True
ob.data.materials.append(mat)
image = bpy.data.images.new('Linear diffuse irradiance',1024,1280,float_buffer=True)
target = mat.node_tree.nodes.new('ShaderNodeTexImage')
target.image = image
mat.node_tree.nodes.active = target
bpy.ops.object.select_all(action='DESELECT')
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
background = next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
world_strength = background.inputs['Strength'].default_value
lights = {o.name:o for o in scene.objects if o.type=='LIGHT' and not o.hide_render}
powers = {name:o.data.energy for name,o in lights.items()}
# The three lamp datablocks provide their fixture's illumination. Exclude screen
# and decorative bulb emission from the isolated passes.
for material in bpy.data.materials:
    if material.node_tree:
        for node in material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                node.inputs['Emission Strength'].default_value = 0
curtains = []
for name in ['Left printed curtain','Right printed curtain']:
    obj = scene.objects[name]
    curtains.append((obj, [obj.matrix_world @ v.co for v in obj.data.vertices]))
def aperture(a):
    for index,(obj,points) in enumerate(curtains):
        outer,inner,middle = (1.05,1.48,2.025) if index==0 else (3.01,2.61,1.995)
        inverse = obj.matrix_world.inverted()
        for vert,original in zip(obj.data.vertices,points):
            p = original.copy()
            u = max(0,min(1,(p.x-outer)/(inner-outer)))
            p.x = outer+((1-a)*middle+a*inner-outer)*u
            p.y = 4.18+(p.y-4.18)*(.38+.62*a)
            vert.co = inverse @ p
        obj.data.update()
def configure(words,opening):
    aperture(opening)
    for name,o in lights.items():
        o.data.energy = powers[name] if any(w in name for w in words) else 0
    background.inputs['Strength'].default_value = world_strength if 'sunlight' in words else 0
def bake(name,words,a,direct_only=False):
    if (out/(name+'.npy')).exists(): return
    configure(words,a)
    if direct_only: background.inputs['Strength'].default_value = 0
    passes = {'DIRECT'} if direct_only else {'DIRECT','INDIRECT'}
    bpy.ops.object.bake(type='DIFFUSE',pass_filter=passes,use_clear=True)
    values = np.empty(1280*1024*4,np.float32)
    image.pixels.foreach_get(values)
    rgb = values.reshape(1280,1024,4)[:,:,:3]
    print('RECEIVER',name,np.percentile(rgb,[5,50,90,99,100]),flush=True)
    np.save(out/(name+'.npy'),rgb.astype(np.float16))
if '--ambient-visibility' in sys.argv:
    scene.cycles.samples = 32
    ao=mat.node_tree.nodes.new('ShaderNodeAmbientOcclusion')
    ao.inputs['Distance'].default_value=.45
    ao.samples=16
    em=mat.node_tree.nodes.new('ShaderNodeEmission')
    mat.node_tree.links.new(ao.outputs['AO'],em.inputs['Color'])
    mat.node_tree.links.new(em.outputs[0],next(n for n in mat.node_tree.nodes if n.type=='OUTPUT_MATERIAL').inputs['Surface'])
    mat.node_tree.nodes.active=target
    bpy.ops.object.bake(type='EMIT',use_clear=True)
    values=np.empty(1280*1024*4,np.float32)
    image.pixels.foreach_get(values)
    np.save(out/'ambient-visibility.npy',values.reshape(1280,1024,4)[:,:,0].astype(np.float16))
    sys.exit(0)
if '--sun-masks' in sys.argv:
    scene.cycles.samples = 12
    for i in range(5):
        bake('sun'+str(i),['sunlight'],i/4,True)
    sys.exit(0)
for name,word in [('left','chest amber'),('desk','desk task'),('bedside','bedside 2700K')]:
    bake(name,[word],0)
for i in range(5):
    bake('day'+str(i),['sunlight','exterior diffuse'],i/4)
# Reference camera matches the Three.js vertical field of view and orbit target.
ob.hide_render = True
cam = bpy.data.objects.new('Receiver comparison camera', bpy.data.cameras.new('Receiver comparison'))
scene.collection.objects.link(cam)
cam.data.sensor_fit = 'VERTICAL'
cam.data.lens = cam.data.sensor_height/(2*math.tan(math.radians(43)/2))
cam.location = (1.76,.25,2.05)
cam.rotation_euler = (Vector((1.75,2.15,.95))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.camera = cam
scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage=900,700,100
scene.render.image_settings.file_format='PNG'
for name,words,a in [('single',['desk task'],0),('half',['desk task','chest amber','sunlight','exterior diffuse'],.5),('open',['sunlight','exterior diffuse','chest amber','desk task','bedside 2700K'],1)]:
    if name!='open' and (out/('reference-'+name+'.png')).exists(): continue
    configure(words,a)
    scene.render.filepath = str(out/('reference-'+name+'.png'))
    bpy.ops.render.render(write_still=True)
