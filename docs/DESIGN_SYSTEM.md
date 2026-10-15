# 深空之眸 (Eyes Solar System) · 极简设计规范系统 (Design System)

> **版本**：Phase 6 终审基线 (2026-10-15)  
> **设计哲学**：内容优先、3D 视窗为主角、去盒子化、克制留白、无障碍优先  
> **代码实现**：纯 HTML/CSS/原生 JS，零框架依赖，样式核心位于 [`assets/css/main.css`](../assets/css/main.css)

---

## 一、核心设计原则

1. **页面少说话 (Content-First & Signal-over-Noise)**：
   杜绝冗长的铺垫与套话，严禁将内部开发术语（如 `descriptions/`、`blurb`、`slug`、`SOP`、`跨域` 等）直接暴露给科普受众。技术细节一律放入默认收起的 `<details>` 折叠区。
2. **3D 先出现 (Visual Subject Centric)**：
   在探索漫游与特写专题页中，3D 视窗即为第一主角。视窗占满全宽（桌面端横向空间全开，高度保持在 60vh ~ 62vh，在 1440×900 分辨率下同屏完整可见），天体目录与辅助面板收纳至覆盖式抽屉。
3. **一个页面一个主动作 (Single Primary Action)**：
   整页只允许至多一个实心背景主按钮（如首页「进入 3D 太阳系漫游」、扩展页「下载汉化扩展包」），其余次级操作与导航一律采用文字链接、文字标签或图标链接，杜绝视觉重心抢夺。
4. **去盒子化 (Unboxed Minimalist UI)**：
   全面移除容器的厚重深色背景、描边边框与大发光阴影。摒弃“卡片套卡片”的容器感，采用纯色背景与大留白建立呼吸感。
5. **留白分层 (White Space & Rhythm)**：
   通过标准间距阶梯（4 / 8 / 16 / 24 / 48 / 96px）与顶部 1px 细线、左上角 24px×2px 微型指示线建立视觉分区，让信息层级自然浮现。

---

## 二、设计令牌 (Design Tokens)

全部令牌真实读取自 [`assets/css/main.css`](../assets/css/main.css) 的 `:root` 与全局样式规则，不存在脱离代码的虚假定义。

### 1. 颜色系统 (Color Palette)

| CSS 变量名 | 真实取值 | 语义与用途 | WCAG 对比度（基于 #030712） |
| :--- | :--- | :--- | :--- |
| `--bg` | `#030712` | 全站全局深黑背景色 | 基准底色 |
| `--bg-soft` | `#0b1120` | 次级微暗背景色（下拉菜单、浮动导航） | - |
| `--panel` | `#0d1424` | 内部结构底层色 | - |
| `--fg` | `#f3f4f6` | 一级主文本（标题、重要正文、高亮数据） | **18.30:1**（CSS 注释标称 `~16:1`，远超 AAA 7:1） |
| `--fg-dim` | `#9ca3af` | 二级文本（正文说明、次要描述、属性文本） | **7.93:1**（CSS 注释标称 `~7.3:1`，满足 AAA 7:1） |
| `--fg-muted` | `#8b949e` | 三级文本（小节分区标记、单位、数据来源注释） | **6.55:1**（CSS 注释标称 `~5.6:1`，满足 AA 4.5:1） |
| `--accent` | `#38bdf8` | 核心唯一强调色（深空天蓝，链接与焦点环） | **9.40:1**（CSS 注释标称 `~9.3:1`，满足 AAA 7:1） |
| `--accent-hover` | `#7dd3fc` | 强调色悬浮态高光 | **12.44:1** |
| `--ok` | `#34d399` | 状态成功 / 在线绿色 | **11.45:1**（满足 AAA 7:1） |
| `--warn` | `#f87171` | 状态告警 / 警告红色 | **6.52:1**（满足 AA 4.5:1） |
| `--line` | `rgba(255, 255, 255, 0.08)` | 常规分隔线 | 细致低噪 |
| `--line-subtle` | `rgba(255, 255, 255, 0.06)` | 次级微弱指示线、数据条顶部细线 | 极致降噪 |

#### 页面主题色 (`--page-tint`) 使用规范
- **允许使用范围**：仅用于特写专题页的小尺寸短指示线（`.text-block-swatch`）、旗舰卡片指示线（`.flagship-swatch`）以及极小范围的数值强调（`.stat-highlight`）。
- **禁止使用范围**：严禁作为大面积背景、实心卡片底色或全局背景渐变。
- **特写页实际取值**：
  - 火星 (`mars.html`): `--page-tint: #ea580c;`（火星赤褐橘红）
  - 韦伯望远镜 (`jwst.html`): `--page-tint: #0284c7;`（深空湛蓝）
  - 土星 (`saturn.html`): `--page-tint: #ca8a04;`（土星光环暗金）
  - 旅行者 1 号 (`voyager-1.html`): `--page-tint: #2dd4bf;`（星际青绿）
  - 默认/兜底：`var(--accent, #38bdf8);`

### 2. 间距阶梯 (Spacing Scale)

```css
--space-1: 4px;   /* 极小微距：图标与文字间隙、徽标内边距 */
--space-2: 8px;   /* 小间距：小标签、按钮内边距 */
--space-3: 16px;  /* 中间距：段落下方留白、小节内部元素间隙 */
--space-4: 24px;  /* 大间距：容器水平内边距、区块间距 */
--space-5: 48px;  /* 结构间距：小节之间垂直间隙 */
--space-6: 96px;  /* 巨型留白：Hero 头部与首屏沉浸留白 */
```

### 3. 圆角、尺寸与模糊 (Radii, Dimensions & Blur)

```css
--r: 8px;         /* 标准全局圆角（视窗、按钮、抽屉） */
--maxw: 1200px;   /* 内容区域最大限制宽度 */
--blur: 16px;     /* 毛玻璃背景滤镜模糊半径 */
```

### 4. 字体栈 (Font Stacks)

- **无衬线字体**：
  `--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;`
- **等宽代码字体**：
  `--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;`

### 5. 动效与无障碍时长

- **标准过渡**：`--transition: 0.18s ease;`（所有交互动效严格控制在 $\le 200\text{ms}$，干脆利落不拖泥带水）。
- **动效减弱偏好**：全局监听 `@media (prefers-reduced-motion: reduce)`，命中时完全禁用星空微动动画、抽屉平移动画与渐变过渡。

---

## 三、组件清单与规范用法 (Components & Usage)

### 1. 顶部导航与「更多」下拉菜单 (`.site-header`, `.nav-dropdown`)

- **规范**：极简粘性半透明顶栏，高度 60px。包含品牌 Logo、主导航链接及「更多」下拉菜单。
- **无盒子与无发光**：下拉层采用 `#0b1120` 平滑底色与 `1px solid var(--line)` 细边线，无彩色发光外描边。
- **可访问性与键盘导航**：
  - 按钮支持 `Enter` / `Space` / `ArrowDown` 展开并自动聚焦首个子项；
  - 子菜单内支持 `ArrowDown` / `ArrowUp` 循环切换选项；
  - 按 `Esc` 键立即可退出下拉菜单并将焦点还原回「更多」按钮；
  - `Tab` 键离开时自动平滑关闭；
  - 移动端（$\le 840\text{px}$）下拉项直接平铺于折叠菜单内。

```html
<div class="nav-item">
  <button class="nav-dropdown-btn" aria-haspopup="true" aria-expanded="false">
    <span>更多</span>
    <svg class="nav-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4.5l3 3 3-3"/></svg>
  </button>
  <div class="nav-dropdown">
    <a href="extension.html">浏览器汉化扩展</a>
    <a href="guide.html">操作技巧指引</a>
    <a href="about.html">关于与合规</a>
  </div>
</div>
```

### 2. 主按钮 (`.btn-primary`)

- **规范**：整页唯一实心按钮。天蓝底色加纯黑粗体字，点击热区 $\ge 44\text{px}$，无阴影无浮夸变形。

```html
<a class="btn-primary" href="extension/eyes-zh-extension.zip" download>
  下载汉化扩展包 (.zip)
</a>
```

### 3. 文字链接与出处链接 (`a`, `.lede-link`)

- **规范**：天蓝色文字，无默认下划线；页头导言出处链接采用灰色小字加右上箭头 `↗`。

```html
<a href="about.html#sources" class="lede-link">数据说明 ↗</a>
```

### 4. 文字视角标签 (`.view-tabs`, `.view-tab-btn`)

- **规范**：横向无滚动条单行排列。激活态使用纯白粗体加底部 2px 强调色指示线，未激活态使用灰色无边框文字，触控高度 $\ge 44\text{px}$。

```html
<div class="view-tabs" id="view-buttons">
  <button type="button" class="view-tab-btn" data-route="saturn" aria-pressed="true">土星本体与光环全景</button>
  <button type="button" class="view-tab-btn" data-route="titan" aria-pressed="false">土卫六泰坦 (Titan)</button>
</div>
```

### 5. 短指示线文字块卡片 (`.text-block`)

- **规范**：去盒子核心结构。无背景卡片，顶部配备 24px×2px 主题色短指示线（`.text-block-swatch`），小标题采用 16px 纯白粗体，正文采用灰色文字。

```html
<div class="col-grid cols-3">
  <article class="text-block">
    <div class="text-block-swatch"></div>
    <h3 class="text-block-title">99% 纯净水冰构成</h3>
    <p class="text-block-content">土星光环由数以万亿计的冰块和碎石组成，在阳光照射下反射出璀璨光彩。</p>
  </article>
</div>
```

### 6. 数据条 (`.stat-row`, `.stat-col`)

- **规范**：用于核心物理参数。去卡片化，每列上方带 1px 极细微弱分割线，主数值采用纯白超大字体，辅以紧凑单位与灰色说明。

```html
<section class="stat-row">
  <div class="stat-col">
    <div class="stat-num">293<span class="stat-unit">颗</span></div>
    <div class="stat-desc">截至 2026 年 8 月 IAU/NASA 认证天然卫星数量</div>
  </div>
</section>
```

### 7. 可折叠区域 (`details.tech-notes`)

- **规范**：技术细节、开发者信息、底层接口说明一律采用 `<details>` 折叠，保持首屏安静。

```html
<details class="tech-notes">
  <summary>查看技术来源与瓦片机制</summary>
  <p>地形瓦片由官方服务按需流式加载，引导正文取自客户端应用。</p>
</details>
```

### 8. 3D 加载遮罩与超时兜底 (`.stage-overlay`)

- **规范**：初始显示居中脉冲点与提示文案；超过 11 秒未加载完成自动切换至优雅兜底卡，提供「重试」与「在 NASA 官方站点打开 ↗」双通道。

```html
<div class="stage-overlay">
  <div class="stage-loading-box">
    <div class="stage-pulse-dot"></div>
    <div class="stage-loading-text">正在载入 NASA 3D 视图…</div>
  </div>
  <div class="stage-recovery" style="display:none">
    <div class="stage-error-text">3D 视图加载较慢，可重试或在 NASA 官方站点打开</div>
    <div class="stage-error-actions">
      <button class="btn-stage-retry" type="button">重试</button>
      <a class="stage-link-official" href="https://eyes.nasa.gov/apps/solar-system/" target="_blank" rel="noopener">在 NASA 官方站点打开 ↗</a>
    </div>
  </div>
</div>
```

### 9. 抽屉菜单 (`.explore-drawer`)

- **规范**：天体目录与搜索采用覆盖式侧栏抽屉，避免挤占 3D 视口桌面空间。点击遮罩或按 `Esc` 键收起并还原焦点。

```html
<div class="drawer-backdrop" id="drawer-backdrop"></div>
<aside id="explore-drawer" class="explore-drawer" aria-label="天体与航天器目录" aria-hidden="true" inert>
  <div class="drawer-header">
    <span class="drawer-title">天体与航天器目录</span>
    <button type="button" id="drawer-close-btn" class="drawer-close-btn" aria-label="关闭天体列表 (Esc)">✕</button>
  </div>
  <div class="drawer-body">...</div>
</aside>
```

### 10. 页脚 (`.site-footer`)

- **规范**：极简降噪声明行，灰色小字居中，包含 NASA/JPL 非官方科普免责声明与官方数据驱动链接。

```html
<footer class="site-footer">
  <div class="wrap footer-wrap">
    <p class="footer-text">
      深空之眸为独立开源非官方科普项目，与 NASA 及 JPL 无官方隶属或商业背书关系。3D 天体轨道与空间数据基于 <a href="https://eyes.nasa.gov/apps/solar-system/" target="_blank" rel="noopener">NASA/JPL Eyes on the Solar System</a> 官方模型在客户端 WebGL 实时驱动解算。
    </p>
  </div>
</footer>
```

---

## 四、设计禁用清单 (Prohibited Practices)

为保持全站严谨科学质感与极致宁静的设计语言，全站严禁出现以下元素：

1. **禁用 Emoji 装饰**：
   正文与标题中严禁使用 🪐、🚀、🔴、✨、🔭 等装饰性表情符号。仅允许界面功能性符号（汉堡菜单 `☰`、关闭 `✕`、跳转指示 `➔`、`↗`）。
2. **禁用发光特效与复杂渐变**：
   禁止文字多层霓虹发光（`text-shadow: 0 0 10px ...`）、外描边发光（`box-shadow: 0 0 ... var(--glow)`）与彩色渐变背景。
3. **禁用彩色胶囊标签**：
   禁止红绿橙紫等多色彩圆角胶囊药丸标签。状态一律使用透明底色、低对比度灰色细框或纯文字注释。
4. **禁用厚重盒子卡片**：
   禁止使用高不透明度深色实心背景卡片、厚描边与卡片嵌套，杜绝“盒子套盒子”。
5. **禁用蓝色竖条小节标题**：
   禁止在 `h2` 标题前使用彩色竖条装饰（`h2::before` 已设为 `display: none !important;`）。小节标题一律使用 13px 灰色大写字母分区标记。
6. **禁用多实心主按钮**：
   禁止同屏堆叠多个高对比度实心主按钮。一个页面只允许一个主动作。
7. **禁用开发术语污染用户界面**：
   禁止在对普通用户公开的界面中出现内部数据字段（`descriptions/`、`blurb`、`slug`、`entities.en.json`、`SOP`、`app.js`、`跨域限制`）。

---

## 五、新增页面与版本发布检查清单 (Checklist)

开发或改造任何新页面时，必须完成以下 7 项基准检查：

1. [ ] **色彩对比度 (WCAG AA/AAA)**：
   白色主文本对比度 $\ge 15:1$；灰色正文 `--fg-dim` 对比度 $\ge 7:1$；辅助说明 `--fg-muted` 对比度 $\ge 4.5:1$；强调色 `--accent` 对比度 $\ge 9:1$。
2. [ ] **触控热区合规**：
   所有按钮、文字标签、链接、输入框、折叠 `<summary>` 的可点击高度与宽度必须 $\ge 44\text{px}$（满足 WCAG 2.5.5）。
3. [ ] **键盘与可访问性**：
   支持全流程 `Tab` 键可达，`:focus-visible` 焦点环清晰可辨；支持 `Esc` 键退出覆盖层并自动将焦点归还给触发元素；避免键盘陷阱。
4. [ ] **动效偏好偏离支持**：
   必须适配 `prefers-reduced-motion: reduce`，在用户开启减弱动效时，Canvas 星空动画停止位移，侧栏抽屉取消过渡动画。
5. [ ] **多视口排版与防溢出**：
   在 **375px**（移动竖屏）、**768px**（平板竖屏）、**1440px**（宽屏桌面）三个标准断点下，均满足 `scrollWidth <= clientWidth`，绝对禁止任何横向滚动条或页面切角。
6. [ ] **长文阅读行宽**：
   科普指南、合规说明与长篇文本页面必须保持正文行宽 $\le 70\text{ch}$，标题与简介避免出现单字孤字成行（`text-wrap: balance`）。
7. [ ] **SEO 与社交分享**：
   每个页面必须完整具备标准 `<title>`、`<meta name="description">`、`<link rel="canonical">`、完整的 `og:*`（title, desc, type, url, image）以及 `twitter:*`（card, title, desc, image）。
8. [ ] **版本号一致性与回归执行**：
   全站所有 HTML 页面中引用的 CSS/JS 资源统一带上最新 `?v=<version>` 防缓存参数；在提交前必须全部通过：
   - `node tools/audit-keyboard-focus.mjs`
   - `node tools/audit-seo.mjs`
   - `node tools/audit-full-12-pages.mjs`
   - `node tools/scan-residuals.mjs`
   - `node tools/lint-zh.mjs`
   - `node tools/test-stories.mjs`
   - `node tools/check-all-links.mjs`
   - `node tools/verify-phase4-qa.mjs`
   - `node tools/verify-phase5-qa.mjs`
