# 取证摘要（NASA 专有代码不入库）

分析期曾下载以下官方文件用于只读取证，结论已写入 docs/技术调查报告.md；
因其为 NASA/JPL 专有程序，本仓库不保留副本：

  app.js       1,740,432 B  — 界面字面量、路由表、embedOptions、_dateFormats、许可关键词检索（0 命中）
  vendors.js   2,529,206 B  — 仅取大小，未分析
  preload.js     133,068 B  — 仅取大小，未分析
  config.js           128 B  — staticAssetsUrl / dynamicAssetsUrl
  index.html        3,071 B  — DOM 外壳（结构见报告 §1.1）

复现方式：
  curl -A '<browser UA>' https://eyes.nasa.gov/apps/solar-system/app.js -o /tmp/app.js
  grep -c -iE 'github.com|open source|license|public domain' /tmp/app.js   # 均为 0
  grep -oE 'addRoutes\(\[.{0,900}' /tmp/app.js                            # 路由表
  grep -oE '_dateFormats.{0,300}' /tmp/app.js                              # 时间参数格式
  grep -oE 'paramsToKeep:.{0,220}' /tmp/app.js                             # 官方保留参数白名单

