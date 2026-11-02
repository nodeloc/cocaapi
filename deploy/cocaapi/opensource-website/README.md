# CocaAPI 开源官网

独立静态站点，参考用户提供的 Home · Dark 开源版 HTML，使用中文介绍当前仓库的网关、用户中心与计费扩展。品牌 SVG、Geist 和 Geist Mono 字体沿用现有官网的本地资源，字体许可位于 `assets/OFL.txt`

项目基于 LiteLLM，页面链接指向 `nodeloc/cocaapi` 的 `litellm_account_auth` 分支。功能文案依据 `deploy/cocaapi/README.md`、`AUTH.md`、`WALLET.md`、`GATEWAY.md` 和根目录 `LICENSE`。基础 Compose 只启动网关、PostgreSQL 与 Redis，账号和计费需要按对应文档部署扩展镜像，支付网关仍需接入

Linux 本地部署示例会将 Compose 内固定的 `PROXY_BASE_URL` 改为 `http://localhost:4000`，使后台登录后留在本地实例。公网部署需要改为自己的 HTTPS 域名，保持管理入口与网关的公开地址一致

终端和控制台均明确标记为示意，页面没有连接生产接口或展示真实用户数据。没有虚构 Star、下载量、版本或社区入口。模型示例使用管理员配置的别名 `my-model`，无需把网页内容绑定到某个供应商版本

## 构建和预览

需要 Node.js，执行 `node build.mjs` 会将静态产物生成到忽略提交的 `dist` 目录。站点没有生产 npm 依赖，任意静态 HTTP 服务均可提供 `dist`。使用相对资源地址，可以挂载到独立域名或子目录

`https://cocaapi.com/` 使用本目录的 `dist` 产物，由现有服务器上的 Caddy 提供。部署保留旧 `/site/*` 资源、robots 与 sitemap，按 [官网发布文档](../WEBSITE.md) 切换静态版本目录。账号、后台与 API 继续使用 `https://demo.cocaapi.com`

`.openai/hosting.json` 保存独立 Sites 预览的身份。Sites 发布只同步本目录的源文件并构建静态产物，不上传仓库其他文件或环境变量。Sites 预览与主域名服务器是两个独立发布目标

## 交互验证

`../tests/opensource-website.browser.js` 是 Playwright CLI 的浏览器检查函数。打开静态服务后，运行 `playwright-cli -s=opensource run-code --filename=deploy/cocaapi/tests/opensource-website.browser.js`。从仓库根目录执行该命令，浏览器需先通过 `playwright-cli -s=opensource open <本地网址>` 打开页面

检查深浅主题下 320、375、768、1024 和 1440px 无横向溢出，主题持久化，cURL、Python 与 Node.js 标签，方向键与 Home，实际剪贴板内容，手机导航与 Escape，FAQ，关闭 JavaScript，以及存储和剪贴板不可用时的降级。浏览器复制的换行统一后与当前代码内容比较，以兼容 Windows 剪贴板

页眉提供中文与 English 切换，翻译覆盖导航、功能说明、部署指引、FAQ、复制提示、无障碍标签、页面标题和描述。中文正文直接存在 HTML 中，英文翻译位于 `assets/language.js`。切换语言保留选中的 SDK、主题和菜单状态，语言偏好使用 `cocaapi-opensource-language` 保存，存储不可用时仍可切换当前页面

`cocaapi-opensource-theme` 只保存主题偏好。页面不读取账号、模型密钥、钱包或后台主题状态。导航、中文正文、默认 cURL 和 FAQ 在关闭 JavaScript 后仍可使用，相关动态控件隐藏；动画遵循系统减弱动画设置。浏览器检查覆盖两种语言与两种主题，验证仓库展示名称、克隆地址和项目链接的一致性，以及英文页面和标签的完整翻译

动效沿用设计稿：首屏依次淡入、光晕轨道运动、终端逐行出现、提供商无缝循环滚动、滚动入场、图表柱条生长及按钮按压反馈。提供商列表在悬停或键盘聚焦时暂停，重复列表对辅助技术隐藏。减弱动画模式下停止运动，将提供商改为静态换行并完整展示内容；不支持滚动时间线的浏览器直接显示各区块

动画回归通过实际位移、暂停前后的位置、循环末尾与开头的衔接、淡入透明度、终端行的先后出现、图表变换及滚动入场验证效果，不仅检查动画类名。样式、主脚本及其语言模块使用同一资源版本参数，发布更新时需一起变更，避免浏览器继续使用一天缓存中的旧文件
