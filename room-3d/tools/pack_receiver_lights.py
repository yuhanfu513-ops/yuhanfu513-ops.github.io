"""Denoise each physical surface independently before encoding the light layers."""
from pathlib import Path
import ctypes as ct
import sys
import numpy as np
from PIL import Image

source, destination = map(Path, sys.argv[1:3])
lib = ct.CDLL('/Applications/Blender.app/Contents/Resources/lib/libOpenImageDenoise.dylib')
ptr, integer, size, string = ct.c_void_p, ct.c_int, ct.c_size_t, ct.c_char_p
def bind(name, args, result=None):
    func = getattr(lib,name)
    func.argtypes,func.restype = args,result
    return func
device = bind('oidnNewDevice',[integer],ptr)(1)  # CPU; supports host memory
bind('oidnCommitDevice',[ptr])(device)
new_filter = bind('oidnNewFilter',[ptr,string],ptr)
set_image = bind('oidnSetSharedFilterImage',[ptr,string,ptr,integer,size,size,size,size,size])
set_bool = bind('oidnSetFilterBool',[ptr,string,ct.c_bool])
commit = bind('oidnCommitFilter',[ptr])
execute = bind('oidnExecuteFilter',[ptr])
release = bind('oidnReleaseFilter',[ptr])
get_error = bind('oidnGetDeviceError',[ptr,ct.POINTER(string)],integer)
def clean(rgb):
    height,width,_ = rgb.shape
    result = np.zeros_like(rgb)
    f = new_filter(device,b'RT')
    for name,arr in [(b'color',rgb),(b'output',result)]:
        set_image(f,name,arr.ctypes.data,3,width,height,0,0,0)
    set_bool(f,b'hdr',True)
    commit(f)
    execute(f)
    msg=string()
    if get_error(device,ct.byref(msg)): raise RuntimeError(msg.value)
    release(f)
    return np.maximum(result,0)
layers = ['left','desk','bedside','day0','day1','day2','day3','day4']
for mobile in [False,True]:
    w,h = (512,640) if mobile else (1024,1280)
    atlas = Image.new('RGBA',(4*w,2*h))
    for i,name in enumerate(layers):
        cached = source/(name+'-clean.npy')
        if not cached.exists():
            raw = np.load(source/(name+'.npy')).astype(np.float32)
            linear = np.concatenate([clean(raw[:1024]),clean(raw[1024:])])
            np.save(cached,linear.astype(np.float16))
        linear=np.load(cached).astype(np.float32)
        if mobile:
            linear=linear.reshape(h,2,w,2,3).mean(axis=(1,3))
        # Log encoding retains dim warm bounce, with a peak radiance of 31.97.
        encoded = np.log2(1+32*np.clip(linear,0,1023/32))/10
        alpha = np.ones((h,w),np.float32)
        if name=='left':
            alpha=np.load(source/'ambient-visibility.npy').astype(np.float32)
            if mobile: alpha=alpha.reshape(h,2,w,2).mean(axis=(1,3))
        if name.startswith('day'):
            # Directional diffuse on unobstructed white ground = E cos(theta)/pi.
            energy = 3 * .5 / np.linalg.norm([.32,.85,.5]) / np.pi
            direct = np.load(source/('sun'+name[3:]+'.npy'))[:,:,0].astype(np.float32)
            if mobile: direct = direct.reshape(h,2,w,2).mean(axis=(1,3))
            alpha = np.clip(direct/energy,0,1)
        # Keep alpha nonzero so lossless encoders retain RGB in full shade.
        rgba = np.dstack((np.round(encoded*255), 1+np.round(alpha*254)))
        tile = Image.fromarray(rgba[::-1].astype('uint8'))
        atlas.paste(tile,((i%4)*w,(1-i//4)*h))
    atlas.save(destination/('receiver-light-mobile.webp' if mobile else 'receiver-light.webp'),lossless=True,method=4)
