# Customer Playground Streaming Implementation Plan

> **For agentic workers:** Execute the steps in order and verify each deliverable before release

**Goal:** 用户 Playground 默认边生成边显示，保留余额检查、正常结算、截断提示及原生界面

**Architecture:** 复用已有 `/v1/chat/completions` SSE 与钱包预扣链路。流式请求先通过带会话及 CSRF 的账号接口校验 Key 归属、模型授权及限流，再用该个人 Key 请求固定同源的原生 API。前端只传递允许的聊天参数，以增量转换保留公开内容、结束原因和 Token 统计，避免将上游零成本字段当作平台售价

**Tech Stack:** FastAPI、现有 GatewayService、原生 LiteLLM 钱包回调、Fetch ReadableStream、OpenAI SDK、React 原生 Playground

**Spec:** 本次用户要求及已上线输出上限、余额预扣行为

## Global Constraints

不得绕过账号 Key 归属、模型权限、余额预扣或限额。默认输出上限 4096，可选 1 到 32768。保留非流式方式、真实结束原因及空正文后的续问。中断或不确定的上游结果继续执行现有计费复核策略，不承诺自动免费。所有凭据只保存在受限文件，不进入 Git 或聊天

## Task 1: Authorize the existing stream path

**Files:** `litellm/proxy/commerce/gateway_service.py`、`gateway_routes.py`、`tests/integration/commerce/test_customer_gateway.py`

- [x] 先写拒绝非本人 Key、未授权模型、未验证邮箱及无 CSRF 的用例，并确认旧版本失败
- [x] 抽出原有聊天授权方法，新增 `/account/api/v1/gateway/playground/authorize`，与非流式入口共享限流及授权逻辑
- [x] 验证授权不会发起模型请求或产生扣费，原有非流式测试继续通过

## Task 2: Connect the native streaming UI

**Files:** `gatewayApi.ts`、`native/customerNativeRequest.ts`、新增 `native/customerChatStream.ts`、原生 `ChatUI.tsx` 及对应测试

- [x] 先写增量显示、跨包 SSE、费用字段过滤、错误、AbortSignal 及可切换流式的回归用例
- [x] 使用固定同源原生 API、个人 Key 和允许的请求字段，返回真实 ReadableStream，保留取消信号
- [x] 沿用原生流式开关与消息组件，默认开启，保留可关闭及 Max Tokens 设置
- [x] 生成 OpenAPI 类型，运行相关前端测试、类型检查、构建与静态导出处理

## Task 3: Verify billing and release

**Files:** `tests/integration/commerce/test_api_billing.py`、增量部署 Dockerfile、`deploy/cocaapi/UPSTREAMS.md`

- [x] 使用真实 HTTP 和隔离数据库验证：余额不足不出流、成功结算一次并释放差额、失败及中断遵循现有复核策略
- [x] 独立代码复查，备份生产配置与数据库，构建基于当前镜像的增量版本
- [x] 临时账号验收真实模型及浏览器，确认首段先于结束到达、最终用量与扣费一致
- [x] 切回主实例，撤销测试 Key、停用临时账号、审计回收余额，保留账本
- [x] 更新部署文档和版本，提交并推送代码
