# CocaAPI 官网

公开入口为 `https://cocaapi.com/`，采用用户提供的 CocaAPI Website.html 深浅两版设计作为视觉参考。中文文案保留 CocaAPI、Model Infrastructure 与开发者术语，复用参考稿的留白、柔和彩色光晕、字体和产品界面示意布局。演示数据明确标注，不包含虚构客户案例、套餐价格或 SLA

官网源码位于 `deploy/cocaapi/website`，为独立静态 HTML、CSS 和 JavaScript，无构建依赖。Caddy 仅对 `/`、`/site/*`、`/robots.txt`、`/sitemap.xml` 提供公开文件，其余路径继续转发原网关。登录、注册、用户中心、管理后台和 API 路由保持原有地址，不修改认证、余额或调用计费实现

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
node deploy/cocaapi/tests/website.smoke.mjs https://cocaapi.com
```

浏览器函数接受可选第二参数 `{ screenshotDirectory: "/absolute/existing/directory" }`，默认不写截图。HTTP smoke 使用 Node.js 内置 fetch，核对首页及七个资源的实际字节与本地文件一致、robots 与 sitemap 内容、14 个用户页面、6 个受保护读取、原管理登录与脚本资源，以及 readiness。所有网络检查仅访问给定源站，不执行充值、注册或模型调用

源站上线前使用独立 Caddy 的本地监听及 SSH 隧道完成同样的路由、CSP 和缓存检查。发布只复制静态资源和热重载 Caddy，不重建网关镜像、不运行数据库迁移

## 2026-11-02 发布

当前静态版本为 `/var/www/cocaapi/releases/website-20261102T030853Z`，`/var/www/cocaapi/current` 指向该版本。目录权限为 755、文件为 644，Caddy 服务账户已验证可读，不将受限环境或密钥目录作为网站根目录

原 Caddy 配置与网关镜像指纹备份位于 `/opt/cocaapi/backups/website-20261102T030853Z/`。本次原先没有官网版本，原首页为跳转登录。回退时恢复备份 Caddyfile，验证配置后 reload；以后已有官网版本时，另恢复 previous-release 中记录的软链接目标。旧静态版本保留用于回退，不回退数据库或网关镜像

375、768、1024、1440 像素的深浅两种主题共八种布局通过公开 HTTPS 浏览器验收，无页面横向溢出、运行异常、失败资源或外部请求。主题保存、SDK 三种示例、代码复制、键盘操作、手机菜单、锚点及 FAQ 通过；无 JavaScript 的正文、菜单、cURL 和 FAQ 检查通过。格式、JavaScript 语法、Caddy 配置与静态源文件摘要检查通过

公网 HTTP smoke 通过：首页返回 200，七个静态资源与源码相符，14 个用户页面正常，6 个受保护读取均返回 401，原管理登录及脚本可用，用户页私有响应头保留，readiness 返回 200。网关镜像在部署前后均为 `sha256:819831d0f24335af6c16734c86001cb374033168e285d8adb0721e1502200a60`，网关、PostgreSQL 与 Redis 健康

独立静态审查没有 P1 / P2 问题，两个关于无 JavaScript 控件和验收脚本路径的建议均已处理并重验。托管 CI 及外部审查机器人未运行；本次没有重新运行无关的模型计费测试，也没有真实上游扣费、第三方登录或支付验收

临时 Caddy 预发布进程、SSH 隧道、本地静态服务及浏览器验收会话均已关闭；静态发布目录与回退资料保留
