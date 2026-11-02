# 用户账号部署

本次包含邮箱注册、登录、验证邮箱、找回和修改密码，以及 GitHub、Google、NodeLoc 注册、登录和绑定。新用户关联普通 LiteLLM 用户，额度为 0，模型列表为 `no-default-models`。密码仅保存在 `CommerceCustomer`，原生后台登录不会接受用户中心密码。邮箱未验证时可查看账号，验证后才能修改密码或绑定第三方身份

实现参考了 New API 的功能组织，未复制其 AGPL 源代码。账号 API 在 `/account/api/v1`，独立于管理员 JWT。浏览器仅保存 HttpOnly 会话 Cookie，服务器保存摘要。OAuth 状态由数据库单次消费并绑定浏览器，令牌和邮件任务加密保存，跨 worker 不依赖内存状态。相同邮箱不会自动合并账号

## 后台登录与注册设置

完整代理管理员可在 `/ui/commerce/settings/` 配置 NodeLoc、GitHub、Google 的 Client ID、Client Secret 和启用状态，以及新用户注册开关。左侧菜单与账户管理页提供「登录与注册」入口，页面展示固定回调地址。提供商使用固定 issuer，不支持任意 URL

Client Secret 不回显，留空保留现值，填写新值替换现值，显式清除会同时停用该登录方式。配置保存采用 revision 比较，其他管理员先行更新会返回冲突，须重新加载后编辑。操作审计不保存密钥

凭据会去除复制时附带的首尾空白，新密钥输入全部为空白时保留旧值。已有配置在实际使用时也会归一化，无须为了这一修复重新保存应用凭据。第三方拒绝客户端凭据时返回可读提示，不能重复使用已消费的回调链接，应重新从用户登录页发起授权。NodeLoc 回调 500 的修复和验收见[排障记录](../../docs/incidents/2026-11-01-nodeloc-callback.md)

没有数据库记录时沿用 `auth.env` 的 OAuth 和注册配置。第一次保存后，数据库记录成为这些设置的来源，后续修改环境变量不会覆盖它。配置由每次账号请求读取，不需重启网关，对两个 worker 都生效。SMTP、公开域名、受信代理及认证主密钥仍从环境配置，页面只显示邮件服务状态。邮箱注册仍要求 SMTP，第三方注册可独立开放，启用某个平台不会自动打开注册

客户端密钥以 Fernet 密文存入 `CommerceLoginConfiguration`，加密依赖 `COCAAPI_AUTH_SECRET`。数据库与该主密钥必须一同备份，不能随意轮换。任何非空密文无法解密时，账号服务返回 503，不回退旧环境配置；管理员配置入口仍可用于替换或清除损坏的凭据

## 构建

在仓库根目录执行，先构建前端，再构建固定基础镜像的账号版本。Docker 专用 ignore 文件只允许所需源文件、迁移和前端产物进入构建上下文，不会包含本地密钥

```powershell
npm --prefix ui/litellm-dashboard ci
npm --prefix ui/litellm-dashboard run build
docker build -f deploy/cocaapi/Dockerfile.auth -t cocaapi:account-auth .
```

Authlib、joserfc 固定版本并校验 wheel SHA-256，版本及摘要与 `uv.lock` 一致。数据库升级只新增账号表和关联，不修改已有用户记录。修改 schema 时同步维护根目录、`litellm/proxy` 和 extras 的三份 Prisma schema

## 应用配置

复制 `auth.env.example` 为服务器 `/opt/cocaapi/auth.env`，权限设为 `600`。`COCAAPI_AUTH_SECRET` 使用至少 32 字符的随机值，用于会话摘要、OAuth 状态及邮件队列加密，必须与数据库一同备份。更换它会使既有会话和未完成的邮件链接失效。不要复用 LiteLLM master key 或盐

目前 OAuth 应用与 SMTP 尚未准备，保持 `COCAAPI_REGISTRATION_ENABLED=false`，对应 Client ID、Secret 和 SMTP 字段留空。未配置的平台不会显示登录按钮。SMTP 支持 STARTTLS 或直接 TLS，不允许明文发信；直接 TLS 通常使用 465，并将 `COCAAPI_SMTP_SECURITY` 设为 `tls`

三个应用均使用授权码流程，回调 URL 分别为：

```text
https://demo.cocaapi.com/account/api/v1/oauth/github/callback
https://demo.cocaapi.com/account/api/v1/oauth/google/callback
https://demo.cocaapi.com/account/api/v1/oauth/nodeloc/callback
```

GitHub 权限为 `read:user user:email`，Google 与 NodeLoc 为 `openid profile email`。三个平台均发送 PKCE S256，OIDC 验证 RS256 签名、issuer、audience、有效期、nonce 和 userinfo 的 sub。OIDC 再验证请求还要求近期 auth_time。NodeLoc 的发现地址为 `https://www.nodeloc.com/oauth-provider/.well-known/openid-configuration`，未声明 PKCE 支持，必须以真实应用验收，不会失败后自动移除安全参数重试

`COCAAPI_TRUSTED_PROXIES` 仅填写实际反向代理的来源网段。当前 Docker 网段为 `172.30.20.0/24`，仅从受信代理解析 X-Forwarded-For。Caddy 在域名前接 Cloudflare 时，完整真实 IP 信任链还需按实际 Cloudflare 网络配置；不要直接信任任意客户端提供的转发头

## 发布和启用

升级前备份数据库与配置。在 `/opt/cocaapi/.env` 记录经测试的精确 `COCAAPI_IMAGE` 镜像 ID，使用两个 Compose 文件启动。保留 `.env` 内现有数据库、Redis 和管理员密钥

```sh
docker compose -f compose.yaml -f compose.auth.yaml config --quiet
docker compose -f compose.yaml -f compose.auth.yaml up -d gateway
curl --fail http://127.0.0.1:4000/health/readiness
```

完成真实 SMTP 发信及三个应用的登录、注册、取消授权、绑定和解绑验收后，再开放注册。SMTP 配好后启动持久化邮件队列 worker。注册、邮件令牌和发信任务在同一事务创建；多个 worker 使用数据库领取任务，发送失败按退避重试，已使用或被替换的验证令牌不会继续发信

```sh
docker compose -f compose.yaml -f compose.auth.yaml --profile mail up -d gateway mail
```

用户入口为 `https://demo.cocaapi.com/account/login/`，注册页为 `/account/register/`，账号安全页为 `/account/security/`。OAuth 注册无需 SMTP，但没有已验证邮箱的 OAuth 用户需要补充并验证邮箱才能修改安全设置。注册关闭仍允许已有账号登录

用户中心已复用现有管理后台模板，账号、余额、订单和安全设置的布局及发布验证见 [ACCOUNT_UI.md](ACCOUNT_UI.md)

个人 API 密钥、模型目录、Playground、用量及日志等用户网关功能见 [GATEWAY.md](GATEWAY.md)

## 验证范围

在独立 PostgreSQL 上执行账号 API 集成测试，包括注册权限、CSRF、跨域、单次邮件令牌、重置撤销会话、旧快照写入、并发注册、OAuth 状态和回调、邮箱冲突、绑定及最后一种登录方式保护。OIDC 测试使用本地 RSA 签名和模拟 HTTP 边界，覆盖错误签名、issuer、audience、nonce、过期及 userinfo 身份不匹配。前端测试覆盖真实表单提交、显式验证邮箱和 SMTP 未配置状态

浏览器验证使用隔离数据库与私有 SSH 隧道，真实网关双 worker 运行。邮件链接从测试队列读取，不等同于真实 SMTP 发信。没有应用凭据，因此真实 GitHub、Google、NodeLoc 授权和真实邮件投递仍待配置后验收。仓库的托管 CI、Greptile、Veria、Bugbot 未在本地环境运行，不能视为通过

## 2026-11-01 认证首次发布记录

后续余额、兑换码和充值扩展的运行版本与验证记录见 [WALLET.md](WALLET.md)

运行代码为 `551d604c`，镜像 ID 为 `sha256:c5b33b631671b33352bf9039b78727177a2fe2c2becce40dc1551a911ad3c20a`。服务健康检查通过，首页跳转用户登录页，用户页面与原有管理后台均可通过 HTTPS 访问。公网确认注册请求返回 `registration_closed`，提供商列表为空，邮件功能关闭。管理员登录及 API 的无 Key 401、有管理员 Key 200 行为均通过，生产客户表无测试账户

47 项后端测试和 3 项前端集成测试通过，新增 Python 模块的 Ruff strict、类型纪律检查和 basedpyright 目标 Python 3.10 校验通过，三份 Prisma schema 一致且校验通过。前端类型检查与静态生产构建通过，OpenAPI 类型已重新生成。独立审查发现的问题已修复并补充回归

隔离环境完成浏览器注册、密码登录、邮箱验证、修改密码、重新登录和手机布局检查，原生后台登录及模型列表鉴权也使用最终镜像验证。邮件 worker 已独立启动并连接隔离数据库，内存上限调整为 512 MiB；没有进行真实 SMTP 投递。回调异常路径的授权码已确认不会写入 Uvicorn 访问日志

生产配置为 `/opt/cocaapi/auth.env`，本地编辑副本为 `E:\key\greencloud\cocaapi-auth.env`。升级前后数据库备份和受限配置副本位于 `/opt/cocaapi/backups/auth-20261101T125546Z/`，备份目录已通过 `pg_restore --list` 检查，尚未进行完整恢复演练

## 2026-11-01 后台配置发布验证

功能代码为 `761e30df`，镜像 ID 为 `sha256:6eb895e4f719a692cf952b6e209185dfcd44f0517b6963122056f7893fd99bc2`。105 项后端测试和 59 项前端定向测试通过，新增核心 Python 的 Ruff strict、类型纪律、basedpyright Python 3.10 检查通过。三份 Prisma schema 一致且验证通过，216 个迁移通过禁止数据改写检查。前端类型检查和生产构建通过，定向 ESLint 无错误，保留少量内联对象警告；已有 AVIF 构建提示和静态预取片段 404 现象沿用之前发布记录。托管 CI 和外部审查机器人未运行，不计作通过

独立审查发现的停用平台密文完整性问题已修复，回归覆盖启用与停用两种状态。最终镜像在隔离数据库的双 worker 代理上完成真实后台保存与刷新、公开登录方式联动、显式清除和注册开关验证。12 个并发公开请求立即读取新配置，后台刷新后密钥字段为空，清除后入口消失；390 像素布局没有横向溢出。测试使用虚构应用凭据，没有执行真实第三方授权

生产升级前备份位于 `/opt/cocaapi/backups/login-settings-20261101T142701Z/`，数据库备份已通过 `pg_restore --list`，尚未做完整恢复演练。生产没有保存测试凭据或打开注册，原环境配置与 OAuth 未配置状态保留。公网配置接口验证了完整管理员访问、未登录 GET/PUT 拒绝、固定回调、密钥不回显、私有缓存头，以及已有原生登录、模型鉴权和余额接口
