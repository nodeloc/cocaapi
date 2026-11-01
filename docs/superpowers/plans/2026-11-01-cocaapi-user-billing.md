# CocaAPI User and Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付用户注册、钱包、消费结算、兑换码、USDT 充值和对应管理能力

**Architecture:** 在 LiteLLM fork 内增加有明确接口的 commerce 模块，复用已有身份、模型路由与数据库生命周期。用户控制台独立静态部署，管理后台保持 `/ui/`，资金使用 PostgreSQL 事务账本

**Tech Stack:** Python、FastAPI、Prisma、PostgreSQL、Redis、React、TypeScript、Next.js、Docker Compose、Caddy

**Spec:** `docs/superpowers/specs/2026-11-01-cocaapi-user-billing-design.md`

## Global Constraints

以 `v1.106.6` 为开发稳定基线，保留当前分支，不重写历史

`1 USD credit = 1,000,000,000 units`，数据库为 BigInt，API 的整数金额为十进制字符串

注册初始余额为零，公开注册初始关闭，未验证用户不能创建 Key、兑换或充值

客户与 `LiteLLM_UserTable.user_id` 一对一绑定，不能另建独立密码来源

客户所有 Key 共用钱包，所有允许的推理入口先预留再结算，未支持的付费入口明确拒绝

资金变更、唯一业务键和流水必须在同一事务提交，Redis 不是资金事实来源

读取规格中的完整状态、异常和验收规则，不将下列任务视为对规则的缩减

本次是规划交付，不执行下列开发、迁移或生产变更。任务按顺序推进，每项完成独立验证与提交，不要求并行代理

## 工程边界与目录

新领域类型放在 `litellm/models/commerce/`，持久化放在 `litellm/repositories/commerce/`，服务、路由与适配放在 `litellm/proxy/commerce/`。核心钱包只依赖领域类型和仓储接口，不依赖 HTTP 或支付商字段

仓储依赖采用已有数据库访问技能的原则，但稳定基线没有 main 的 `litellm/proxy/deps`，先检查其生命周期接线，再在 `litellm/proxy/commerce/dependencies.py` 增加所需的最小提供器，不能为了新增业务移植整个 main

用户前端放在 `ui/cocaapi-console/`。商业管理界面放在现有管理项目 `ui/litellm-dashboard/src/app/(dashboard)/commerce/`，接口统一封装在 `src/components/commerce/`，避免页面直接拼接管理员凭据

测试按仓库约定分别放在 `tests/unit/`、`tests/integration/commerce/` 和 `tests/e2e/commerce/`，数据库与可控上游测试属于 integration，第三方真实服务测试属于 e2e。UI 浏览器测试放在 `tests/e2e/ui/commerce/`

## Task 1 稳定基线与计费执行路径

**Files:** 创建 `docs/design/cocaapi-billing-paths.md`、`deploy/cocaapi/Dockerfile`、`deploy/cocaapi/compose.staging.yaml`，调整 `deploy/cocaapi/compose.yaml` 的自定义镜像来源

**Interfaces:** 输入为线上固定镜像和稳定 tag，输出为可复现预发布环境以及协议、认证、预留、结算、取消和后台任务的接入清单

- [ ] 在新分支检出 `v1.106.6`，迁入自有部署与文档提交，记录来源，保留现有 `litellm_user_wallet`
- [ ] 阅读稳定版 AGENTS、数据库生命周期、仓储、成本确定与流式终止路径，记录每个允许或拒绝的付费入口
- [ ] 为客户请求定义稳定的服务器请求标识，不使用客户端可复用的 header 作为扣费去重依据
- [ ] 使用独立 Compose 项目、数据库卷和预发布地址构建自定义镜像，不能连接生产数据库或使用生产 `.env`
- [ ] 验证两个 worker、Redis 协调、原有后台登录、普通内部用户与无模型配置的启动行为
- [ ] 提交基线、镜像和接入清单，尚未验证的推理入口不进入第一版允许列表

验证命令采用预发布实例与稳定基线现有测试 harness。实际运行 `docker compose -f deploy/cocaapi/compose.staging.yaml config --quiet`，通过后记录实际启动和健康检查命令及结果

## Task 2 账本与事务

**Files:** 创建 `litellm/models/commerce/wallet.py`、`litellm/repositories/commerce/wallet.py`、`litellm/proxy/commerce/wallet_service.py`、`litellm/proxy/commerce/dependencies.py`，修改 `schema.prisma`，新增该次生成的 Prisma migration

**Tests:** `tests/unit/proxy/commerce/test_wallet_service.py`、`tests/integration/commerce/test_wallet_transactions.py`

**Interfaces:** `credit(user_id: str, units: int, business_key: str) -> CreditResult`，`reserve(user_id: str, request_id: str, units: int) -> ReserveResult`，`settle(request_id: str, charged_units: int) -> SettleResult`，`release(request_id: str) -> ReleaseResult`。所有 Result 为明确成功或失败类型，不返回原始 Prisma 行

- [ ] 建立钱包、流水、预留与价格类型，新增 BigInt、非负约束、唯一业务键和用户关联，迁移只改变结构
- [ ] 写重复加款、并发预留、结算重放和事务失败回滚测试，运行确认实现缺失时失败
- [ ] 在仓储内部实现条件更新、行锁与流水事务，读判断后写必须处于同一真实事务，不能只使用不支持条件读取的 batch 模拟
- [ ] 实现余额、冻结和账本一致性查询，人工加款入口要求管理员与原因
- [ ] 在真实 PostgreSQL 与至少两个并发连接下验证，覆盖多进程而非只测 asyncio 锁
- [ ] 执行针对性测试，校验迁移并提交

下面的数据库语义作为预留实现依据，后续插入预留和流水必须使用同一事务

```sql
UPDATE "CommerceWallet"
SET "available_units" = "available_units" - $2,
    "reserved_units" = "reserved_units" + $2,
    "version" = "version" + 1
WHERE "user_id" = $1 AND "available_units" >= $2
RETURNING "available_units", "reserved_units", "version";
```

`units > 0` 在领域层验证，更新零行返回余额不足，不能继续调用模型。对重复请求先查询同事务内的唯一 reservation，唯一冲突不能导致第二次扣减

运行 `pytest tests/unit/proxy/commerce/test_wallet_service.py tests/integration/commerce/test_wallet_transactions.py -q`，重点证据为同一钱包不足以支持全部并发请求时，只允许可支付的请求成功

## Task 3 请求预留、费用结算与恢复

**Files:** 创建 `litellm/models/commerce/pricing.py`、`litellm/proxy/commerce/pricing_service.py`、`litellm/proxy/commerce/billing_lifecycle.py`、`litellm/repositories/commerce/outbox.py`、`litellm/proxy/commerce/worker.py`。按 Task 1 清单最小修改 `litellm/proxy/auth/user_api_key_auth.py`、`litellm/proxy/spend_tracking/budget_reservation.py`、`litellm/proxy/spend_tracking/cost_finalization.py` 和实际公共终止路径

**Tests:** `tests/unit/proxy/commerce/test_pricing_service.py`、`tests/integration/commerce/test_billing_lifecycle.py`、`tests/e2e/commerce/test_paid_inference.py`

**Interfaces:** `authorize_paid_request(...) -> PaidRequestContext | BillingRejection`，context 保存不可变的用户、请求、价格版本与预留标识。`record_final_usage(context, usage) -> SettlementReceipt` 持久化终态事件，worker 使用幂等 business_key 完成结算或对账

- [ ] 定义价格版本、倍率快照和 Decimal 舍入规则，写计算与未配置价格的拒绝测试
- [ ] 为付费账户在所有推理入口执行统一覆盖检查，余额不足、账号禁用或未支持的路径在调用上游前拒绝
- [ ] 在上游调用前落库冻结，根据服务器输出上限保证预留可计算，不接受客户端修改计价身份
- [ ] 实现终态事件持久化、事务 outbox、重试租约与待对账状态，不以 detached callback 成功作为唯一完成依据
- [ ] 测试实际费用超过预留的情况，收费不超过事前上限，差额独立记录并触发计价异常处理
- [ ] 对流式、非流式、重试、取消、断线和进程终止分别注入故障，验证余额与流水，不重复收取供应商重试成本
- [ ] 用真实模型完成支持协议的收费调用，对正常完成和中断保留可复现证据，提交后才允许后续充值接入内测

定价边界的示例规则采用完全可控值，不固定任何供应商价格

```python
from decimal import Decimal, ROUND_CEILING

def retail_units(cost: Decimal, multiplier: Decimal) -> int:
    return int((cost * multiplier * Decimal(1_000_000_000)).to_integral_value(rounding=ROUND_CEILING))
```

正式实现补充负数、非有限值与配置范围验证。运行 `pytest tests/unit/proxy/commerce/test_pricing_service.py tests/integration/commerce/test_billing_lifecycle.py -q`，第三方真实模型验证单独执行 `tests/e2e/commerce/test_paid_inference.py`

## Task 4 注册、会话、个人 Key 与用户控制台

**Files:** 创建 `litellm/models/commerce/customer.py`、`litellm/repositories/commerce/customer.py`、`litellm/repositories/commerce/session.py`、`litellm/proxy/commerce/account_routes.py`、`litellm/proxy/commerce/account_service.py`、`litellm/proxy/commerce/customer_key_routes.py`、`litellm/proxy/commerce/mail_adapter.py`，在 `litellm/proxy/proxy_server.py` 注册路由，新增 `ui/cocaapi-console/`

**Tests:** `tests/unit/proxy/commerce/test_account_service.py`、`tests/integration/commerce/test_account_routes.py`、`tests/integration/commerce/test_customer_keys.py`、`tests/e2e/ui/commerce/account.spec.ts`

**Interfaces:** `POST /account/api/v1/register`，`POST /verify-email`，`POST /login`，`POST /logout`，`POST /forgot-password`，`POST /reset-password`，`GET /me`，`GET /wallet`，`GET|POST /keys`，`DELETE /keys/{key_id}`。后述短路径均相对于 `/account/api/v1`

- [ ] 写并发重复邮箱、已有管理员邮箱、角色注入、验证令牌重放、密码重置与会话撤销测试，确认失败后实现
- [ ] 复用已有密码原语并事务创建客户资料与普通用户，添加过期令牌和受限 Cookie 会话
- [ ] 通过具有加密载荷与发送后清理机制的 outbox 发送验证和重置邮件，实施 Origin、CSRF 和限流，日志中不输出密码、令牌或支付密钥
- [ ] 创建个人 Key 时强制使用当前客户 user_id 与允许模型，验证原有管理 API 不能生成可绕过钱包的 Key
- [ ] 实现规格中的注册、登录、控制台、Key、余额和用量页面，所有金额读写遵守字符串与整数规则
- [ ] 为现有账户删除路径加入资金历史检查，账号停用在会话与网关均生效
- [ ] 运行后端定向测试、前端类型与定向浏览器测试，使用真实 SMTP 验证邮件到达和令牌流程，提交

客户创建 Key 的请求只能包含普通可设置字段，例如

```json
{"name":"IDE","models":["enabled-model-alias"],"expires_in_days":30}
```

请求额外提交 `user_id`、`user_role` 或 `wallet_units` 时返回明确校验错误，不能忽略后误当成有效授权。测试使用受控模型别名，不依赖某个厂商的当前模型名称

## Task 5 一次性金额兑换码

**Files:** 创建 `litellm/models/commerce/redemption.py`、`litellm/repositories/commerce/redemption.py`、`litellm/proxy/commerce/redemption_service.py`、`litellm/proxy/commerce/redemption_routes.py`、`litellm/proxy/commerce/admin_redemption_routes.py`，新增两个前端的兑换和批次管理页面

**Tests:** `tests/unit/proxy/commerce/test_redemption_service.py`、`tests/integration/commerce/test_redemption_transactions.py`、`tests/e2e/ui/commerce/redemption.spec.ts`

**Interfaces:** 客户 `POST /account/api/v1/redemptions`，管理员 `POST /commerce/admin/v1/redeem-batches`，`GET /redeem-batches`，`POST /redeem-batches/{id}/disable`。生成响应一次性提供明文下载，其余查询只提供尾号

- [ ] 为并发兑换、过期边界、停用批次、重复业务请求和入账失败回滚编写失败测试
- [ ] 生成安全随机码、计算带版本的 HMAC 摘要，按规格验证金额、数量和有效期
- [ ] 实现占码和钱包入账同事务，错误返回统一失败提示，兑换失败不能烧掉有效码
- [ ] 实现批次导出和未使用批次停用，管理员操作写审计，明文不进入日志或常规数据库字段
- [ ] 完成用户兑换与管理页面，用真实数据库验证多个 worker 同码竞争只产生一笔入账
- [ ] 运行定向测试及浏览器流程后提交，发布内测版本

事务状态转移需满足下面的占用条件，返回零行视为本次不能兑换

```sql
UPDATE "CommerceRedeemCode"
SET "redeemed_by" = $2, "redeemed_at" = $3
WHERE "code_hash" = $1
  AND "redeemed_by" IS NULL
  AND "disabled" = FALSE
  AND ("expires_at" IS NULL OR "expires_at" > $3)
RETURNING "id", "face_units";
```

批次启停检查也在同一事务锁定，不能仅在事务外读一次批次状态。运行 `pytest tests/unit/proxy/commerce/test_redemption_service.py tests/integration/commerce/test_redemption_transactions.py -q`

## Task 6 支付网关、报价订单与到账

**Files:** 创建 `litellm/models/commerce/payment.py`、`litellm/repositories/commerce/payment.py`、`litellm/proxy/commerce/payment_service.py`、`litellm/proxy/commerce/payment_routes.py`、`litellm/proxy/commerce/payment_adapters/base.py`，选定网关后增加对应 adapter，复用 inbox、outbox 和 worker

**Tests:** `tests/unit/proxy/commerce/test_payment_service.py`、`tests/integration/commerce/test_payment_webhooks.py`、`tests/e2e/commerce/test_payment_sandbox.py`、`tests/e2e/ui/commerce/recharge.spec.ts`

**Interfaces:** 适配器 `available_networks()`、`create_payment(order)`、`fetch_payment(payment_id)`、`verify_notification(raw_body, headers)`，都使用具体领域类型。客户 `GET /payment-methods`，`POST /recharge-orders`，`GET /recharge-orders`，`GET /recharge-orders/{id}`，回调 `POST /commerce/webhooks/{provider}`

- [ ] 在支付服务商选定后读取其当前官方文档，记录版本和状态映射，确认商户可用网络、最低金额与费用字段
- [ ] 先用测试 adapter 编写伪造通知、币种网络金额错误、重复与乱序通知、查单失败和重复入账测试，再实现统一订单服务
- [ ] 实现订单报价与创建幂等，创建超时先复查同一个商户订单，网络变更新建订单
- [ ] 实现服务商验签、inbox 持久化、后台查单复核和钱包原子入账，成功页只读订单
- [ ] 添加用户网络选择、支付指引、订单状态和管理员复查页面，未配置商户时支付入口明确未启用
- [ ] 在服务商沙箱和实际预发布回调域名验证重复通知、断网恢复与到账，仅满足最终状态与金额校验才入账
- [ ] 验证 TRON、Ethereum、BNB Smart Chain 的商户实际可用性，再启用对应选项并提交

网关尚未选定时执行到统一订单和测试 adapter，服务商 adapter 与沙箱验收保持为该任务明确依赖，不实现未经验证的通用签名猜测

## Task 7 管理页面、发布与完整验收

**Files:** 创建 `litellm/proxy/commerce/admin_routes.py`、`litellm/repositories/commerce/audit.py`、`ui/litellm-dashboard/src/app/(dashboard)/commerce/`、`.github/workflows/cocaapi-release.yml`、`deploy/cocaapi/backup.sh`、`docs/operations/cocaapi-commerce.md`，调整 Caddy、Compose 与前端产物发布

**Tests:** `tests/integration/commerce/test_admin_authorization.py`、`tests/integration/commerce/test_account_reconciliation.py`、`tests/e2e/ui/commerce/paid_user_journey.spec.ts`

**Interfaces:** 管理接口以 `/commerce/admin/v1` 为前缀，提供账户、流水、充值订单、兑换批次、价格、余额调整和异常结算查询。管理员凭据验证沿用已有 UserAPIKeyAuth，客户 Cookie 不可作为管理凭据

- [ ] 写普通用户、客户会话与管理员权限矩阵，覆盖余额调整重放和跨用户资源查询
- [ ] 增加管理员查询与操作页面、原因输入、状态筛选和消费导出，原始凭据不出现在列表或导出中
- [ ] 完成同源路由规则，明确 `/ui/`、`/v1`、客户 API 和前端静态路由优先级，检验 Cloudflare 来源 IP 信任与回调规则
- [ ] 为资金差异、长时间冻结和充值处理积压增加可查询状态与运营处理流程，配置实际数据库备份并完成独立库恢复演练
- [ ] 在 staging 跑完整流程与多 worker 并发故障集，记录浏览器截图、请求、余额与流水证据
- [ ] 生成固定摘要镜像，备份线上数据库和不可轮换的加密盐，先发布默认关闭注册充值的版本，确认原有后台正常
- [ ] 完成 SMTP、上游模型、网关和经营参数配置后，按内测账号、兑换码、USDT、公开注册的顺序启用，核对账本后提交发布记录

## 完成标准与自检

客户能够在浏览器完成注册验证、登录、兑换或充值、创建 Key、真实调用、扣费和查询流水。余额不足不会调用上游，同码并发和重复支付只记一笔入账，同一请求只结算一次

两个 worker 与重启恢复测试通过，所有允许的付费协议都有终止与异常结算证据，未支持的付费协议均有明确拒绝证据。已通过独立数据库恢复演练，保留版本、配置、来源提交、测试结果和回滚限制

实施前逐条读取产品规格的注册、金额、权限、兑换、支付、终止路径和发布限制。每项测试必须能被对应错误行为触发失败，不以页面存在、mock 回显或表结构存在代替业务验收
