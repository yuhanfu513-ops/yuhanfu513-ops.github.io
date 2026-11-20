# Blender 烘焙版 · 2026-11-13

源文件：房间复原_兔子脸型与软耳修正版.blend，场景 05_自然光与三盏暖灯。
原文件 SHA-256：200bf3a7f235a051a63244381f1dddc6467fd57da8eb0a792850b86fe86966a3。
只读取原文件，所有中间数据保存到 tools/baked-room/；不覆盖源模型。

## 生成流程

安装 npm 依赖后，从项目根目录运行以下步骤。BLENDER 表示 Blender 5.2.1 可执行文件完整路径，SOURCE 表示原始模型完整路径。Blender 自带 Python / NumPy。CPU 烘焙，无需 Metal。

1. `BLENDER -b SOURCE --python-exit-code 1 --python tools/export_baked_detail.py`
2. `BLENDER -b tools/baked-room/prepared.blend --python-exit-code 1 --python tools/bake_room_irradiance.py`
3. `BLENDER -b --python-exit-code 1 --python tools/denoise_maps.py`
4. `BLENDER -b tools/baked-room/lightmapped.blend --python-exit-code 1 --python tools/finalize_bake.py`
5. `BLENDER -b --python-exit-code 1 --python tools/bake_blender_look.py`
6. `node tools/optimize_baked_room.mjs`

脚本会生成 dist/assets/room-baked.glb 和 blender-look.png。原 room-v9.glb 保留供回退。

## 贴图与显示

- 地板、木材和软装：3 张 4096² 颜色图集。程序生成的木纹、布料和兔子颜色烘焙到 UV。
- 3 张切线法线图从 4096² 烘焙结果生成 2048² 网页版，恢复细微凹凸。
- 原照片、书封、电脑屏幕等保留原始图片纹理。
- 地板、建筑、窗户、家具、纺织物、杂物加上兔子脸部独立图集，共七组 2048² 光照图：Cycles 96 samples，原日光、三盏暖灯和间接反弹光；独立降噪，保留阴影。
- 光照在线性空间计算，固定范围 8 编码为 sRGB。GLB 用 emissiveTexture 和 bakedIrradiance 元数据携带；网页加载后转 lightMap，使用原 UV 通道。漫反射不重复叠加网页灯光，金属与高光继续实时计算。
- 32³ LUT 由 Blender 自身生成，采用 AgX / Medium High Contrast / +0.65 exposure。
- 修复混合透明玻璃的网页导出；布料绒面强度按 Blender 原参数恢复。半透明布灯罩的透光使用近似暖色补偿。
- 单个 GLB 24,492,344 bytes，Meshopt / WebP；桌面颜色图最高 4096，手机最多 2048。保持同一套对象外形、位置与交互。

右上角“房间原貌”显示完整彩色模型，再次点击“故事探索”返回原探索流程。切换本身不增加阅读进度。

## 限制

木地板和滑板后方的窗台柜面使用逐灯光照。其余表面沿用原有光照贴图和故事显色过渡。玻璃折射、布灯透光、移动高光与 Blender 路径追踪仍有差异。颜色与法线采用图集压缩；不承诺逐像素一致。手机验收是桌面 Chrome 触摸视口模拟。

## 2026-11-14 显示修复

保留独立玻璃灯罩材质，在线稿深度中只显示掠射轮廓，避免挡住灯丝。红鞋面恢复源线性红色，保留法线；鞋盒内烘焙阴影增加最低间接照度补偿，避免鞋子发灰。扩充柜体把手、墙面附件与门板的遮挡范围，使用导出 cutaway 元数据识别建筑边条。故事彩色范围扩大到周围陈设，灯和故事目标仍受保护。

## 木地板与窗台柜面的分层光照

三盏灯各自保存 Cycles 的直接光、反弹光和场景投影。窗光取实际开度 0%、25%、50%、75%、100%。网页按各灯当前亮度求和，再按窗帘的实际开度插值。地板和柜面在同一张纹理里占用独立区域，各自降噪。木板间的纹理接缝不影响投影位置。

以下命令从网站目录执行。将 ROOM_BLEND 设为 V9 原始 Blender 文件的路径，将 BAKE_DIR 设为空的中间产物目录。打包脚本使用 Blender 自带的 macOS Open Image Denoise 和 Python 的 NumPy、Pillow。

```sh
blender -b "$ROOM_BLEND" -P tools/bake_receiver_lights.py -- "$BAKE_DIR"
blender -b "$ROOM_BLEND" -P tools/bake_receiver_lights.py -- "$BAKE_DIR" --sun-masks
blender -b "$ROOM_BLEND" -P tools/bake_receiver_lights.py -- "$BAKE_DIR" --ambient-visibility
python3 tools/pack_receiver_lights.py "$BAKE_DIR" dist/assets
```

单张 WebP 的 RGB 通道保存对数编码的照度，各层的透明通道分别保存日光可见度或局部环境遮挡。桌面每层为 1024 × 1280，手机每层为 512 × 640。木地板的太阳高光系数为 0.8。三盏暖灯继续使用原来的高光参数。移动家具或调整太阳方向后需要重新烘焙。
