import bpy,math,json,time
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent;O=R/'baked-room';O.mkdir(parents=True,exist_ok=True)
s=bpy.data.scenes['05_自然光与三盏暖灯'];bpy.context.window.scene=s
# Use only the render-visible hierarchy from the current revision.
valid=set()
def visit(c,hide=False):
 hide=hide or c.hide_render
 if not hide:valid.update(o.name for o in c.objects)
 for child in c.children:visit(child,hide)
visit(s.collection)
selected=[];removed=[];meta={'source':'房间复原_兔子脸型与软耳修正版.blend','revision':'V9','cameras':{},'lamps':[]}
for o in s.objects:
 if o.type=='CAMERA':
  p=o.matrix_world.translation;d=o.matrix_world.to_quaternion()@Vector((0,0,-1));meta['cameras'][o.name]={'position':[p.x,p.z,-p.y],'direction':[d.x,d.z,-d.y],'fov':math.degrees(o.data.angle)}
 if o.type=='LIGHT' and o.name in valid and not o.hide_render:
  p=o.matrix_world.translation;meta['lamps'].append({'name':o.name,'type':o.data.type,'position':[p.x,p.z,-p.y],'energy':o.data.energy,'color':list(o.data.color)})
for o in list(s.objects):
 if o.type not in ['MESH','CURVE','FONT','SURFACE'] or o.hide_render or o.name not in valid or o.name not in bpy.context.view_layer.objects:continue
 if any(t in o.name for t in ['soft velour fibers','fine plush pile','ear pile','muzzle pile']):removed.append(o.name);continue
 selected.append(o)
# Reduce only tessellation, keeping object silhouettes and all focal props.
for o in selected:
 for mod in o.modifiers:
  if mod.type=='SUBSURF':mod.levels=min(mod.levels,1)
 if o.type=='CURVE':o.data.resolution_u=min(o.data.resolution_u,6);o.data.bevel_resolution=min(o.data.bevel_resolution,1)
bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();new=[]
for idx,o in enumerate(selected):
 eo=o.evaluated_get(dg);me=bpy.data.meshes.new_from_object(eo,preserve_all_data_layers=True,depsgraph=dg)
 ob=bpy.data.objects.new(o.name+'_WEB',me);s.collection.objects.link(ob);ob.matrix_world=o.matrix_world.copy();ob['sourceName']=o.name;ob['sourceCollection']=o.users_collection[0].name
 n=o.name.lower();ob['cutaway']=any(t in n for t in ['ceiling','east wall','south wall','door wall']);ob['exterior']='distant exterior' in n
 new.append(ob)
 if len(me.polygons)>12000:
  bpy.context.view_layer.objects.active=ob;target=30000 if any(t in n for t in ['fitted sheet','checked quilt','pink bunny continuous']) else 14000
  tri=sum(len(p.vertices)-2 for p in me.polygons)
  if tri>target:
   m=ob.modifiers.new('Web silhouette simplification','DECIMATE');m.ratio=max(.08,target/tri);bpy.ops.object.modifier_apply(modifier=m.name)
 if idx%500==0:print('CONVERT',idx,len(selected),flush=True)
print('VISIBLE_GEOMETRY',len(new),flush=True)
# Export from an isolated scene, without modifying the .blend on disk.
web=bpy.data.scenes.new('WEB_V9');bpy.context.window.scene=web
for ob in new:web.collection.objects.link(ob);s.collection.objects.unlink(ob)
web.render.engine='CYCLES';web.cycles.device='CPU';web.cycles.samples=1;web.render.bake.margin=6
# Preserve the old UV channel used by existing image and procedural textures.
for ob in new:
 if ob.data.uv_layers:ob.data.uv_layers[0].name='SourceUV'
# Copies ensure the source materials in other scenes remain intact.
matcopies={}
for ob in new:
 for i,m in enumerate(ob.data.materials):
  if not m:continue
  if m.name not in matcopies:
   cp=m.copy();cp.name='WEB '+m.name;matcopies[m.name]=cp
   if cp.use_nodes:
    for n in list(cp.node_tree.nodes):
     if n.type=='TEX_COORD':
      for lk in list(n.outputs['UV'].links):
       uv=cp.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='SourceUV';cp.node_tree.links.new(uv.outputs[0],lk.to_socket)
  ob.data.materials[i]=matcopies[m.name]
# Bake unsupported procedural base-colour graphs into four shared texture atlases.
def proc(m):
 p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if m and m.use_nodes else None
 return p and (p.inputs['Normal'].is_linked or (p.inputs['Base Color'].is_linked and p.inputs['Base Color'].links[0].from_node.type not in ['TEX_IMAGE','VERTEX_COLOR','ATTRIBUTE']))
groups={}
for ob in new:
 if any(proc(m) for m in ob.data.materials):
  n=ob['sourceName'];key='floor' if 'Walnut floor plank' in n else ('soft' if ob['sourceCollection']=='02_Bed' or 'V4 boot' in n else 'wood')
  groups.setdefault(key,[]).append(ob)
for key,objects in groups.items():
 print('BAKE_BEGIN',key,len(objects),flush=True)
 bpy.ops.object.select_all(action='DESELECT')
 for ob in objects:
  ob.select_set(True);uv=ob.data.uv_layers.new(name='WebBake');ob.data.uv_layers.active=uv;uv.active_render=True
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.006,area_weight=.5);bpy.ops.object.mode_set(mode='OBJECT')
 size=4096;im=bpy.data.images.new('WEB '+key+' atlas',width=size,height=size,alpha=False);im.colorspace_settings.name='sRGB'
 mats={m for o in objects for m in o.data.materials if m};links=[]
 for m in mats:
  n=m.node_tree.nodes;l=m.node_tree.links;p=next((x for x in n if x.type=='BSDF_PRINCIPLED'),None)
  if not p:continue
  out=next(x for x in n if x.type=='OUTPUT_MATERIAL');old=out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].is_linked else None
  emit=n.new('ShaderNodeEmission')
  if p.inputs['Base Color'].is_linked:l.new(p.inputs['Base Color'].links[0].from_socket,emit.inputs['Color'])
  else:emit.inputs['Color'].default_value=p.inputs['Base Color'].default_value
  l.new(emit.outputs[0],out.inputs['Surface']);tex=n.new('ShaderNodeTexImage');tex.image=im;n.active=tex;links.append((m,p,out,old,emit,tex))
 bpy.ops.object.bake(type='EMIT',use_clear=True)
 for m,p,out,old,emit,tex in links:
  n=m.node_tree.nodes;l=m.node_tree.links
  if old:l.new(old,out.inputs['Surface'])
  n.remove(emit);uv=n.new('ShaderNodeUVMap');uv.uv_map='WebBake';l.new(uv.outputs[0],tex.inputs['Vector']);l.new(tex.outputs['Color'],p.inputs['Base Color'])
  # Keep the original normal graph until the tangent-space bake below.
 im.filepath_raw=str(O/(key+'-atlas.png'));im.file_format='PNG';im.save();print('BAKE_DONE',key,flush=True)
 # Preserve actual source bump/normal detail in tangent space.
 normal=bpy.data.images.new('WEB '+key+' normal',width=size,height=size,alpha=False);normal.colorspace_settings.name='Non-Color'
 for m,p,out,old,emit,tex in links:
  target=m.node_tree.nodes.new('ShaderNodeTexImage');target.image=normal;m.node_tree.nodes.active=target
 bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_clear=True)
 for m,p,out,old,emit,tex in links:
  n=m.node_tree.nodes;l=m.node_tree.links;target=n.active;uv=n.new('ShaderNodeUVMap');uv.uv_map='WebBake';l.new(uv.outputs[0],target.inputs['Vector']);nm=n.new('ShaderNodeNormalMap');nm.uv_map='WebBake';l.new(target.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs[0],p.inputs['Normal'])
 normal.filepath_raw=str(O/(key+'-normal.png'));normal.file_format='PNG';normal.save();print('NORMAL_DONE',key,flush=True)
# Compact physically based materials: tame transmission to avoid opaque web glass.
for m in set(m for o in new for m in o.data.materials if m):
 if not m.use_nodes:continue
 p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 if p:
  # Tangent normals baked above are deliberately retained.
  if any(t in m.name.lower() for t in ['transparent','glass','acrylic','clear display']):
   p.inputs['Transmission Weight'].default_value=0;p.inputs['Alpha'].default_value=.12;p.inputs['Roughness'].default_value=.15;m.surface_render_method='DITHERED'
  p.inputs['Coat Weight'].default_value=min(p.inputs['Coat Weight'].default_value,.3)
# Discard unused attributes and join by material/behaviour to reduce draw calls.
buckets={}
for ob in new:
 if not ob.data.polygons:continue
 key=(tuple(m.name if m else '' for m in ob.data.materials),ob['cutaway'],ob['exterior'])
 # Keep each UV set aligned; ensure active texture channel retained.
 for a in list(ob.data.attributes):
  if a.name not in ['position','.corner_vert','.edge_verts','.corner_edge','material_index','sharp_face','sharp_edge','SourceUV','WebBake','Soft plush colour'] and not a.is_internal:
   try:ob.data.attributes.remove(a)
   except:pass
 buckets.setdefault(key,[]).append(ob)
for key,objects in buckets.items():
 if len(objects)<2:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name='WEB '+(key[0][0] if key[0] else 'default')+('_cutaway' if key[1] else '')
# Restore the exact source world and five active lights for irradiance baking.
web.world=s.world.copy();web.view_settings.view_transform=s.view_settings.view_transform;web.view_settings.look=s.view_settings.look;web.view_settings.exposure=s.view_settings.exposure
for spec in meta['lamps']:
 light=s.objects.get(spec['name'])
 if light:web.collection.objects.link(light.copy())
web.cycles.samples=48;web.cycles.max_bounces=6;web.cycles.diffuse_bounces=4;web.cycles.glossy_bounces=3;web.cycles.transparent_max_bounces=8
web['sourceExposure']=s.view_settings.exposure
(O/'source-settings.json').write_text(json.dumps({'view':s.view_settings.view_transform,'look':s.view_settings.look,'exposure':s.view_settings.exposure,'lamps':meta['lamps']},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(O/'prepared.blend'))
print('PREPARED_BAKED_DETAIL',flush=True)
bpy.ops.object.select_all(action='SELECT')
for o in web.objects:
 if o.type=='MESH':
  # glTF carries the vertex colours used for the revised rabbit faces.
  if o.data.color_attributes:
   a=o.data.color_attributes.get('Soft plush colour')
   if a:o.data.color_attributes.active_color=a
meta['objects']=sum(o.type=='MESH' for o in web.objects);meta['triangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in web.objects if o.type=='MESH');meta['removedMicrofibers']=removed
(O/'room-meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
bpy.ops.export_scene.gltf(filepath=str(O/'room-detail-raw.glb'),export_format='GLB',use_active_scene=True,export_apply=True,export_animations=False,export_lights=False,export_cameras=False,export_extras=True,export_image_format='AUTO',export_texcoords=True,export_normals=True,export_vertex_color='MATERIAL',export_all_vertex_colors=False,export_yup=True)
print('WEB_EXPORT_DONE',meta['objects'],meta['triangles'],flush=True)
