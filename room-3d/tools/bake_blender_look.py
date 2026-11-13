import bpy,numpy as np
from pathlib import Path
R=Path(__file__).resolve().parent
s=bpy.context.scene;s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=.65;s.view_settings.gamma=1
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.color_depth='8'
N=32;a=np.ones((N,N*N,4),dtype=np.float32)
for g in range(N):
 for b in range(N):
  for r in range(N):a[g,b*N+r,:3]=np.power(2.,np.array([r,g,b],dtype=np.float32)/(N-1)*18-12)
im=bpy.data.images.new('Blender AgX medium high contrast LUT',width=N*N,height=N,float_buffer=True,alpha=False);im.colorspace_settings.name='Linear Rec.709';im.pixels.foreach_set(a.ravel());im.save_render(str(R.parent/'dist/assets/blender-look.png'),scene=s)
print('BLENDER_LOOK_LUT_READY',flush=True)
