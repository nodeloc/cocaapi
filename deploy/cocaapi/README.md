# cocaapi.com 部署

服务器为 `141.98.197.58`，运行 Debian 13。服务目录为 `/opt/cocaapi`，Caddy 配置为 `/etc/caddy/Caddyfile`。公开官网为 `https://cocaapi.com/`，用户入口为 `/account/login/`，管理入口为 `/ui/`，API 地址为 `https://cocaapi.com/v1`。官网静态发布与验收见 [WEBSITE.md](WEBSITE.md)

基础网关固定为官方 LiteLLM `v1.106.6` 镜像。账号与计费版本使用 `Dockerfile.auth` 在该固定摘要上构建，复用现有前端组件，提供 `/account/` 用户中心、钱包、兑换码与调用扣费。管理员继续使用 `/ui/`，模型 API 仍为 `/v1`。USDT 支付网关按 [WALLET.md](WALLET.md) 保留适配接口

## 配置和凭据

`compose.yaml` 运行双 worker 网关、PostgreSQL 和 Redis。网关只绑定宿主机 `127.0.0.1:4000`，数据库和缓存不发布宿主机端口。数据存储在 `cocaapi_postgres_data` 和 `cocaapi_redis_data` 卷中

`config.yaml` 初始模型列表为空，可通过后台添加已授权的上游模型和 API Key。在配置真实上游之前，只能验证网关、管理后台和鉴权，无法验证模型推理

已登记的上游、模型映射、调用验证及开放状态见 [UPSTREAMS.md](UPSTREAMS.md)

服务器 `.env` 保存数据库密码、Redis 密码、master key、盐和后台登录信息，文件权限为 `600`。本地备份为 `E:\key\greencloud\cocaapi-production.env`。登录用户名为 `UI_USERNAME`，密码为 `UI_PASSWORD`。不要提交 `.env` 或在日志中输出它

`LITELLM_SALT_KEY` 用于已保存凭据的加密，添加模型后不能随意更改。备份数据库时同时保存 `.env`，并将备份存放在受控位置

## 启动和检查

在服务目录执行以下命令

```sh
docker compose -f compose.yaml -f compose.auth.yaml config --quiet
docker compose -f compose.yaml -f compose.auth.yaml up -d
docker compose -f compose.yaml -f compose.auth.yaml ps
curl --fail http://127.0.0.1:4000/health/readiness
```

首次部署时，在该目录运行 `python3 generate_secrets.py` 生成凭据。脚本遇到已有 `.env` 会退出，不会轮换已有密码或盐

Caddy 由系统服务管理，并自动签发和续期证书。域名通过 Cloudflare 代理访问，源站证书也必须有效。Caddy 的 HTTP-01 验证路径需要能经 Cloudflare 到达源站

## 数据备份

以下命令生成 PostgreSQL 自定义格式备份，不删除已有备份

```sh
cd /opt/cocaapi
umask 077
docker compose exec -T postgres pg_dump -U cocaapi -d cocaapi -Fc > "backups/cocaapi-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

使用 `pg_restore --list` 检查备份目录。恢复操作应在独立测试数据库中演练，再用于生产。当前没有配置异地备份或自动备份任务

## 升级

登录、用户后台与管理后台的新 Logo、纯前端镜像构建和验收见 [BRANDING.md](BRANDING.md)

用户账号扩展见 [AUTH.md](AUTH.md)，余额、兑换码和 USDT 接口的构建与发布见 [WALLET.md](WALLET.md)。扩展镜像使用 `compose.yaml` 与 `compose.auth.yaml`，升级时需要同时指定两个文件，保留 `.env` 的精确 `COCAAPI_IMAGE` 和独立 `auth.env`

升级前保存 `.env`、配置文件和数据库备份，记录当前镜像摘要。验证新镜像后更新 Compose 的精确版本及摘要，执行 `docker compose up -d` 并验证后台、数据库和模型调用。数据库迁移可能影响回滚，恢复旧镜像前应先判断旧版本是否兼容迁移后的结构

## 首次部署验证

2026-11-01 已完成 Compose 配置校验、Caddy 配置校验和 PostgreSQL 初始化。网关双 worker 启动，三个容器均为 healthy。Docker 和 Caddy 系统服务均已启用开机启动

公网后台页面返回 200，未登录访问模型列表和无效 Key 均返回 401，管理员 Key 返回 200。后台用户名密码登录返回 303 并跳转 `/ui`。容器内实际 OpenAI SDK 通过 `https://cocaapi.com/v1` 成功读取模型列表，当前列表为空

重启网关后再次通过 readiness 检查和 OpenAI SDK 请求。首次 PostgreSQL 备份位于服务器 `backups/cocaapi-20261101T114757Z.dump`，已通过 `pg_restore --list` 检查，尚未做完整恢复演练

Cloudflare 对默认 `Python-urllib` User-Agent 返回 1010 拦截。该请求未到达网关，使用部署检查标识及实际 OpenAI SDK 的公网请求已通过。本次没有修改 Cloudflare 的安全配置
