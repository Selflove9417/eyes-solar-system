# NASA Eyes on the Solar System 中文本地化

面向中文用户的**非官方**太阳系 3D 探索项目。3D 模拟、天体历表与航天器轨迹全部由
[NASA/JPL Eyes on the Solar System](https://eyes.nasa.gov/apps/solar-system/#/home)
官方在线服务实时渲染；本项目不重新实现任何动力学或渲染逻辑，也不托管 NASA 的任何程序或素材。

## 交付内容

两条互补路径，缺一不可：

| | 是什么 | 能汉化什么 | 部署 |
|---|---|---|---|
| **中文门户**（静态站） | 首页 + 官方 iframe 嵌入 + 中文资料层 | 本站全部界面；**模拟器内部 0%**（跨域限制） | GitHub Pages 等任意静态托管 |
| **汉化扩展**（Chrome/Edge） | 在官方页面内替换 DOM 文字 | 模拟器内**全部**文字，含 3D 天体标签 | 用户本地"加载已解压的扩展" |

为什么必须两条：实测该站所有可读文字（包括 3D 场景里的天体名称）都是普通 DOM 元素，
所以页内注入可以完全汉化；而跨域 iframe 的文档在父页面中不可读也不可写
（`contentDocument` 为 `null`，访问 `location` 抛 `SecurityError`），
所以纯静态网站无法汉化嵌入的模拟器。完整证据见
[docs/技术调查报告.md](docs/技术调查报告.md)。

## 启动

### 最简单：双击 `start.cmd`

在资源管理器里双击项目根目录的 `start.cmd`，它会自动起服务并打开浏览器；
若服务已在运行则直接复用，不会因端口占用报错。停止方法：关掉标题为
`NASA Eyes ZH server` 的最小化窗口。

### 手动

无需构建步骤，无依赖，纯静态文件 + Node 自带模块。

```bash
node tools/serve.mjs . 8890
# 打开 http://127.0.0.1:8890/
```

必须用 HTTP 打开：页面使用 ES module 与 `fetch()` 读取 `data/*.json`，
直接双击 `index.html`（`file://`）会被浏览器的同源策略拒绝。

## 部署到 GitHub Pages

仓库根目录即站点根目录，推送后在 *Settings → Pages* 选择分支根目录即可。
所有路径均为相对路径，因此项目站点（`/<repo>/`）同样可用。

## 构建汉化扩展

```bash
node tools/pack-extension.mjs     # -> dist/eyes-zh-extension/
```

词典只有一份：`pack-extension.mjs` 把 `data/names.zh.json` 与 `data/ui.zh.json`
复制进扩展目录，站点与扩展共用同一数据源，不会漂移。

安装步骤见站点内的 `extension.html`，要点：

- Chrome：`chrome://extensions` → 开启开发者模式 → 加载已解压的扩展程序 → 选 `dist/eyes-zh-extension`
- Edge：`edge://extensions` → 开启开发人员模式 → 加载解压缩的扩展 → 选同一目录

## 校验脚本

```bash
node tools/lint-zh.mjs        # 中文条目的英文原文必须与官方存档逐字一致；检查残留英文
node tools/build-events.mjs   # 由抓取到的事件标题生成 data/events.zh.json
node tools/merge-moons.mjs research/wiki_saturn.json ... --write   # 合并维基卫星编号译名
node tools/sync-glossary.mjs data/source/entities.en.json data/names.zh.json --write
node tools/sync-sources.mjs --write   # 用官方存档回填英文字段，杜绝手抄错字
node tools/test-extension.mjs mars    # 在官方页面端到端跑 content.js 并截图
```

官方站点改版时，先跑 `sync-glossary` 找出消失或新增的实体，再跑 `lint-zh` 确认译文完整。

## 目录结构

```
index.html  explore.html  mars.html  jwst.html  saturn.html  voyager-1.html
bodies.html missions.html glossary.html guide.html about.html extension.html
assets/css/main.css          现代深空科技风样式与毛玻璃规范
assets/js/site.js            导航、星空背景微动效、嵌入参数构造
.github/workflows/deploy.yml GitHub Actions Pages 自动部署流程
data/names.zh.json           实体 id -> 中文 + 译名等级（392/719 条）
data/ui.zh.json              界面英文字符串 -> 中文（实测采集）
data/bodies.zh.json          天体中文简介（译自官方，逐条附来源 URL）
data/missions.zh.json        任务中文简介（译自官方，逐条附来源 URL）
data/events.zh.json            任务事件名中文对照（249 条，抓自公开 events JSON）
data/source/entities.en.json 官方实体库快照（719 条，只读基准）
data/source/descriptions.en.json 官方英文简介存档（93 条，只读基准）
extension/                   扩展源文件（manifest + content.js）
tools/                       serve / pack / sync / lint / test
docs/技术调查报告.md          第一阶段全部取证与方案比较
research/                    调查期的探针脚本与原始输出（证据存档）
shots/                       验证截图
```

`research/` 只保留本项目自己编写的探针脚本与采集到的结构化证据。
分析期下载的 NASA 专有文件（`app.js` 等）**不入库**，其取证结论与复现命令记录在
`research/EVIDENCE-NOTE.md`。

## 实时数据：静态站的硬限制（实测）

想做"点开一个航天器看它此刻在哪"，绕不开这条：

| 数据源 | 浏览器跨域可调？ | 证据 |
|---|---|---|
| JPL Horizons（星历、实时距离） | ❌ 否 | `mode:'no-cors'` 能到达（opaque），`mode:'cors'` 直接 `Failed to fetch` —— 服务端不发 `Access-Control-Allow-Origin` |
| api.nasa.gov（APOD / NeoWS / EPIC） | ✅ 是 | 跨域 `status 200` |

所以**实时星历只能在构建期或定时任务里抓**，不能在前端现取。本项目据此提供
`tools/fetch-ephemeris.mjs`：查询 Horizons、换算并写入 `data/live/*.json`，
每个文件带 `asOf` 时间戳与完整出处。建议用 GitHub Actions 每天跑一次并提交。

工具里对每个目标都做了**身份断言**：返回头里必须出现预期的目标名才落盘。
原因是 Horizons 的编号极易张冠李戴——实测 `COMMAND='36'` 是颗小行星（3.58 AU），
旅行者 1 号其实是 `'-31'`（172.01 AU）。猜错编号会安静地给出一个"看起来很合理"的错误数字。

示例页：`voyager-1.html`（旅行者 1 号任务特写）。

## 测试结果

全部在桌面 Chrome 155（`headless=new` + SwiftShader WebGL，1600×900）上实测，截图见 `shots/`。

### 门户站点

| 项目 | 结果 | 证据 |
|---|---|---|
| 8 个页面均可打开、导航正常 | 通过（HTTP 200，中文渲染无乱码） | `shots/site_index.png`、`site_glossary.png`、`site_bodies.png`、`site_guide.png` |
| 官方 3D 场景在嵌入区成功加载 | 通过 | `shots/site_explore_clean.png`（火星渲染完成） |
| 中文侧栏跳转生效、当前项高亮 | 通过 | 同上，`火星 Mars` 处于选中态 |
| 官方嵌入参数生效 | 通过（logo / 菜单 / 分享 / 搜索 / 精选 / 详情面板可分别隐藏） | `research/embed_probe/`、`docs/技术调查报告.md` §1.8 |
| 深层链接 + 时间/速率参数 | 通过（`#/mars?time=…&rate=3600` → 时钟与速率随之改变） | `docs/技术调查报告.md` §1.8 |
| 无遮挡、无错位、可退出 | 通过 | 截图 |

### 汉化扩展（在官方页面内实测）

| 范围 | 汉化率 | 说明 |
|---|---|---|
| 3D 场景标签 | **97.6%**（40/41） | 唯一漏项 `BioSentinel` 未收录中文，按规则保留英文 |
| 右侧工具条 / 悬停提示（`aria-label`） | **100%**（47/47） | 含 `Help: ` 前缀剥离 |
| 主菜单条目 | **74.4%**（32/43） | 余量为品牌名、条目计数数字（按规则不译）与官方专题标题 |
| 详情面板 | 通过 | 信息 / 工具箱 / 视图选项 / 行星 / 简介 / 阅读更多 / 相关 / 外部专题 |
| 官方简介正文 | 通过 | 已译的 23 篇天体 + 40 篇任务简介在页内直接替换英文 blurb |
| 页面标题 | 通过 | `太阳系探索 - 火星 - NASA/JPL（非官方中文）` |
| 时间轴 | 通过 | 实时 / 真实速率 / 下午；**日期 `OCT 11, 2026` 按规则保持原样** |

证据：`shots/extension-mars.png`、`shots/extension-detail-final.png`。
复现：`node tools/test-extension.mjs mars`。

### 测试过程中定位到的两个环境陷阱

1. **复用 Chrome `--user-data-dir` 会污染 HTTP 缓存**，导致 NASA 应用停在 LOADING 约 15–40%。
   排查时一度以为是嵌入缺陷；对照实验（同一时刻直接顶层打开官方站点）同样停滞，
   而**全新 profile 下官方站点与本站嵌入均完整渲染**，才确认是 profile 缓存问题。
   复测时请换用新的 `--user-data-dir`。
2. **`--virtual-time-budget` 不适用于此类测试**：它冻结真实网络等待，
   会让嵌入区整片黑屏，产生假阴性。本项目一律走 CDP 实时加载。

另外，后台标签页的 `requestAnimationFrame` 被浏览器节流，NASA 应用在不可见页面上会停止加载——
这也是内置无表面浏览器无法完成验证的原因。

## 已知限制

1. 纯静态站无法汉化嵌入的模拟器界面——这是浏览器同源策略，不做任何规避。
2. 官方实体库 719 条中已建立中文对照 392 条。451 颗卫星里 158 颗有规范编号中文名（土卫三十六、木卫十六、天卫十三…）；其余约 293 颗连维基百科也只用 `S/2021 U 1` 这类临时编号，不存在中文序号名，一律保留英文。
3. 官方**专题故事标题**（如 `Entry, Descent, and Landing`）属动态内容，扩展不翻译。
4. 扩展依赖 `.pioneer-label-div` 等 class 名与英文字面量，官方改版会造成漏译。
5. 少数官方简介文件返回 403（如 `pluto.json`、`sc_spitzer.json`），这些条目只显示名称不显示简介。
6. 后台标签页动画帧被浏览器节流，模拟器窗口切到后台过久会停在加载中；切回前台即恢复。
7. 扩展无法一键安装——Chrome/Edge 只允许商店直接安装，本地扩展必须走"加载已解压"。
8. 详情面板的"阅读更多"按钮把标签拆成裸文本节点与 `<span>`，且应用会替换该文本节点，
   常规短语匹配无法重组；已按实测 DOM 结构对该按钮做定向处理（见 `content.js` 注释）。

## 尚未完成的验证

- **Edge 桌面端**：扩展与站点的 Edge 实测尚未执行（本机 Edge 可用，但本轮只在 Chrome 上完成验证）。
- **真实扩展加载**：`headless=new` 忽略 `--load-extension`，因此 `content.js` 是通过 CDP 注入同一份文件验证的，
  只替换了 `chrome.runtime.getURL`（仅用于解析扩展自身资源路径）。
  扩展在真实浏览器中以"加载已解压的扩展"方式运行的端到端确认仍需人工执行一次。

## 翻译与数据规则

- 翻译文本与页面逻辑分离：界面代码不含任何中文串，全部来自 `data/*.json`。
- 中文简介只译官方已有文本，不补充官方未给出的数据；数字、日期、距离、单位一律照原文。
- 官方文案中的运行时模板占位符（如 `##moon_count##`）原样保留。
- 每条中文都可通过 `src` 字段回溯到官方英文原文。
- 无可靠译名者保留英文，并在术语表中明确列为"未收录"。
- NASA / JPL 标识与 *Eyes on the Solar System* 产品名不翻译、不改写。

## 已知限制

1. 纯静态站无法汉化嵌入的模拟器界面——这是浏览器同源策略，不做任何规避。
2. 官方实体库 719 条中已建立中文对照 270 条；451 颗卫星与多数任务代号无可靠译名，保留英文。
3. 扩展依赖 `.pioneer-label-div` 等 class 名与英文字面量，官方改版会造成漏译。
4. 少数官方简介文件返回 403（如 `pluto.json`、`sc_spitzer.json`），这些条目只显示名称不显示简介。
5. 后台标签页动画帧被浏览器节流，模拟器窗口切到后台过久会停在加载中；切回前台即恢复。
6. 扩展无法一键安装——Chrome/Edge 只允许商店直接安装，本地扩展必须走"加载已解压"。

## 许可与署名

本项目为独立非官方作品，与 NASA、Jet Propulsion Laboratory 无隶属或背书关系。
在官方 `app.js` 中检索 `github.com`、`open source`、`license`、`public domain` 均为 0 命中，
因此本项目**不声称 NASA 软件开源**，也不复制其任何程序、模型、纹理或星表数据。
中文简介译自官方公开的 `descriptions/<id>.json` 事实性文本，逐条标注来源 URL。

3D 模拟与数据来源：NASA/JPL Eyes on the Solar System；
JPL Solar System Dynamics（`ssd.jpl.nasa.gov`）；JPL CNEOS（`cneos.jpl.nasa.gov`）。
