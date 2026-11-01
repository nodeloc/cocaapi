# Customer Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking

**Goal:** 将适合个人用户的网关功能加入现有用户中心，并在服务端隔离客户数据

**Architecture:** 新增客户会话保护的 gateway API，使用当前 Session 的 user_id 查询原生个人密钥、预算、SpendLogs。密钥生成、删除和模型调用通过原生 FastAPI 应用执行，保留原生鉴权、计费和缓存失效。客户接口只返回白名单字段，不向浏览器提供管理凭据

**Tech Stack:** FastAPI、PostgreSQL、Pydantic、httpx ASGITransport、Next.js 静态导出、现有 Sidebar/Card/Table/Form

**Spec:** 用户列出原管理后台菜单，要求核对并放入适合前台用户的功能，保持现有风格

## 功能选择

| 原功能 | 用户中心处理 |
| --- | --- |
| Home | 个人概览、余额、最近 30 天调用摘要 |
| Virtual Keys | 自己的个人密钥，生成后仅显示一次，可删除，不能选择其他用户或团队 |
| Playground | 用自己的密钥测试已授权模型，经原生调用链计费 |
| Models + Endpoints、AI Hub | 合并为可用模型目录，不显示上游 URL、部署或凭据 |
| Usage | 自己密钥的调用次数、Token、费用、每日和模型汇总 |
| Logs | 自己密钥的请求时间、模型、状态、Token、费用，不显示内部元数据或提示词正文 |
| Budgets | 只读个人调用预算与速率限制，不开放修改平台额度 |
| API Reference、Learning Resources | 接入地址、示例和官方参考资料 |
| 账户与充值 | 沿用客户钱包、兑换码与订单 |
| Model Leaderboard、Cost Optimization | 个人用量的模型汇总；不公开全站排行榜与成本配置 |
| Agentic、MCP、Skills、Tools | 涉及平台工具与权限配置，保留管理员管理 |
| Guardrails、Policies、Guardrails Monitor | 保留管理员配置和监控 |
| Lens、Teams、Internal Users、Organizations、Access Groups | 保留管理员，不给个人账户开放全局数据或权限管理 |
| Response Cache、Experimental、Settings、登录与注册 | 保留管理员配置，客户账号安全使用现有安全页 |

## Global Constraints

客户不能传入 user_id、team_id、预算上调、任意上游地址或平台配置。数据仅关联登录客户拥有的非团队密钥，删除后的历史通过原生删除档案保留。禁止把原生 key hash 或管理 Key 回传客户。写操作使用已有 Origin、CSRF 与限流，密钥和 Playground 输入仅保存在内存。注册及 OAuth 配置不改动，不将钱包余额冒充为已接入的原生调用预算，新账号保持管理员分配前的零预算和无模型权限

## Task 1 服务端客户接口

**Files:** `litellm/models/commerce_gateway.py`、`litellm/repositories/commerce_gateway_repository.py`、`litellm/proxy/commerce/gateway_service.py`、`gateway_routes.py`、`native_gateway.py`、`account_routes.py`、`tests/integration/commerce/test_customer_gateway.py`

- [x] 先测试接口缺失，再实现个人预算、密钥、用量及日志查询
- [x] 两个客户种子数据验证隔离，用户字段伪造不改变查询范围，删除档案保留历史
- [x] 原生密钥生成/删除及 Playground 走已有应用，强制 owner、模型、预算、邮箱与 CSRF 校验
- [x] 真实隔离网关验证原生密钥与权限边界，不写入生产测试数据

## Task 2 客户页面

**Files:** `ui/litellm-dashboard/src/components/account/gatewayApi.ts`、`AccountGateway*.tsx`、`src/app/account/{home,keys,models,playground,usage,logs,limits,docs}/page.tsx`、`AccountDashboardShell.tsx`、相关定向测试、生成的 `schema.d.ts`

- [x] 生成后端 OpenAPI 类型，新增真实客户请求封装
- [x] 先失败的表单与导航测试，再完成概览、密钥、模型、测试、用量、日志、预算及文档页面
- [x] 复用已有模板、主题、移动菜单，提供加载、空状态、错误与明确的复制反馈
- [x] 定向测试、类型、ESLint、生产构建和独立代码审查

## Task 3 验收发布

- [x] 最终镜像与隔离账户完成桌面、手机、深色及主要流程浏览器验收
- [x] 生产备份，预发布检查，切换主网关，核对现有 OAuth 和注册配置未变
- [x] 更新功能与发布记录，提交推送并清理测试环境
