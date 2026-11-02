# 官网与应用域名

官网使用 `https://cocaapi.com`，在线演示站使用 `https://demo.cocaapi.com`。Caddy 为两个域名单独提供 HTTPS，开源官网静态文件由 `/var/www/cocaapi/current` 提供，demo 服务首页由 `/var/www/cocaapi/demo-current` 提供，账号、后台与 API 请求转发到现有网关

| 用途 | 地址 |
| --- | --- |
| 官网 | `https://cocaapi.com/` |
| 在线演示首页 | `https://demo.cocaapi.com/` |
| 用户控制台 | `https://demo.cocaapi.com/account/home/` |
| 登录与注册 | `https://demo.cocaapi.com/account/login/`、`https://demo.cocaapi.com/account/register/` |
| 管理后台 | `https://demo.cocaapi.com/ui/` |
| API Base URL | `https://demo.cocaapi.com/v1` |
| 应用健康检查 | `https://demo.cocaapi.com/health/readiness` |

根域名的旧 `/ui`、`/account`、`/commerce`、`/v1` 等应用路径返回 308，保留路径及查询参数并跳转到 demo。API 客户端应直接修改 `base_url`，避免依赖跨域跳转传递鉴权头。旧地址的 POST 跳转保持请求方法，但客户端不一定转发 Authorization

账号会话使用绑定主机的 HttpOnly Cookie，用户需要在新域名重新登录。个人 API Key 本身继续有效，余额、分组、模型授权、预算与限流使用原数据库及配置

## 配置

`compose.yaml` 的 `PROXY_BASE_URL` 与 `auth.env` 的 `COCAAPI_PUBLIC_URL` 均设为 `https://demo.cocaapi.com`。认证、兑换码及 LiteLLM 加密密钥保持原值。公开地址由进程环境读取，修改后需要重建网关容器

使用 `Caddyfile` 中两个站点块，并让两个域名解析到同一台反向代理。官网当前发布支持中英文的开源项目页面，robots 与 sitemap 使用根域名。在线用户中心与 API 使用 demo，官网中的自托管示例使用 localhost。客户接入文档按当前浏览器来源生成 `/v1` 地址

demo 根路径不再跳转到受保护的 `/account/home/`，未登录访客可直接查看服务介绍，并选择登录、注册或进入控制台。`/site/*`、robots 和 sitemap 与 demo 首页一起由静态目录提供，分享图片与 canonical 使用 demo 域名；私有页面保持原有会话检查与响应头

2026-11-02 发布目录为 `/var/www/cocaapi/demo-releases/demo-home-20261102T155853Z`，配置备份为 `/opt/cocaapi/backups/demo-home-20261102T155853Z/`。静态版本及其父目录为 755、文件为 644，发布后确认 caddy 服务账户可读。回退入口时恢复备份中的 Caddyfile，验证后重启 Caddy；不改网关镜像、认证配置或数据库。后续静态更新使用新版本目录及软链接切换，保留上一版本

## OAuth 应用

在提供商应用中登记以下完整回调地址，再在管理后台“登录与注册”保存对应凭据

```text
https://demo.cocaapi.com/account/api/v1/oauth/github/callback
https://demo.cocaapi.com/account/api/v1/oauth/google/callback
https://demo.cocaapi.com/account/api/v1/oauth/nodeloc/callback
```

NodeLoc 使用迁移时提供的新应用凭据。Client Secret 通过现有设置接口加密入库，页面不回显。GitHub、Google 的原有启用状态和配置保留，启用前需在各自提供商配置新回调

## 发布与回退

迁移前保存环境、Compose、Caddy、数据库和当前镜像标识。先用当前运行镜像建立 demo 预发布实例，验证证书、公开地址、CSRF 和 OAuth 发起，再切换入口。前端增量镜像基于迁移前的实际运行镜像，只更新前端及品牌静态资源

Caddy 配置通过 `caddy validate` 后使用服务重启，沿用已验证的切换方式。根官网使用新静态版本目录与软链接切换，保留前一版本用于回退。若只需回退前端镜像，可保持 demo 域名及公开地址；回退到根域名应用还需同步 OAuth 应用回调

## 2026-11-02 迁移验证

镜像 `cocaapi-domain:20261102` 的 ID 为 `sha256:be6c907c7b3a155622d6443e720d9d59eb85d29bb5446794d405164f806f6473`，继承迁移前实际运行的 Decisions 镜像 `sha256:3feb43d679c65846b052382fb592a55437cfb5d3f5fcf671a51da64976601eb1` 的全部层。运行环境只变更两个公开地址，模型配置不变，没有修改后端计费代码或数据库结构。NodeLoc 凭据按用户提供的新应用单独更新，注册状态及其他提供商配置保留

备份位于 `/opt/cocaapi/backups/demo-domain-20261102T140725Z/`，保存迁移前后环境与配置、迁移前后的数据库归档、浏览器和接口验收记录。数据库归档通过目录检查，未进行完整恢复演练。官网当前静态目录为 `/var/www/cocaapi/releases/website-domain-20261102T141731Z`

生产前端构建、显式 postbuild、定向 ESLint 及四项用户网关集成测试通过，新测试先复现接入文档固定旧域名的问题，再验证当前来源与管理员 worker 隔离。独立只读审查未发现阻断问题，品牌检查域名的建议已处理；HTTP 品牌检查与实际浏览器 Logo 检查分别覆盖静态资源和客户端挂载

公网 HTTP 验证官网及 21 个资源摘要、14 个用户页面、6 个受保护读取、管理后台和健康检查，旧应用路径返回 308。品牌 HTTP 检查覆盖 11 个资源、4 个原生 Logo 变体、favicon、8 个页面及 4 个受保护读取。官网浏览器验证四种宽度的深浅主题、导航、复制与无 JavaScript 降级；应用浏览器验证管理员会话、模型、回调地址、客户会话、接入文档、钱包、语言及 390 像素布局，页面无脚本错误，也没有向根域名发送应用接口请求

新域名上通过管理员测试凭据读取模型并完成真实流式请求，收到完整结束事件、可见响应和用量数据，未使用客户钱包。源站保持关闭响应缓冲，边缘返回完整 SSE。NodeLoc 授权发起使用新回调并可到达提供商授权入口，错误 Origin 和 CSRF 均返回 403；本次没有代替用户完成第三方身份登录、授权码回调及令牌交换

临时客户未充值、未创建个人 Key，验收后已停用并清除会话。临时浏览器状态和预发布容器已移除，主实例继续运行在 4000
