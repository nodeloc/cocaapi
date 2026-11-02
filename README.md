<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nodeloc/cocaapi/litellm_account_auth/ui/litellm-dashboard/public/assets/cocaapi/cocaapi-logo-horizontal-white.svg">
    <img src="https://raw.githubusercontent.com/nodeloc/cocaapi/litellm_account_auth/ui/litellm-dashboard/public/assets/cocaapi/cocaapi-logo-horizontal-black.svg" alt="CocaAPI" width="260">
  </picture>
</h1>

<p align="center">面向多用户的 AI API 网关与计费平台</p>

<p align="center">
  <a href="https://cocaapi.com">官网</a> ·
  <a href="https://demo.cocaapi.com">在线体验</a> ·
  <a href="https://github.com/nodeloc/cocaapi/tree/litellm_account_auth">CocaAPI 源码</a> ·
  <a href="https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/README.md">部署文档</a> ·
  <a href="https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/LICENSE">许可证</a>
</p>

CocaAPI 基于 [LiteLLM](https://github.com/BerriAI/litellm)，在模型接入、路由与管理后台之上，增加用户注册、OAuth 登录、个人控制台、钱包扣费、兑换码和分组倍率，适合部署需要多用户管理与按量计费的 API 服务

**CocaAPI 扩展在 [`litellm_account_auth`](https://github.com/nodeloc/cocaapi/tree/litellm_account_auth) 分支维护**。下方克隆命令已指定该分支；上游 SDK 与网关说明保存在 [LiteLLM 原始 README](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/README_LITELLM.md)

## 功能

| 模块 | 支持内容 |
| --- | --- |
| 模型网关 | 复用 LiteLLM 的模型适配、统一 API、路由、预算和限流能力，管理员配置上游与模型 |
| 注册与登录 | 邮箱注册、验证邮箱、密码登录与重置，GitHub、Google、NodeLoc OAuth 登录及账号绑定 |
| 用户控制台 | 个人 API Key、模型目录、流式 Playground、用量统计、请求日志和调用限额 |
| 钱包计费 | USD 余额、调用前预扣、按实际费用结算、差额退回、余额不足拦截和资金流水 |
| 分组与倍率 | 用户组、模型组、组间调用倍率与禁用规则；新注册用户默认进入普通组 |
| 兑换码 | 按批次生成、面额、有效期、停用与一次性导出，默认每人每批次限兑一次，可允许多次兑换 |
| 充值与订单 | 管理员余额调整、充值订单记录与核查；USDT 支付网关预留适配接口 |
| 管理与权限 | 用户模型授权、Key 权限、预算与速率限制，账户、计费和配置操作审计 |
| 界面 | 用户后台复用原管理后台组件与样式，统一 CocaAPI 品牌，支持中文 / English 切换与语言记忆 |

邮箱注册及邮件找回密码需要配置 SMTP；第三方登录需要配置对应平台的 OAuth 应用。**USDT 支付网关尚未接入，当前不提供真实链上收款**

钱包调用目前覆盖文本 Chat、Completions、Responses、Messages 与 Embeddings，具体参数和开放范围见[用户网关文档](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/GATEWAY.md)。用户组和模型组叠加倍率与禁用规则，原有账户及 Key 的模型权限、预算和限流继续生效

## 快速开始

以下示例用于 Linux 自托管，需要 Git、Python 3、Docker Compose，以及满足前端 `package.json` 引擎要求的 Node.js 与 npm。完整部署需要构建 CocaAPI 前端和扩展镜像

```sh
git clone --branch litellm_account_auth https://github.com/nodeloc/cocaapi.git
cd cocaapi

npm --prefix ui/litellm-dashboard ci
npm --prefix ui/litellm-dashboard run build
npm --prefix ui/litellm-dashboard run postbuild

docker build -f deploy/cocaapi/Dockerfile.auth -t cocaapi:local .

cd deploy/cocaapi
python3 generate_secrets.py
cp auth.env.example auth.env
```

启动前，按[账号配置文档](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/AUTH.md)编辑 `.env`、`auth.env` 与 `compose.yaml`

| 配置 | 用途 |
| --- | --- |
| `.env` 中的 `COCAAPI_IMAGE=cocaapi:local` | 指定上一步构建的扩展镜像 |
| `COCAAPI_PUBLIC_URL` 与 `PROXY_BASE_URL` | 改为自己的公开 HTTPS 地址，保持账号回调与后台入口一致 |
| `COCAAPI_AUTH_SECRET` | 至少 32 字符的独立随机密钥，用于账号会话和认证数据加密 |
| `COCAAPI_REDEMPTION_SECRET` | 至少 32 字符的另一份独立随机密钥，用于兑换码摘要 |
| `COCAAPI_TRUSTED_PROXIES` | 按实际反向代理来源配置，默认值对应仓库 Compose 网络 |

`generate_secrets.py` 会生成数据库、Redis、管理员和 LiteLLM 密钥，遇到已有 `.env` 时保留原值。`auth.env` 中的认证与兑换码密钥需单独设置，与数据库一同备份。注册开关、OAuth 应用和 SMTP 可按需配置

完成配置后，在 `deploy/cocaapi` 目录启动服务

```sh
docker compose -f compose.yaml -f compose.auth.yaml config --quiet
docker compose -f compose.yaml -f compose.auth.yaml up -d
docker compose -f compose.yaml -f compose.auth.yaml ps

curl --fail http://127.0.0.1:4000/health/readiness
```

仓库 Compose 将网关绑定在 `127.0.0.1:4000`，通过 HTTPS 反向代理提供公网访问。[部署文档](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/README.md)包含域名、备份、升级及检查说明；[账号文档](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/AUTH.md)说明邮件 worker 的启用方式

首次使用时，管理员配置上游模型、模型价格、用户权限和调用预算。用户取得可用模型权限及余额后，可创建个人 API Key，并通过 API 或 Playground 调用

## 页面入口

以下路径均相对于自己的部署域名

| 入口 | 路径 |
| --- | --- |
| 用户登录 / 注册 | `/account/login/`、`/account/register/` |
| 用户控制台 | `/account/home/` |
| 个人 API Key | `/account/keys/` |
| Playground | `/account/playground/` |
| 余额与充值 / 订单 | `/account/wallet/`、`/account/orders/` |
| 管理后台 | `/ui/` |
| 余额、兑换码与订单管理 | `/ui/commerce/` |
| 登录与注册设置 | `/ui/commerce/settings/` |
| 用户组、模型组与倍率 | `/ui/commerce/groups/` |
| 模型 API | `/v1` |

## API 调用

将 `COCAAPI_API_KEY` 设置为用户后台创建的 Key，将域名与 `my-model` 替换为自己的部署地址和管理员公开的模型名。请求支持流式输出，API 和用户 Playground 使用同一钱包计费

```sh
curl https://your-domain.example/v1/chat/completions \
  -H "Authorization: Bearer ${COCAAPI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "my-model",
    "messages": [{"role": "user", "content": "你好，请介绍一下自己"}],
    "max_tokens": 1024,
    "stream": true
  }'
```

调用费用先按预计额度预扣，再按实际费用及请求开始时的组间倍率结算。余额不足时拒绝调用；充值和兑换继续遵守已有模型权限与调用限额，不能代替模型授权或提高原生 API 预算

## 文档

| 文档 | 内容 |
| --- | --- |
| [部署与维护](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/README.md) | 服务配置、启动、备份与升级 |
| [账号与 OAuth](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/AUTH.md) | 注册、登录、SMTP、OAuth 和后台配置 |
| [用户网关](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/GATEWAY.md) | 个人 Key、模型、Playground、用量与日志 |
| [钱包与支付适配](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/WALLET.md) | 余额、兑换码、调用结算与 USDT 接口 |
| [分组与倍率](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/BILLING_GROUPS.md) | 用户分组、模型分组、倍率、禁用与计费快照 |
| [中英文界面](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/I18N.md) | 语言切换、词库维护与前端发布 |
| [用户界面复用](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/ACCOUNT_UI.md) | 原生管理页面与用户后台的组件复用 |
| [品牌素材](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/BRANDING.md) | Logo、主题与静态资源 |
| [贡献指南](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/CONTRIBUTING.md) | 开发与贡献约定 |

## 上游与许可证

CocaAPI fork 自 [BerriAI/LiteLLM](https://github.com/BerriAI/litellm)，保留上游版权声明、模型适配与 SDK 实现。[LiteLLM 原始 README](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/README_LITELLM.md)保留了上游功能介绍和资料入口

本仓库根 [LICENSE](https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/LICENSE) 对其覆盖的内容采用 MIT 许可，并对 `enterprise/` 目录作单独说明。使用和分发时以对应许可证文件为准
