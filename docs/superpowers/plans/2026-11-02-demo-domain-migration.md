# CocaAPI 应用域名迁移 Implementation Plan

> 在当前会话内执行，逐项验证配置、真实 HTTPS 与页面行为，沿用现有部署及回退方式

**Goal:** 后台、用户中心及 API 使用 `demo.cocaapi.com`，`cocaapi.com` 服务官网

**Architecture:** Caddy 分离官网与应用虚拟主机，应用继续使用现有网关、数据库及密钥。同步代理公开地址、账号公开地址、前端接入文档和官网入口；旧应用路径保留到新域名的跳转

**Tech Stack:** Caddy、Docker Compose、LiteLLM、React 静态导出、HTTPS、Playwright

**Spec:** 用户要求“把应用域名换成 demo.cocaapi.com，根域名我要放官网”

## Task 1: 现状与备份

- [x] 确认两个域名 DNS、当前网关镜像、官网软链接、Compose 和 Caddy 配置
- [x] 备份数据库、配置、实际运行环境及镜像标识，保留全部认证和计费密钥
- [x] 核对已启用 OAuth 平台及 SMTP 状态，保存用户提供的新 NodeLoc 凭据并完成新回调的授权发起预检

## Task 2: 配置与链接

- [x] `deploy/cocaapi/Caddyfile` 分离根域名官网和 demo 应用，保留流式代理与私有响应头
- [x] `compose.yaml` 与 `auth.env.example` 更新公开地址，生产使用当前已验证镜像
- [x] `AccountGatewayDocs.tsx` 按当前应用来源生成 API 地址，避免再次固定域名
- [x] 官网登录、注册、控制台和 API 示例使用 demo，保留官网 canonical、分享图及 sitemap 的根域名
- [x] 更新部署说明和当前入口，历史发布记录保留原有信息

## Task 3: 发布与验收

- [x] 构建前端增量镜像，基于当前实际生产镜像保留所有后端代码
- [x] 配置并验证 demo HTTPS，启动新公开地址的预发布实例
- [x] 验证管理员登录、客户会话、CSRF、OAuth 发起的回调地址、页面与 API 鉴权、流式响应头及根官网
- [x] 切换主实例，核对密钥和模型配置、服务健康及旧链接跳转
- [x] 清理临时会话和预发布实例，更新文档、提交并推送，记录 OAuth 真实验收范围
