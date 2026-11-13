import bpy
from pathlib import Path
O=Path(__file__).resolve().parent/'baked-room';s=bpy.data.scenes['WEB_V9'];bpy.context.window.scene=s
for im in bpy.data.images:
 if im.name.startswith('Blender irradiance '):
  key=im.name.removeprefix('Blender irradiance ');p=O/('light-'+key+'-clean.png')
  if p.exists():im.filepath=str(p);im.reload()
for m in {m for o in s.objects if o.type=='MESH' for m in o.data.materials if m}:
 n=m.node_tree.nodes;l=m.node_tree.links;p=next((x for x in n if x.type=='BSDF_PRINCIPLED'),None)
 if not p and any(x.type=='BSDF_TRANSPARENT' for x in n):
  p=n.new('ShaderNodeBsdfPrincipled');p.inputs['Base Color'].default_value=(.94,.97,1,1);p.inputs['Alpha'].default_value=.06;p.inputs['Roughness'].default_value=.12
  out=next(x for x in n if x.type=='OUTPUT_MATERIAL');l.new(p.outputs['BSDF'],out.inputs['Surface']);m.surface_render_method='DITHERED';m['sourceTransparentGlazing']=True
 if p:m['sourceSheenWeight']=p.inputs['Sheen Weight'].default_value
 if p and 'blush ivory woven shade' in m.name:m['warmTranslucentShade']=True
bpy.ops.export_scene.gltf(filepath=str(O/'room-baked-raw.glb'),export_format='GLB',use_active_scene=True,export_apply=True,export_animations=False,export_lights=False,export_cameras=False,export_extras=True,export_image_format='AUTO',export_texcoords=True,export_normals=True,export_vertex_color='MATERIAL',export_all_vertex_colors=False,export_yup=True)
print('FINAL_BAKED_EXPORT',flush=True)
