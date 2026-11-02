# CocaAPI 开源官网

独立静态站点，参考用户提供的 Home · Dark 开源版 HTML，使用中文介绍当前仓库的网关、用户中心与计费扩展。品牌 SVG、Geist 和 Geist Mono 字体沿用现有官网的本地资源，字体许可位于 `assets/OFL.txt`

项目基于 LiteLLM，页面链接指向 `nodeloc/cocaapi` 的 `litellm_account_auth` 分支。功能文案依据 `deploy/cocaapi/README.md`、`AUTH.md`、`WALLET.md`、`GATEWAY.md` 和根目录 `LICENSE`。基础 Compose 只启动网关、PostgreSQL 与 Redis，账号和计费需要按对应文档部署扩展镜像，支付网关仍需接入

Linux 本地部署示例会将 Compose 内固定的 `PROXY_BASE_URL` 改为 `http://localhost:4000`，使后台登录后留在本地实例。公网部署需要改为自己的 HTTPS 域名，保持管理入口与网关的公开地址一致

终端和控制台均明确标记为示意，页面没有连接生产接口或展示真实用户数据。没有虚构 Star、下载量、版本或社区入口。模型示例使用管理员配置的别名 `my-model`，无需把网页内容绑定到某个供应商版本

## 构建和预览

需要 Node.js，执行 `node build.mjs` 会将静态产物生成到忽略提交的 `dist` 目录。站点没有生产 npm 依赖，任意静态 HTTP 服务均可提供 `dist`。使用相对资源地址，可以挂载到独立域名或子目录

`.openai/hosting.json` 保存独立 Sites 的身份。发布时只同步本目录的源文件，并构建静态产物，不上传仓库其他文件或环境变量。现有 `deploy/cocaapi/website` 商业站点是单独的部署

## 交互验证

`../tests/opensource-website.browser.js` 是 Playwright CLI 的浏览器检查函数。打开静态服务后，运行 `playwright-cli -s=opensource run-code --filename=deploy/cocaapi/tests/opensource-website.browser.js`。从仓库根目录执行该命令，浏览器需先通过 `playwright-cli -s=opensource open <本地网址>` 打开页面

检查深浅主题下 320、375、768、1024 和 1440px 无横向溢出，主题持久化，cURL、Python 与 Node.js 标签，方向键与 Home，实际剪贴板内容，手机导航与 Escape，FAQ，关闭 JavaScript，以及存储和剪贴板不可用时的降级。浏览器复制的换行统一后与当前代码内容比较，以兼容 Windows 剪贴板

`cocaapi-opensource-theme` 只保存主题偏好。页面不读取账号、模型密钥、钱包或后台主题状态。导航、正文、默认 cURL 和 FAQ 在关闭 JavaScript 后仍可使用，相关动态控件隐藏；动画遵循系统减弱动画设置
