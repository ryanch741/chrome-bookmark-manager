# 📑 书签管理 — Glass Bookmarks

> **一款精美的 Chrome 新标签页书签管理插件** | *A gorgeous new-tab bookmark manager for Chrome*

![Preview](https://img.shields.io/badge/Chrome-Extension-v3-blue?logo=google-chrome)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ 特性 / Features

| 中文 | English |
|------|---------|
| 🪟 **毛玻璃设计** — 优雅的 Glassmorphism 视觉风格，支持深色/浅色主题 | 🪟 **Glassmorphism UI** — Elegant frosted-glass design with dark/light themes |
| 🏠 **替换新标签页** — 安装即用，打开新标签页自动展示所有书签 | 🏠 **New Tab Replacement** — Instantly replaces `chrome://newtab` with your bookmarks |
| 📂 **分组展示** — 按 Chrome 书签文件夹分组，首页只显示一级分组 | 📂 **Grouped by Folder** — Organized exactly as your Chrome bookmarks, first-level only on home page |
| 📌 **快速访问** — 第一级书签直接固定在顶部，一键直达 | 📌 **Pinned Bookmarks** — Top-level bookmarks pinned at top for instant access |
| 🔍 **实时搜索** — 支持搜索书签名称和分组名，高亮匹配结果 | 🔍 **Instant Search** — Real-time filtering with highlighted matches |
| 🖼️ **悬浮预览** — 鼠标悬停分组卡片，大尺寸多列悬浮窗展示全部书签，子分组自动展开 | 🖼️ **Hover Preview** — Hover any group for a spacious multi-column preview with expanded sub-folders |
| 🎨 **背景自定义** — 6 种渐变预设 + 自定义图片背景 | 🎨 **Custom Backgrounds** — 6 gradient presets + custom image support |
| 📱 **响应式布局** — 完美适配桌面端与移动端 | 📱 **Responsive** — Looks great on desktop and mobile |

---

## 🚀 安装 / Installation

### 方法 1：从源码加载（推荐 / Recommended）

1. 克隆仓库：
   ```bash
   git clone https://github.com/YOUR_USERNAME/glass-bookmarks.git
   ```
2. 打开 Chrome，进入 `chrome://extensions`
3. 开启右上角的 **开发者模式**（Developer mode）
4. 点击 **加载已解压的扩展程序** → 选择 `src/` 目录
5. 新标签页已就绪！✨

### 方法 2：使用打包文件

1. 下载最新的 `.crx` 文件从 [Releases](../../releases)
2. 打开 `chrome://extensions`，开启开发者模式
3. 将 `.crx` 文件拖拽到页面中

---

## 📸 截图 / Screenshots

| 深色模式 | 浅色模式 |
|---------|---------|
| ![Dark](screenshots/dark.png) | ![Light](screenshots/light.png) |

| 悬浮预览 | 分组详情 |
|---------|---------|
| ![Preview](screenshots/preview.png) | ![Folder](screenshots/folder.png) |

---

## 🗂️ 项目结构 / Project Structure

```
glass-bookmarks/
├── chrome_bookmarks.pem         # 扩展私钥（勿外传）
├── bookmarks_extension.crx      # 打包文件
└── src/                         # 源码目录
    ├── manifest.json            # 扩展清单 (MV3)
    ├── background.js            # Service Worker
    ├── app/
    │   ├── index.html           # 主页面
    │   ├── app.js               # 核心逻辑
    │   └── styles.css           # 样式
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

---

## ⚙️ 技术栈 / Tech Stack

- **Manifest V3** — 最新的 Chrome 扩展规范
- **Vanilla JS** — 无框架依赖，轻量高效
- **CSS Glassmorphism** — `backdrop-filter: blur()` 毛玻璃效果
- **Chrome Bookmark API** — 直接读取浏览器书签数据

---

## 📄 许可 / License

MIT License © 2024

---

> 💡 **提示**：如果你觉得这个项目有用，欢迎 ⭐ Star 支持！
