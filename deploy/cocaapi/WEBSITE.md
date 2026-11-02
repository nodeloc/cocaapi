# CocaAPI 官网

公开入口为 `https://cocaapi.com/`，采用用户提供的 CocaAPI Website.html 深浅两版设计作为视觉参考。中文文案保留 CocaAPI、Model Infrastructure 与开发者术语，复用参考稿的留白、柔和彩色光晕、字体和产品界面示意布局。演示数据明确标注，不包含虚构客户案例、套餐价格或 SLA

官网源码位于 `deploy/cocaapi/website`，为独立静态 HTML、CSS 和 JavaScript，无构建依赖。官网使用根域名 `cocaapi.com`，登录、注册、用户中心、管理后台和 API 使用 `demo.cocaapi.com`，旧应用路径跳转规则见 [DOMAINS.md](DOMAINS.md)。两者复用原有网关数据与计费实现

## 交互与资源

提供深浅主题切换、移动端导航、cURL / Python / Node.js 示例切换、代码复制和原生 FAQ。主题偏好只存于 `cocaapi-website-theme`，不使用后台的主题键，也不读取或保存 API Key。浏览器禁止存储时仍可切换当前页面主题，复制不可用时显示手动复制提示

关闭 JavaScript 后正文、链接、cURL 示例和 FAQ 仍可使用，依赖 JavaScript 的主题、菜单折叠及其他 SDK 控件隐藏。动画遵循 prefers-reduced-motion，菜单支持 Escape，SDK 标签支持方向键和 Home / End

Geist 与 Geist Mono 的字体文件来自用户附件中的原始 WOFF2，随站点本地提供，许可保存在 `site/fonts/OFL.txt`。附件中的打包器及脚本没有进入生产代码，没有外部字体、脚本或图片依赖。发布归档仅包含 website 目录，不包含验收脚本和本地参考文件

## 缓存与 Cloudflare

首页及文档使用 `public, no-cache, no-transform`，静态资源使用一天缓存，HTML 中的样式及脚本 URL 带版本参数。修改样式或脚本时需同步更新资源版本，避免新 HTML 使用浏览器缓存的旧资源

`no-transform` 用于阻止 Cloudflare 自动注入额外统计脚本，使首页保持自有脚本和严格 CSP。该行为依据 [Cloudflare Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/) 及 [Origin Cache Control](https://developers.cloudflare.com/cache/concepts/cache-control/)。官网 CSP 只在官网路径生效，不覆盖账户与后台自己的策略

Cloudflare 在公网为 robots.txt 使用边缘缓存，当前观测到 max-age=14400，源站内容未改变。验收核对 robots.txt 和 sitemap 的实际内容，不把该边缘 TTL 当成代码合同；参见 [Default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)。私有账户页仍严格要求 no-store 和 no-referrer

## 本地与发布验收

在仓库根目录运行浏览器命令，先打开本地静态服务或目标官网，再执行以下可重复检查。Playwright CLI 需要已安装；本次使用已存在的 0.1.22 版本，没有增加生产依赖

```sh
playwright-cli -s=website open https://cocaapi.com/
playwright-cli -s=website run-code --filename=deploy/cocaapi/tests/website.browser.js
node deploy/cocaapi/tests/website.smoke.mjs https://cocaapi.com https://demo.cocaapi.com
```

浏览器函数接受可选第二参数 `{ screenshotDirectory: "/absolute/existing/directory" }`，默认不写截图。HTTP smoke 使用 Node.js 内置 fetch，核对首页及 21 个资源的实际字节与本地文件一致、robots 与 sitemap 内容、14 个用户页面、6 个受保护读取、原管理登录与脚本资源，以及 readiness。所有网络检查仅访问给定源站，不执行充值、注册或模型调用

源站上线前使用独立 Caddy 的本地监听及 SSH 隧道完成同样的路由、CSP 和缓存检查。发布只复制静态资源和热重载 Caddy，不重建网关镜像、不运行数据库迁移

## 2026-11-02 发布

当前静态版本为 `/var/www/cocaapi/releases/website-20261102T030853Z`，`/var/www/cocaapi/current` 指向该版本。目录权限为 755、文件为 644，Caddy 服务账户已验证可读，不将受限环境或密钥目录作为网站根目录

原 Caddy 配置与网关镜像指纹备份位于 `/opt/cocaapi/backups/website-20261102T030853Z/`。本次原先没有官网版本，原首页为跳转登录。回退时恢复备份 Caddyfile，验证配置后 reload；以后已有官网版本时，另恢复 previous-release 中记录的软链接目标。旧静态版本保留用于回退，不回退数据库或网关镜像

375、768、1024、1440 像素的深浅两种主题共八种布局通过公开 HTTPS 浏览器验收，无页面横向溢出、运行异常、失败资源或外部请求。主题保存、SDK 三种示例、代码复制、键盘操作、手机菜单、锚点及 FAQ 通过；无 JavaScript 的正文、菜单、cURL 和 FAQ 检查通过。格式、JavaScript 语法、Caddy 配置与静态源文件摘要检查通过

公网 HTTP smoke 通过：首页返回 200，七个静态资源与源码相符，14 个用户页面正常，6 个受保护读取均返回 401，原管理登录及脚本可用，用户页私有响应头保留，readiness 返回 200。网关镜像在部署前后均为 `sha256:819831d0f24335af6c16734c86001cb374033168e285d8adb0721e1502200a60`，网关、PostgreSQL 与 Redis 健康

独立静态审查没有 P1 / P2 问题，两个关于无 JavaScript 控件和验收脚本路径的建议均已处理并重验。托管 CI 及外部审查机器人未运行；本次没有重新运行无关的模型计费测试，也没有真实上游扣费、第三方登录或支付验收

临时 Caddy 预发布进程、SSH 隧道、本地静态服务及浏览器验收会话均已关闭；静态发布目录与回退资料保留

## 2026-11-02 品牌更新

本次素材来自用户提供的 CocaAPI-brand-assets 及更新后的 CocaAPI Website.html 中的视觉规范。页眉、页脚、用量与密钥示意图使用原始横版 SVG，深色底显示 white 版，浅色底显示 black 版。字标保留原比例，最小显示宽度为 100px；移动端页眉使用 120px。方形应用图标使用原始渐变 SVG，Playground 头像使用对应主题的独立标志。原有文字与背景保持黑白基调，光晕统一为 #FF2D95、#7A5CFF、#00C8FF

新增自适应浏览器主题的 SVG favicon、16/32px PNG 与 ICO 兼容图标、Apple 与 Android 图标，以及 1200×630 的 Open Graph / Twitter 分享图。素材原样复制，不拉伸、不增加阴影或滤镜；分享图保留用户原稿英文文案。所有素材在 /site/brand/ 本地提供，不访问第三方资源。图标清单使用 manifest.json，使当前 Caddy 能正确返回 application/json；公开首页不注册 Service Worker

当前版本为 /var/www/cocaapi/releases/website-brand-20261102T032316Z，资源查询版本为 20261102-2。发布采用新目录与软链接切换，没有修改 Caddy 路由、网关镜像或数据库。恢复本次更新前的官网，可将 /var/www/cocaapi/current 原子切回 /var/www/cocaapi/releases/website-20261102T030853Z；配置与镜像指纹备份在 /opt/cocaapi/backups/website-brand-20261102T032235Z/，中间发布记录保留于 /opt/cocaapi/backups/website-brand-20261102T032316Z/

公网 HTTP 验收通过：首页及 21 个静态资源字节与源码一致，14 个用户页面可访问，6 个受保护读取仍返回 401，原管理页与 readiness 正常。公网浏览器在 375、768、1024、1440px 的深浅主题下通过 Logo 加载、对应主题版本、比例和最小尺寸检查，原菜单、注册链接、SDK 复制和无 JavaScript 使用检查通过，无失败资源、外部请求或运行异常。本地另外确认 320px 无横向溢出，SVG favicon 随浏览器明暗主题变色。独立只读审查未发现 P1 / P2 问题
