# Wallet, Recharge and Redemption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 交付余额和流水、充值订单与网关适配接口、兑换码及后台管理，保持现有界面风格

**Architecture:** 复用当前账号、受限 Cookie、原生管理员鉴权和 Prisma writer 生命周期。资金变更与业务状态、流水在同一个 PostgreSQL 事务中完成。网关未配置时禁止生成可支付订单和接收到账通知，不提供测试支付入口到生产

**Tech Stack:** Python、FastAPI、Prisma、PostgreSQL、Next.js、React、shadcn、TypeScript、Docker、Caddy

**Spec:** `docs/superpowers/specs/2026-11-01-cocaapi-user-billing-design.md`

## Global Constraints

金额为 USD 额度，`1 USD credit = 1,000,000,000 units`，数据库为受非负约束的 BigInt，API 的 units 为十进制字符串

客户身份继续关联 `CommerceCustomer.user_id`，初始余额为零。兑换、下单和查单操作要求有效会话和已验证邮箱，读取订单与流水只允许所属客户

客户余额不改变原生用户的模型权限和额度。本阶段不创建推理 Key，不接入消费预留与扣款，后续计费不能从浮点 budget 倒推本账本

充值必须通过已配置适配器的服务端验签及主动查单核实，校验商户订单、外部支付 ID、币种、网络及精确金额。网页返回地址不能触发到账，重复或乱序通知不得重复加款

兑换码使用随机明文、带域隔离的摘要，只在生成响应中提供一次。常规列表与审计不能包含明文，批次停用与兑换需要使用同一批次行锁

schema-only 迁移同步维护三份 Prisma schema，禁止迁移改写已有客户数据。旧客户钱包按需建立

## Task 1 金额、余额和流水

**Files:** `litellm/models/commerce_wallet.py`、`litellm/repositories/commerce_wallet_repository.py`、`litellm/proxy/commerce/wallet_service.py`、三份 schema、新迁移、`tests/unit/proxy/commerce/test_money.py`、`tests/integration/commerce/test_wallet_transactions.py`

**Interfaces:** `parse_usd(value: str) -> int | AuthError`；`WalletService.balance(session)`；`WalletRepository.adjust(user_id, units, business_key, actor, reason, now)`；`WalletRepository.redeem(session, code_hash, now)`。所有结果为具体冻结模型或 AuthError

- [x] 先写并运行精确金额和非法输入测试，确认缺少金额处理时失败
- [x] 实现 Decimal 到整数额度转换，拒绝指数、负数、超过两位小数、非数字和越界金额
- [x] 建立钱包和不可覆盖的流水，测试零余额、同业务键重复提交、不同参数复用业务键、负余额与溢出
- [x] 仓储事务锁定客户和钱包，先检查余额和幂等参数，再提交钱包变更与流水

```sql
UPDATE "CommerceWallet" SET available_units=available_units+$2::bigint,
  credited_units=credited_units+GREATEST($2::bigint,0),
  debited_units=debited_units+GREATEST(-$2::bigint,0)
WHERE user_id=$1 AND available_units+$2::bigint BETWEEN 0 AND 9223372036854775807;
```

- [x] 使用独立测试数据库验证并发和故障回滚，运行类型与迁移检查

## Task 2 兑换码和管理鉴权

**Files:** `litellm/repositories/commerce_redemption_repository.py`、`litellm/proxy/commerce/wallet_routes.py`、`litellm/proxy/commerce/admin_wallet_routes.py`、`tests/integration/commerce/test_redemption.py`、`tests/integration/commerce/test_wallet_authorization.py`

**Interfaces:** 客户 `GET /account/api/v1/wallet`、`GET /wallet/transactions`、`POST /redemptions`；管理员 `GET /commerce/admin/v1/wallets`、`POST /wallets/{user_id}/adjustments`、`GET/POST /redeem-batches`、`POST /redeem-batches/{batch_id}/disable`

- [x] 测试同码竞争只有一笔入账、过期边界、停用批次、失效会话、未验证邮箱和禁用账号
- [x] 生成随机兑换码并只存摘要、尾号、面额和批次，创建请求要求 Idempotency-Key，重放不再次发码
- [x] 先锁批次和码，再锁客户和钱包，额度记账成功后才更新核销状态；任一数据库异常回滚全部写入
- [x] 复用原生 `UserAPIKeyAuth`，仅完整代理管理员可进行余额调整、发码、批次停用，所有变更记录操作者和原因
- [x] 测试客户 Cookie、普通内部用户、只读管理员和跨用户请求均不能取得管理权限

## Task 3 充值订单与 USDT 适配接口

**Files:** `litellm/models/commerce_payment.py`、`litellm/repositories/commerce_payment_repository.py`、`litellm/proxy/commerce/payment_gateway.py`、`litellm/proxy/commerce/payment_service.py`、支付路由与相应集成测试

**Interfaces:** `PaymentGateway.available_networks()`、`create_payment(order)`、`fetch_payment(order)`、`verify_notification(body, headers)`。客户 `GET /payment-methods`、`POST/GET /recharge-orders`、`GET /recharge-orders/{id}`、`POST /recharge-orders/{id}/refresh`；回调 `POST /commerce/webhooks/{provider}`

- [x] 用测试适配器覆盖验签失败、金额/网络/币种/商户单号错误、重复通知、提前回调和外部创建超时
- [x] 将订单意图及请求幂等键持久化后调用适配器，重试使用相同商户订单复查，不重复创建外部支付
- [x] 保存服务端报价快照与支付链接，支付状态通过主动查单确认。订单加款与账本 business_key、外部事件唯一键在同一事务提交
- [x] 未配置适配器时提供商列表为空，下单和回调返回不可用，不实现未经文档验证的通用签名
- [x] 管理员可查询订单和发起服务端复核，不能将未核实订单直接标记为已支付

## Task 4 用户与管理页面、验证和发布

**Files:** `ui/litellm-dashboard/src/components/account/` 的钱包与订单组件，`src/app/account/wallet/`、`src/app/account/orders/`、`src/app/(dashboard)/commerce/`，管理导航、生成的 API 类型、部署 Dockerfile 和运维文档

- [x] 金额展示使用 BigInt 字符串运算，先写前端精度和表单网络测试
- [x] 复用 Card、Button、Input、Table、Badge、Alert 及现有主题，加入账户/余额/订单导航
- [x] 提供余额与流水、兑换结果、充值金额/网络与订单状态。网关未接入时显示充值暂未开放，禁用付款按钮
- [x] 提供后台账户余额查询、带原因调整、兑换批次生成与一次性导出、停用以及订单复核
- [x] 重新生成 OpenAPI 类型，运行定向测试、lint、类型检查和生产构建，独立审查资金事务与权限
- [x] 使用独立数据库与最终双 worker 镜像完成浏览器测试，不向生产写入测试余额、兑换码或支付状态
- [ ] 备份数据库及密钥配置后发布，检查原有登录、OAuth 配置、后台、余额页面和 API 鉴权，提交并推送
