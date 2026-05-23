# 📑 书签管理 — Glass Bookmarks

> 一款精美的新标签页书签管理插件，毛玻璃设计，分组展示，暗夜主题。  
> 把你的 Chrome 书签变成一扇赏心悦目的新标签页。无需注册开发者账号，免费安装。

---

## ✨ 特性

| 中文 | English |
|------|---------|
| 🪟 **毛玻璃设计** — Glassmorphism 视觉风格，支持深色/浅色主题 | 🪟 **Glassmorphism UI** — Elegant frosted-glass design with dark/light themes |
| 🏠 **替换新标签页** — 安装即用，打开新标签页就是你的书签 | 🏠 **New Tab Replacement** — Instantly replaces `chrome://newtab` with your bookmarks |
| 📂 **分组展示** — 按 Chrome 书签文件夹自动分组 | 📂 **Grouped by Folder** — Organized exactly as your Chrome bookmarks |
| 📌 **快速访问** — 一级书签固定在顶部，一键直达 | 📌 **Pinned Bookmarks** — Top-level bookmarks pinned at top for instant access |
| 🔍 **实时搜索** — 输入即搜，高亮匹配结果 | 🔍 **Instant Search** — Real-time filtering with highlighted matches |
| 🖼️ **悬浮预览** — 鼠标悬停分组卡片，大尺寸预览窗展示全部书签 | 🖼️ **Hover Preview** — Hover any group for a spacious multi-column preview |
| 🎨 **背景自定义** — 6 种渐变预设 + 自定义图片背景 | 🎨 **Custom Backgrounds** — 6 gradient presets + custom image support |
| 🌙 **深色/浅色** — 跟随系统或手动切换 | 🌙 **Dark/Light Mode** — Follows system or manual toggle |
| ✏️ **编辑模式** — 在界面上直接编辑、删除、拖动排序书签和分组 | ✏️ **Edit Mode** — Edit, delete, drag-and-drop bookmarks and folders |

---

## 🔧 安装方法（开发者模式）

> 💡 这是**免费**的方式，不需要 $5 注册 Chrome 开发者账号。安装后完全正常使用，没有任何功能限制。

### 📥 第一步：下载源码

<details>
<summary><b>方式 A — 使用 Git（推荐，方便后续更新）</b></summary>

```bash
git clone https://github.com/ryanch741/chrome-bookmark-manager.git
```
更新时只需在目录下执行 `git pull` 即可。
</details>

<details>
<summary><b>方式 B — 下载 ZIP</b></summary>

1. 打开项目页面：https://github.com/ryanch741/chrome-bookmark-manager
2. 点击绿色的 **<> Code** 按钮 → **Download ZIP**
3. 解压到电脑上的一个文件夹（记住这个位置）
</details>

---

### 🛠️ 第二步：加载扩展

#### 1️⃣ 打开扩展管理页

在 Chrome 地址栏输入并回车：

```
chrome://extensions
```

#### 2️⃣ 开启开发者模式

在页面**右上角**找到 **开发者模式** 开关，点击开启。

```
┌─────────────────────────────────────────────────┐
│  ☑ 开发者模式          ← 点击这里开启             │
│                                                  │
│  加载已解压的扩展程序    打包扩展程序    更新      │
└─────────────────────────────────────────────────┘
```

#### 3️⃣ 加载扩展

点击左上角的 **加载已解压的扩展程序** 按钮。

在弹出的文件夹选择器中，**选择 `chrome-bookmark-manager/src` 文件夹**（注意是里面的 `src` 文件夹，不是项目根目录）：

```
chrome-bookmark-manager/
├── src/                     ← 选择这个文件夹！
│   ├── manifest.json
│   ├── background.js
│   ├── app/
│   └── icons/
├── README.md
└── ...
```

#### 4️⃣ 完成！🎉

安装成功后：
- **打开新标签页** — 就能看到你的书签了
- 如果之前打开过新标签页，**关闭重新打开**即可
- 你会在扩展管理页看到这张卡片：

```
┌──────────────────────────────────────────┐
│  📑 书签管理                    已启用    │
│  美观的书签管理工具                       │
│  ID: xxx                                 │
│                                          │
│  [详情] [移除] [刷新] [错误]             │
└──────────────────────────────────────────┘
```

---

### 🔄 如何更新？

```
git pull                    # 拉取最新代码
```
然后回到 `chrome://extensions`，点击扩展卡片上的 **刷新 🔄** 按钮即可。

---

## ❓ 常见问题

### 打开新标签页没变化？

确保**没有其他新标签页插件**冲突（如 Infinity、Momentum、iTab 等）：
1. 去 `chrome://extensions` 检查是否有其他新标签页插件
2. 如果有，先禁用或移除它们
3. 刷新或重启 Chrome 浏览器

### 每次打开浏览器都有开发者模式警告？

这是正常的。Chrome 会提示"请停用开发者模式扩展程序"，这是 Chrome 的安全机制：
- 点**取消**或**管理扩展程序** → 保持启用即可
- 浏览器重启后偶尔提示一次，不影响日常使用

### 看不到我的书签？

本插件显示的是 **Chrome 书签栏**（Bookmarks Bar）中的内容：
- 如果书签在"其他书签"文件夹中，不会自动显示在首页
- 可以在 Chrome 书签管理器中将它们移入书签栏
- 或者点击插件中的分组卡片进入查看完整内容

### 插件会收集我的数据吗？

**不会。** 本插件完全离线运行：
- 所有书签数据直接从你本地的 Chrome 读取
- **没有任何远程服务器**
- 图标使用 Chrome 内置 API 从本地缓存读取
- **不需要任何网络权限**

### 如何卸载？

去 `chrome://extensions`，找到本插件，点击 **移除** 即可。新标签页会自动恢复为 Chrome 默认。

---

## 🗂️ 项目结构

```
├── src/                     # 插件源码
│   ├── manifest.json        # 扩展清单 (Manifest V3)
│   ├── background.js        # 后台 Service Worker
│   ├── app/
│   │   ├── index.html       # 新标签页主页面
│   │   └── app.js           # 核心逻辑
│   ├── icons/               # 扩展图标 (16/48/128)
│   ├── pay/                 # 打赏二维码
│   └── fonts/               # 图标字体
├── install_app.command      # macOS 一键安装脚本
└── README.md
```

---

## ⚙️ 技术栈

- **Manifest V3** — 最新 Chrome 扩展规范
- **Vanilla JS** — 无框架依赖
- **CSS Glassmorphism** — 毛玻璃效果
- **Chrome Bookmark API** — 直接读取本地书签
- **Chrome Favicon API** — 从本地缓存获取网站图标

---

> 💡 **觉得好用？给项目点个 ⭐ Star 支持一下！**
