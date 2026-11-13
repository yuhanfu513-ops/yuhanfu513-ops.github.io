import bpy,math,json,time
from pathlib import Path
import numpy as np
R=Path(__file__).resolve().parent;O=R/'baked-room';s=bpy.data.scenes['WEB_V9'];bpy.context.window.scene=s
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=96;s.render.bake.margin=12;s.render.bake.use_pass_direct=True;s.render.bake.use_pass_indirect=True;s.render.bake.use_pass_color=False
s.cycles.use_denoising=True;s.cycles.use_adaptive_sampling=True
objects=[o for o in s.objects if o.type=='MESH']
fallback=bpy.data.materials.new('WEB original unassigned surface');fallback.use_nodes=True
for ob in objects:
 if not ob.data.materials:ob.data.materials.append(fallback)
 for i,m in enumerate(ob.data.materials):
  if not m:ob.data.materials[i]=fallback
# Keep original photographed/painted images at their own resolution; only procedural
# colors need the shared atlas. Their source UV nodes were made explicit in phase one.
for m in set(m for o in objects for m in o.data.materials if m):
 original=bpy.data.materials.get(m.name.removeprefix('WEB '))
 if not original or not original.use_nodes:continue
 op=next((n for n in original.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 if not op or not p or not op.inputs['Base Color'].is_linked:continue
 link=op.inputs['Base Color'].links[0]
 if link.from_node.type=='TEX_IMAGE':
  source=m.node_tree.nodes.get(link.from_node.name)
  if source:m.node_tree.links.new(source.outputs[link.from_socket.name],p.inputs['Base Color'])

def group(o):
 n=' '.join(m.name for m in o.data.materials if m).lower()
 if any(x in n for x in ['pink face softly','soft cream face']):return 'faces'
 if 'floor walnut' in n:return 'floor'
 if any(x in n for x in ['painted plaster','ivory satin joinery','ceiling']):return 'architecture'
 if any(x in n for x in ['bunny','plush','cotton','pillow','headboard','quilt','neckerchief','fabric','textile']):return 'textiles'
 if any(x in n for x in ['curtain','window','marble sill']):return 'window'
 if any(x in n for x in ['walnut','oak','wood']):return 'furniture'
 return 'objects'
groups={}
for o in objects:
 if o.get('exterior'):continue
 # Avoid allocating lightmaps to glass and metal-only objects, but keep them in ray visibility.
 ps=[next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) for m in o.data.materials if m and m.use_nodes]
 if ps and all(p and (p.inputs['Metallic'].default_value>.8 or p.inputs['Alpha'].default_value<.5 or p.inputs['Emission Strength'].default_value>1) for p in ps):continue
 groups.setdefault(group(o),[]).append(o)
manifest={'range':8,'groups':[],'source':'V9 original Blender materials, daylight and three warm lamps'}
# Material copies per atlas, protecting reused materials from cross-atlas assignments.
for key,obs in groups.items():
 copies={}
 for o in obs:
  for i,m in enumerate(o.data.materials):
   if m.name not in copies:
    cp=m.copy();cp.name=m.name+' | irradiance '+key;copies[m.name]=cp
    for n in list(cp.node_tree.nodes):
     if n.type=='TEX_IMAGE' and not n.inputs['Vector'].is_linked:
      uv=cp.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='SourceUV';cp.node_tree.links.new(uv.outputs[0],n.inputs['Vector'])
   o.data.materials[i]=copies[m.name]
 # Joint UV atlas, then one receiver mesh per group for fast repeated ray traversal.
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:
  o.select_set(True);uv=o.data.uv_layers.new(name='LightBake');o.data.uv_layers.active=uv;uv.active_render=True
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(70),island_margin=.004,area_weight=.6);bpy.ops.object.mode_set(mode='OBJECT')
 bpy.ops.object.join();receiver=bpy.context.object;receiver.name='Baked room '+key
 normal_links=[]
 if key=='faces':
  for m in receiver.data.materials:
   p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if p and p.inputs['Normal'].is_linked:
    lk=p.inputs['Normal'].links[0];normal_links.append((m,lk.from_socket,p.inputs['Normal']));m.node_tree.links.remove(lk)
 size=2048;im=bpy.data.images.new('Irradiance '+key,width=size,height=size,alpha=False,float_buffer=True);im.colorspace_settings.name='Linear Rec.709'
 for m in receiver.data.materials:
  tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;m.node_tree.nodes.active=tex
 print('LIGHT_BAKE_BEGIN',key,len(receiver.data.polygons),flush=True);t=time.time()
 bpy.ops.object.bake(type='DIFFUSE',pass_filter={'DIRECT','INDIRECT'},use_clear=True)
 for m,src,dst in normal_links:m.node_tree.links.new(src,dst)
 # Store high dynamic range using a fixed scene-linear range and sRGB encoding.
 values=np.empty(size*size*4,dtype=np.float32);im.pixels.foreach_get(values);values=values.reshape((-1,4));peak=float(np.max(values[:,:3]));linear=np.clip(values[:,:3]/8,0,1);values[:,:3]=np.where(linear<=.0031308,linear*12.92,1.055*np.power(linear,1/2.4)-.055);values[:,3]=1
 encoded=bpy.data.images.new('Blender irradiance '+key,width=size,height=size,alpha=False);encoded.colorspace_settings.name='sRGB';encoded.pixels.foreach_set(values.ravel());encoded.filepath_raw=str(O/('light-'+key+'.png'));encoded.file_format='PNG';encoded.save()
 for m in receiver.data.materials:
  n=m.node_tree.nodes;l=m.node_tree.links;p=next((x for x in n if x.type=='BSDF_PRINCIPLED'),None)
  if not p or p.inputs['Alpha'].default_value<.5 or p.inputs['Metallic'].default_value>.8 or p.inputs['Emission Strength'].default_value>1:continue
  target=n.new('ShaderNodeTexImage');target.image=encoded;uv=n.new('ShaderNodeUVMap');uv.uv_map='LightBake';l.new(uv.outputs[0],target.inputs['Vector']);l.new(target.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=1;m['bakedIrradiance']=8
 manifest['groups'].append({'id':key,'size':size,'peakLinear':peak,'seconds':round(time.time()-t,1),'materials':len(receiver.data.materials)})
 (O/'bake-manifest.json').write_text(json.dumps(manifest,indent=2));print('LIGHT_BAKE_DONE',key,manifest['groups'][-1],flush=True)
 # Restore original emission before baking other groups so stored irradiance never emits into the room.
 for m in receiver.data.materials:
  if m.get('bakedIrradiance'):
   p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Emission Strength'].default_value=0
# Export carries irradiance through emissiveTexture + material extras, decoded by the viewer.
for o in s.objects:
 if o.type!='MESH':continue
 for m in o.data.materials:
  if m.get('bakedIrradiance'):
   p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Emission Strength'].default_value=1
bpy.ops.wm.save_as_mainfile(filepath=str(O/'lightmapped.blend'))
bpy.ops.export_scene.gltf(filepath=str(O/'room-baked-raw.glb'),export_format='GLB',use_active_scene=True,export_apply=True,export_animations=False,export_lights=False,export_cameras=False,export_extras=True,export_image_format='AUTO',export_texcoords=True,export_normals=True,export_vertex_color='MATERIAL',export_all_vertex_colors=False,export_yup=True)
print('LIGHT_EXPORT_DONE',flush=True)
