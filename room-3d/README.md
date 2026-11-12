# Bill · 三维房间探索

基于原有 V9 房间 GLB 的独立 Three.js 个人网站。原有二维网站和 Blender 模型不变。

## 运行

- `npm install`
- `npm run dev` → http://127.0.0.1:4173
- `npm run build`：更新本地 Three.js vendor 文件。
- 保持服务器运行，再执行 `npm test`：通过本机 Chrome / Playwright 检查桌面和触摸视口。
- `dist/` 可直接放到静态网站服务上。所有运行资源本地提供；只有带 Figma 捕获哈希时才按需加载设计同步工具。

## 操作

拖动环绕、滚轮或双指缩放；房间保持居中。靠近镜头的多面墙同时渐隐，地板不隐藏，屋顶剖开。初始只有三盏简化几何灯。点灯后对应区域显示黑白线稿，点击故事物品恢复局部颜色并打开正文。

高柜、床头板等挡视线的物品会随视角变成稀疏漫画网点，后面的物品可见、可点击；三盏灯和三个故事物品始终保持完整。

最新鼠标规则：没有移动透视、拖尾或跟随揭露区域。正常区域显示系统鼠标；仅悬停灯具或已解锁的故事物品时显示橙色圆圈。触摸设备没有自定义鼠标。

左灯解锁大提琴、红鞋；桌灯解锁电脑；床头灯照亮床。三篇故事全部打开后，右上角出现 How can I help。Tab、Enter、Space、Escape 和正文滚动键可用；底部“探索入口”提供不依赖小物件点击的路径。

进度保存在 `bill-room-exploration-v2`，访问 `?reset=1` 清除一次，其他查询参数保留。

## 文件

- `dist/app.js`：场景、唯一动画循环、鼠标/触摸、相机和灯光。
- `dist/scene/visualStates.js`：墙体渐隐、法线/深度线稿、局部颜色与故事背景虚化。
- `dist/scene/foregroundHalftone.js`：前景遮挡物漫画网点、空间范围与交互物品保护。
- `dist/scene/objectRegistry.js`：真实物品映射、简化灯具、同一几何体的故事展示副本。
- `dist/content/objects.js`：从 V9 源场景测量的位置、范围、稳定 ID。
- `dist/content/stories.js`：完整原文与解锁规则。
- `dist/interaction/store.js`：集中状态、进度恢复、坏数据重置。
- `dist/ui/storyPanel.js`：故事面板、焦点、滚动渐隐。
- `dist/index.html`、`dist/style.css`：黑色居中界面、桌面/手机布局、本地手写字体。
- `OBJECT_MAP.json`：GLB 实际 Mesh 名称和物品边界。
- `IMPLEMENTATION.md`：实现、限制、验证和模型校验值。
- `TEST_RESULTS.json`：最近一次桌面/手机/无 WebGL 测试结果。
- `npm run test:halftone`：前景透视及画布穿透点击专项检查。

网站保持现有私有访问配置。Figma 新区域：
https://www.figma.com/design/mRlAHBZIFLDeXpYuzqu6Ko?node-id=258-26
