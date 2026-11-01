# 用户账号部署

本次包含邮箱注册、登录、验证邮箱、找回和修改密码，以及 GitHub、Google、NodeLoc 注册、登录和绑定。新用户关联普通 LiteLLM 用户，额度为 0，模型列表为 `no-default-models`。密码仅保存在 `CommerceCustomer`，原生后台登录不会接受用户中心密码。邮箱未验证时可查看账号，验证后才能修改密码或绑定第三方身份

实现参考了 New API 的功能组织，未复制其 AGPL 源代码。账号 API 在 `/account/api/v1`，独立于管理员 JWT。浏览器仅保存 HttpOnly 会话 Cookie，服务器保存摘要。OAuth 状态由数据库单次消费并绑定浏览器，令牌和邮件任务加密保存，跨 worker 不依赖内存状态。相同邮箱不会自动合并账号

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
https://cocaapi.com/account/api/v1/oauth/github/callback
https://cocaapi.com/account/api/v1/oauth/google/callback
https://cocaapi.com/account/api/v1/oauth/nodeloc/callback
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

用户入口为 `https://cocaapi.com/account/login/`，注册页为 `/account/register/`，账号安全页为 `/account/security/`。OAuth 注册无需 SMTP，但没有已验证邮箱的 OAuth 用户需要补充并验证邮箱才能修改安全设置。注册关闭仍允许已有账号登录

## 验证范围

在独立 PostgreSQL 上执行账号 API 集成测试，包括注册权限、CSRF、跨域、单次邮件令牌、重置撤销会话、旧快照写入、并发注册、OAuth 状态和回调、邮箱冲突、绑定及最后一种登录方式保护。OIDC 测试使用本地 RSA 签名和模拟 HTTP 边界，覆盖错误签名、issuer、audience、nonce、过期及 userinfo 身份不匹配。前端测试覆盖真实表单提交、显式验证邮箱和 SMTP 未配置状态

浏览器验证使用隔离数据库与私有 SSH 隧道，真实网关双 worker 运行。邮件链接从测试队列读取，不等同于真实 SMTP 发信。没有应用凭据，因此真实 GitHub、Google、NodeLoc 授权和真实邮件投递仍待配置后验收。仓库的托管 CI、Greptile、Veria、Bugbot 未在本地环境运行，不能视为通过
