# NASA Eyes on the Solar System 中文本地化 —— 第一阶段技术调查报告

调查日期：2026-10-11
调查对象：`https://eyes.nasa.gov/apps/solar-system/#/home`
方法：真实 HTTP 取证（带浏览器 UA 的 curl）+ 无头 Chrome（CDP，SwiftShader WebGL）+ 页面内脚本实测。
本报告每一条结论都标注了取证方式；未实测的内容一律不写入。

---

## 一、实际网站结构与技术证据

### 1.1 站点可访问性与安全头

```
GET https://eyes.nasa.gov/apps/solar-system/
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 3071
Server: AmazonS3
Strict-Transport-Security: max-age=31536000; includeSubdomains; preload
Access-Control-Allow-Origin: *
（无 X-Frame-Options）
（无 Content-Security-Policy）
```

- 页面由 CloudFront + S3 静态托管，**响应头中不存在 `X-Frame-Options`，也不存在 `Content-Security-Policy`**。
- HTML 外壳仅 3071 字节，不含任何 `<canvas>`；界面与 3D 场景全部由 JS 在运行时构建。
- 外壳关键节点：`#pioneer`、`#ui > #static-ui / #dynamic-ui`、`#loading-screen`、`#embed-overlay`。
- 脚本：`config.js` / `commons.js` / `preload.js`（130 KB）/ `vendors.js`（2.5 MB）/ `app.js`（1.74 MB）。
- `config.js` 实际内容只有两个字段：

```js
config = {
  staticAssetsUrl: 'https://eyes.nasa.gov/assets/static',
  dynamicAssetsUrl: 'https://eyes.nasa.gov/assets/dynamic'
}
```

### 1.2 3D 场景渲染机制（实测）

在页面内执行脚本读取运行时结构：

```json
{ "canvasCount": 1,
  "pioneerChildren": "<canvas data-engine=\"three.js r185\" ...></canvas>
                      <div><div id=\"main-viewport\" class=\"viewport\">…
                           <div id=\"left-viewport\" class=\"compare-viewport\">…
                           <div id=\"right-viewport\" class=\"compare-viewport\">…" }
```

- 渲染引擎为 **Three.js r185，单张 WebGL canvas**，挂在 `#pioneer` 下。
- 存在三个视口：`main-viewport` 与对比模式用的 `left-viewport` / `right-viewport`。
- 自研引擎在 bundle 中命名为 `Pioneer`（`window.Pioneer`、`window.PioneerScripts`、`app._pioneer`）。
- 资源按瓦片流式加载：`assets/dynamic/dynamo/<body>/orb|ori/`（轨道/姿态）、`assets/dynamic/cmts/<body>/color|normal|height/…`（地表瓦片）、`assets/static/maps|stars|sprites|models/`。
- 浏览器标签页处于后台时 `requestAnimationFrame` 被节流，加载会**停滞**（实测：内置无表面浏览器等待 120 s 未完成；无头 Chrome 正常完成）。这解释了"打开就卡住"的现象，与网络无关。

### 1.3 文字来源：DOM 还是渲染层？（本项目最关键的发现）

对加载完成的页面做全量 DOM 普查：

```json
{ "totalDomNodes": 618, "canvasCount": 1, "labelDivs": 11,
  "visibleTextNodes": 27 }
```

3D 场景中的天体/航天器名称**不是贴图文字，而是 DOM 元素**：

```html
<div class="pioneer-label-div no-select earth planet clickable"
     style="position: absolute; translate: 792px 362px;">
  <span class="icon no-icon"></span><span class="text">Earth</span>
</div>
```

实测首页可见标签全集（class 即稳定键名）：

| class 键 | 英文 | class 键 | 英文 |
|---|---|---|---|
| `sun star` | Sun | `sc_voyager_1` | Voyager 1 |
| `mercury planet` | Mercury | `sc_voyager_2` | Voyager 2 |
| `venus planet` | Venus | `sc_pioneer_10` | Pioneer 10 |
| `earth planet` | Earth | `sc_pioneer_11` | Pioneer 11 |
| `mars planet` | Mars | `sc_europa_clipper` | Europa Clipper |
| `jupiter planet` | Jupiter | `sc_juice` | Juice |
| `saturn planet` | Saturn | `sc_lucy` | Lucy |
| `uranus planet` | Uranus | `sc_new_horizons` | New Horizons |
| `neptune planet` | Neptune | `sc_osiris_rex` | OSIRIS-APEX |
| `moon` | Moon | `sc_parker_solar_probe` | Parker Solar Probe |
| `ganymede moon` | Ganymede | `sc_biosentinel` | BioSentinel |
| `triton moon` | Triton | `sc_psyche` | Psyche |
| `milky_way galaxy` | Milky way | `sc_stereo_ahead` | STEREO Ahead |
| `observable_universe` | Observable universe | `c_2025_n1 comet` | 3I/ATLAS (C/2025 N1) |

**只有 3D 本体、环系、轨道线、尾迹、星空、地表纹理在 WebGL 里；所有可读文字都在 DOM 里。**

详情面板、时间轴、菜单、嵌入对话框同样全部是 DOM（见 §1.6 的 173 条实测字符串）。

### 1.4 汉化可行性核心实验：改写标签后是否被应用覆盖回去

这是决定方案 A 成败的测试。做法：把 10 个行星标签文字改成中文，静置 6 秒，再模拟滚轮缩放，然后复查。

```json
{ "afterApply":  ["太阳","水星","金星","地球","火星","木星","土星","天王星","海王星", …],
  "after6s":     ["太阳","水星","金星","地球","火星","木星","土星","天王星","海王星", …],
  "afterZoom":   ["太阳","水星","金星","地球","火星","木星","土星","天王星","海王星", …],
  "mutationCountIn6s": 12,
  "stillChinese": 10 }
```

结论：
- **改写后 6 秒与缩放交互后，中文全部保留，未被应用回写。** 应用只更新标签的 `translate` 坐标，不重写 `textContent`。
- 6 秒内的 12 次 mutation 全部是我自己的写入。
- 新标签会被**动态创建**（`Triton`、`3I/ATLAS` 在 6 秒后才出现），因此翻译层必须挂 `MutationObserver` 捕获新增节点。

### 1.5 官方是否有国际化 / 多语言机制

逐项排查，结论是**没有任何应用级 i18n**：

| 关键字 | app.js 中出现次数 | 判定 |
|---|---|---|
| `i18n` | 0 | 无 |
| `localization` | 0 | 无 |
| `setLanguage` | 0 | 无 |
| `translat` | 98 | 全部是 CSS `transform: translate…`，与翻译无关 |
| `navigator.language` | 0 | 从不读取浏览器语言 |
| `documentElement.lang` | 0 | 无 |
| `zh-CN` | 4 | 均来自 **moment.js 的 locale 懒加载分包表**（`./zh-cn.js":377`），非本应用文案 |
| `language` | 1 | 旅行者金唱片介绍正文里的 "greetings in 55 languages" |

界面字符串以英文字面量硬编码在 `app.js` 中。天体名称与简介来自数据文件，见下。

### 1.6 界面字符串与实体数据的真实来源

**实体库**（运行时从 `window.app._entityInfo` 导出，共 **719** 个条目，稳定 slug 主键）：

```
Moon 451 · Spacecraft 169 · Asteroid 53 · Comet 11 · Planet 8 · Dwarf Planet 7
Landing site 7 · Instrument 5 · Lagrange Point 2 · Star 1 · Galaxy 1 · Universe 1
Vehicle 1 · Human 1 · Building 1
```

每条结构仅含 `id / iauName / category / subcategory / keywords`，129 条另有 `displayName` 或 `altName`。
导出件：`research/entities_all.json`。

**天体与航天器简介**是逐条公开 JSON（实测 93/95 命中，`sc_spitzer_space_telescope`、`sc_viking_1` 返回 403）：

```
GET https://eyes.nasa.gov/apps/solar-system/descriptions/mars.json   → 200
{"title":"Mars","description":{"blurb":"The fourth planet from the Sun, Mars is a
 dusty, cold, desert world with a very thin atmosphere.","more":"…"},
 "exploration":{"initial":[{"url":"sc_iss","title":"…","info":"1998-Present"}]}}
```

同类目录还有 `events/`、`stories/`（见 bundle 中 `setFolders({description:"descriptions/",event:"events/",stories:"stories/"})`）。
注意 `saturn.json` 含模板占位符 `##moon_count##`，说明文案在运行时被替换，**不能整篇静态搬运**。
导出件：`research/nasa_descriptions_en.json`。

**界面字符串实测清单**（点开右侧工具条全部按钮后采集：173 条可见文本 + 92 条 `aria-label/title/data-tippy-content`）。节选：

- 顶栏：`Eyes on the Solar System`、`Share`、`Menu`、面包屑
- 右侧工具条提示：`Show info panel`、`Toggle layers`、`Toggle between metric and imperial units`、`Show or hide UI`、`Zoom in`、`Zoom out`、`Toggle light modes`、`Toggle auto camera`、`Toggle fullscreen`、`Show or hide settings`
- 图层面板：`Layers`、`User Interface`、`Planets`、`Asteroids`、`Dwarf Planets`、`Constellations`、`Trails`、`Orbits`、`Labels`、`Icons`
- 光照：`Flood Lighting`、`Shadow Lighting`、`Natural Lighting`
- 详情面板：`Info`、`Toolbox`、`View Options`、`Planet`、`Description`、`More`、`Related`、`External Story`
- 时间轴：`LIVE`、`real rate`、`Drag time slider thumb`、`Expand/Collapse time controls`、`Pause or play`、`Increase/Decrease time rate`、`Return to real time speed`、`Reset time to live.`、`hour`
- 主菜单：`Featured Stories and Events`、`Stories`、`Planets & Moons`、`Dwarf Planets & Asteroids`、`Comets`、`Spacecraft`、`most popular`
- 新手引导：`Your Solar System`、`Real-time, Real data`、`Eyes on the Solar System!`、`Here are some tips to get you navigating around the solar system quickly.`、`Time controls.`、`Moving around objects.`、`Zoom in and out.`、`Free-fly mode.`、`Telescope mode.`、`Surface layers.`、`Menu and search.`、`Stories.`、`Settings.`、按键 `W/A/S/D`、`A/D`、`Q/E`、`Z/C`、`SHIFT`、`K`、`Click on any label`
- 会话：`Starting experience...`、`This session has ended`、`START OVER`、`CONTINUE`、`TOUCH TO START`、`Time left:`
- 嵌入对话框：见 §1.7

导出件：`research/harvest_mars.json`。

### 1.7 官方 iframe 嵌入是**产品自带功能**，不是侧门

站点右上角 `Share → Embed` 就是官方嵌入代码生成器。实测其输出：

```html
<iframe src="https://eyes.nasa.gov/apps/solar-system/#/home" allowfullscreen ></iframe>
```

官方"Embed Options"面板暴露的开关（DOM 实测 input id 即 URL 参数名）：

```
interactPrompt featured detailPanel logo search shareButton menu
collapseSettingsOptions hideFullScreenToggle collapseTimeControls timeControls
locked hideExternalLinks surfaceMapTiling hd orbiters landers majorMoons
minorMoons heliosphere lighting flood|natural|shadow
forceRestart maxSessionTime maxInactivityTime spout
```

`paramsToKeep`（bundle 原文）：
`["time","rate","slide","followId","trajectory","hideExternalLinks","locked","search","menu","timeControls","hideFullScreenToggle"]`

### 1.8 URL 深层链接实测（全部通过）

路由表（bundle 原文 `addRoutes([...])`）：

```js
homeRoute            → view "home"
/story/:id           → story
/:spaceObject        → object
/:spaceObject/compare→ compare
/:spaceObject/telescope → telescope
/:spaceObject/distance  → distance
/:spaceObject/:feature  → feature
/:spaceObject/events/:child → event
/:spaceObject/:feature/:child → object
```

时间参数格式（bundle 原文 `_dateFormats.utc.url`）：`YYYY-MM-DDTHH:mm:ss.SSSZ`

实测结果：

| 请求 URL | 实测结果 |
|---|---|
| `#/mars` | `document.title` → `Eyes on the Solar System - Mars - NASA/JPL`；面包屑出现 `Mars`；`mars` 标签获得 `selection` class |
| `#/mars?time=2026-08-30T00:00:00.000Z&rate=3600` | 时钟显示 `Aug 30, 2026`，速率显示 `1 hr/s` |
| `#/saturn?menu=false&featured=false&logo=false&shareButton=false&search=false&detailPanel=false&interactPrompt=false&hd=true&lighting=natural&rate=3600` | NASA logo / Share / Menu / 搜索 / 精选故事 / 详情面板全部消失；土星与卫星标签正常渲染 |

**结论：中文站可以用 URL 参数构造"干净画布"，并用中文导航驱动跳转。**

### 1.9 独立网站能否访问嵌入页面的内部内容（方案 B 的硬限制）

在 `http://127.0.0.1:8899/embed_probe/index.html` 中放入指向 NASA Eyes 的 iframe，实测回报：

```
[load] iframe load event fired
contentDocument      -> null (cross-origin blocked silently)
contentWindow.location -> THREW: SecurityError
iframe rect = 1600x738
```

截图证据 `research/embed_probe_result.png`：火星 3D 视图、详情面板（Mars / Planet / Description / Read More / Related）、轨道器与着陆点标签、时间轴 `OCT 04, 2026 · 1 HR/S` 全部正常渲染。

- ✅ 嵌入**可用**，WebGL、交互、深层链接、参数全部生效。
- ❌ 父页面**完全无法读取或改写** iframe 内 DOM（`contentDocument` 为 `null`，访问 `location` 抛 `SecurityError`）。
- 因此：**方案 B 对模拟器自身界面的汉化覆盖率 = 0%。** 残留英文（面包屑 `Saturn`、卫星标签 `Enceladus/Dione/Mimas/Tethys/Rhea`、`LIVE`、`OCT 14, 2026`、`1 HR/S`、右侧工具条）无法由宿主页面消除。

### 1.10 许可与开源状态（不猜测）

- 在 `app.js`（1.74 MB）中检索：`github.com` **0** 次、`open source`/`opensource` **0** 次、`license` **0** 次、`terms of use` **0** 次、`public domain` **0** 次。
- 页面 `<meta name="robots" content="noarchive">`。
- bundle 内出现的第三方/官方链接仅为：`ssd.jpl.nasa.gov`、`cneos.jpl.nasa.gov`、`trek.nasa.gov/tiles/...`、`www.nasa.gov/planetarydefense/overview`、`epsg.io`、一个 YouTube embed、一个 Unreal Engine SIGGRAPH 讲义 PDF。

**判定：本次调查未找到任何允许再分发 NASA Eyes 程序或素材的许可声明。因此不得声称 NASA 软件本体已开源，不得抓取或镜像其 JS/模型/纹理资源。方案 C 的"自研 3D 层"若依赖 NASA 资源即不可行；若完全自研则违反"不要从零重新开发行星动力学或 3D 引擎"的约束。**

---

## 二、三种汉化方案可行性比较

| 维度 | A：浏览器扩展页内注入 | B：独立站 + 官方 iframe | C：独立中文交互层 |
|---|---|---|---|
| 3D 功能保真 | 100%，不改动引擎 | 100%（官方 iframe） | 需自建引擎 → 违反约束 |
| 天体/航天器标签汉化 | ✅ 已实测可持久改写 | ❌ 跨域不可达 | ✅ |
| 菜单/详情/时间轴/引导汉化 | ✅ 全部 DOM，可译 | ❌ | ✅ |
| 简介正文汉化 | ✅ 可替换 `descriptions/*.json` 渲染结果 | ❌ | 需再分发 NASA 文本 → 许可未确认 |
| 可部署为公开网站 | ❌ 需用户手动装扩展 | ✅ GitHub Pages | ✅ |
| 使用门槛 | 中（加载解压缩扩展） | 低（打开网址即可） | 低 |
| NASA 改版风险 | 高：依赖 class 名与字符串 | **低**：仅依赖公开 URL 契约 | 无 |
| 维护成本 | 中（词典 + 选择器需跟进版本） | 低（只有外壳） | 极高 |
| 合规风险 | 低（用户本地渲染改动，不再分发资源） | 低（官方支持的嵌入） | 高（资源再分发） |
| 覆盖不到的部分 | WebGL 内的图形文字（实测无）、NASA logo 图、`##moon_count##` 类动态模板需特殊处理 | 模拟器内**全部**英文；无法注入 CSS 之外的样式 | — |

### 建议：A + B 双轨，共用一份术语数据

理由（全部基于上面的实测事实）：

1. 用户目标 2「界面尽可能翻译成简体中文」与目标 5「部署到 GitHub Pages」在单方案下**互斥**：只有 A 能译界面（§1.3、§1.4），只有 B 能公开托管（§1.9）。
2. 因此把它们拆成互补交付物：**B 做中文门户 + 官方嵌入 + 中文资料层**；**A 做"完全汉化"增强**，由 B 站点引导安装。
3. A 的汉化能力已被 §1.4 的实验直接证明，不是推测。
4. C 明确否决：既无再分发许可证据（§1.10），又与"不要自研引擎"冲突。

### 需要用户确认的技术限制（不隐瞒）

- **纯静态网站无法汉化模拟器内部界面。** 若只交付 B，用户在 3D 视图里看到的仍是英文标签与英文面板。
- 扩展 A 无法通过 GitHub Pages 一键安装，Chrome/Edge 均需"加载解压缩的扩展"手动步骤；Edge 还需开启"允许来自其他商店的扩展"以外的本地加载选项。
- 扩展 A 依赖 NASA 页面的 class 名（`pioneer-label-div`、`<body>` 类）与英文字面量。NASA 改版会失效，需要维护。已选择**以 class 键名为主键、英文字面量为兜底**的双通道匹配来降低脆弱性。

---

## 三、中文界面覆盖范围（方案 A 实测可译清单）

| 区域 | 具体项 | 状态 |
|---|---|---|
| 3D 标签 | 719 个实体 id → 中文；首批覆盖 太阳/8 行星/7 矮行星/30 主要卫星/11 彗星/重点小行星/7 着陆点/约 90 航天器 | 部分，其余保留英文并标记 |
| 顶栏 | 标题、Share、Menu、面包屑 | 可译 |
| 主菜单 | 分类标题、精选故事、搜索提示 | 可译 |
| 详情面板 | Info/Toolbox/View Options、Description、More、Related、External Story、正文 | 可译 |
| 图层/工具条 | Layers、User Interface、Planets、Trails、Orbits、Labels、Icons、光照三档、全部 `aria-label` | 可译 |
| 时间轴 | LIVE、real rate、按钮提示、日期时间格式（**不改动数值**，仅改 `am/pm` 等词） | 可译 |
| 新手引导 | 全部提示语与按键说明（按键字母保留原文） | 可译 |
| 嵌入对话框 | Embed Options 全部标签与说明 | 可译 |
| 页面标题 | `document.title` | 可译 |

**无法汉化 / 不处理**：
1. WebGL 内部的图形化文字 —— 实测该场景内不存在此类文字，故无此项损失。
2. NASA 徽标、`EYES ON THE SOLAR SYSTEM` 品牌字样（属机构标识，按品牌规范**不应**翻译或改写）。
3. `##moon_count##` 等运行时模板占位符 —— 需保留占位符本身，只译周围文字。
4. 数字、日期、距离、单位 —— 按需求保持不变，不做本地化重排。
5. 无规范译名的小天体与冷门航天器（451 颗卫星中的多数、169 个航天器中的任务代号如 `TDRS-10`、`CYGNSS 3`）—— 保留原文并标记 `untranslated`。

---

## 四、最小可用版本开发计划

| 步 | 内容 | 验收 |
|---|---|---|
| 1 | 术语数据层：`data/names.zh.json`（id→中文+状态）、`data/ui.zh.json`（英文界面串→中文）、`data/bodies.zh.json` / `data/missions.zh.json`（译自官方 JSON，附来源 URL） | 每条含 `status` 与 `source`；无来源不写 |
| 2 | 中文门户（纯静态、无构建）：首页、探索、天体、任务、术语对照、操作指南、关于 | 6 页可导航，标注"非官方中文项目" |
| 3 | 嵌入区：按 §1.8 实测参数生成干净 iframe；中文快捷导航驱动 `#/id` 跳转；保留原始 NASA 入口 | 无头 Chrome 截图确认渲染 |
| 4 | 扩展 A：Manifest V3 + `MutationObserver`，class 键名优先、英文字面量兜底；`pack-extension.mjs` 复用同一份词典 | §1.4 同类持久性实验通过 |
| 5 | 本地验证：无头 Chrome 截图（门户各页 + 扩展汉化后的 NASA 页）+ Edge 兼容性检查 | 见 README 测试结果表 |

---

## 五、实现后的实测结果（2026-10-11 补充）

最小可用版本落地后，在同一套无头 Chrome 环境下复测：

**门户站点**：8 个页面全部正常；官方 3D 场景在嵌入区完整渲染；中文侧栏跳转、
官方嵌入参数、深层链接与时间/速率参数全部生效。证据 `shots/site_*.png`。

**汉化扩展**（在官方页面内注入同一份 `content.js` 实测）：

| 范围 | 汉化率 |
|---|---|
| 3D 场景标签 | 97.6%（40/41）——唯一漏项 `BioSentinel` 无中文条目，按规则保留英文 |
| 右侧工具条 / 悬停提示 | 100%（47/47） |
| 主菜单条目 | 74.4%（32/43）——余量为品牌名、计数数字与官方专题标题 |
| 详情面板 / 官方简介正文 / 页面标题 / 时间轴 | 全部生效；日期数值按规则保持原样 |

实现过程中由测试暴露并修掉的真实缺陷（非推测）：

1. 官方把悬停提示写进 `aria-label` 时加了 `Help: ` 前缀，与 `data-tippy-content` 的裸文本不是同一个串 → 需要前缀剥离。
2. 类别词（`Planet` → 行星）只存在于实体库的 `category` 字段，界面词典覆盖不到 → 增加最低优先级的类别映射，
   并让实体名优先，避免 `Moon` 被误译成"卫星"。
3. 英文同名歧义（`Psyche` 既是小行星又是航天器）→ 反查索引遇到冲突键时主动放弃该英文名。
4. `详情面板` 的"阅读更多"按钮把标签拆成裸文本节点与 `<span>`，且应用会替换该文本节点，
   导致整串匹配永久失效 → 按实测 DOM 结构对该按钮做定向处理。

**排查过程中的一次重要自我纠正**：嵌入区一度停在 `LOADING` 约 15–40%，最初怀疑是 iframe 方案本身有问题。
对照实验（同一时刻直接顶层打开官方站点）出现同样停滞，且网络探针显示 1.7 MB 资源 2.6 秒返回，
最终定位为**复用的 Chrome `--user-data-dir` HTTP 缓存被污染**；全新 profile 下官方站点与本站嵌入均完整渲染。
另注：`--virtual-time-budget` 会冻结真实网络等待，用于此类测试会产生假阴性。

**尚未完成**：Edge 桌面端实测，以及以"加载已解压的扩展"方式在真实浏览器中端到端确认一次。

