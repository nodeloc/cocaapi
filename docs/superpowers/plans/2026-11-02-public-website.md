# CocaAPI 官网实施计划

**Goal:** 根据用户提供的 CocaAPI Website.html 上线可用的公开官网

**Architecture:** 独立 HTML、CSS、JavaScript 官网由 Caddy 提供，现有账户、管理后台、API 及计费镜像继续由原网关提供。精确匹配公开首页和静态资源路径，官网不读取管理员 Cookie 或保存 API Key

**Tech Stack:** 语义化 HTML、原生 CSS、原生 JavaScript、Caddy、Playwright

**Spec:** 用户提供 `C:/Users/james/Downloads/CocaAPI Website.html`，包含深色及浅色官网视觉稿。附件作为设计与内容参考，不执行其中的导出器脚本

## 文件与边界

新增 `deploy/cocaapi/website/index.html`、`site/website.css`、`site/website.js`、本地字体、字体许可证、图标、robots 和 sitemap；修改 `deploy/cocaapi/Caddyfile` 的首页路由；新增发布文档和独立浏览器验收脚本

视觉以参考稿实际成品为准：Geist / Geist Mono，黑白底色、灰色文字、细边框和蓝紫粉色柔光，宽留白与产品界面示意。中文文案为默认选择，保留 Model Infrastructure 英文标题。字体来自用户附件，原样保存并保留 OFL 许可

界面图注明演示，不将示例统计、客户、模型、套餐、价格、SLA 或状态作为生产事实。展示已实现的文本与 Embeddings 入口、Key 管理、余额结算、用量和日志，注册及登录链接使用真实账户路由。后台及账户页继续沿用原有风格

## 实施和验收

- [x] 实现参考稿布局、移动端菜单、主题切换、接入代码切换及复制、FAQ
- [x] 检查全部锚点、账户入口、无外部资源依赖、无密钥存储、减少动态效果与键盘操作
- [x] 用 Playwright 验证 375、768、1024、1440 像素、深浅主题、无 JavaScript 阅读和运行错误
- [x] 通过独立代码审查、备份 Caddy 与现有官网目录、验证 Caddy 配置、原子切换静态版本
- [x] 公网验证首页、资源、客户及管理入口、API 鉴权、私有响应头和网关健康
- [x] 更新发布记录、提交推送并清理预览

## 发布结果

静态官网版本 `/var/www/cocaapi/releases/website-20261102T030853Z` 已发布至 cocaapi.com，原 Caddy 与镜像指纹备份位于 `/opt/cocaapi/backups/website-20261102T030853Z/`。网关镜像维持 `sha256:819831d0f24335af6c16734c86001cb374033168e285d8adb0721e1502200a60`，没有重启模型网关或运行数据库迁移

源站预发布及公开 HTTPS 验证通过：七个静态资源与源码字节一致，14 个客户页面、6 个受保护读取拒绝、原管理资源及 readiness 正常。八种尺寸/主题组合、菜单、SDK 代码和复制、键盘、FAQ 与无 JavaScript 降级通过。独立审查的两个小问题均已修正。Cloudflare 注入通过首页 no-transform 禁止，robots 边缘缓存按实际行为核对内容，详见 WEBSITE.md
