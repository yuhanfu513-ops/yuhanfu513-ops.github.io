import bpy
from pathlib import Path
O=Path(__file__).resolve().parent/'baked-room'
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=1;s.render.resolution_x=2048;s.render.resolution_y=2048;s.render.resolution_percentage=100
s.view_settings.view_transform='Standard';s.view_settings.look='None';s.view_settings.exposure=0;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
if not s.camera:
 d=bpy.data.cameras.new('Bake processing camera');o=bpy.data.objects.new('Bake processing camera',d);s.collection.objects.link(o);s.camera=o
nt=bpy.data.node_groups.new('Lightmap denoise','CompositorNodeTree');s.compositing_node_group=nt
nt.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor');out=nt.nodes.new('NodeGroupOutput');img=nt.nodes.new('CompositorNodeImage');dn=nt.nodes.new('CompositorNodeDenoise');nt.links.new(img.outputs['Image'],dn.inputs['Image']);nt.links.new(dn.outputs['Image'],out.inputs['Image'])
for p in O.glob('light-*.png'):
 if p.stem.endswith('-clean'):continue
 img.image=bpy.data.images.load(str(p));s.render.filepath=str(p.with_name(p.stem+'-clean.png'));bpy.ops.render.render(write_still=True);print('DENOISED',p.name,flush=True)
