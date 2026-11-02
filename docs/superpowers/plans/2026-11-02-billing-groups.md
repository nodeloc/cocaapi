# 用户组与模型组倍率 Implementation Plan

> **For agentic workers:** Execute the steps in this session and verify each task before release

**Goal:** 管理员配置用户组、模型组、组间倍率及禁用规则，注册用户默认普通组，保留原有账户和 Key 权限

**Architecture:** 参考本地 new-api `setting/ratio_setting/group_ratio.go` 与 `relay/helper/price.go` 的用户组特殊倍率及计费快照思想，独立实现。配置采用带版本的不可变 JSON 历史；用户归组独立存储。倍率在钱包事务中读取并随预扣保存，最终费用按同一快照计算。倍率按请求的公开模型名称所属组锁定，上游回退和重试继续使用该倍率，基础费用的最坏报价及部署追加预扣保留

**Tech Stack:** FastAPI、PostgreSQL、Pydantic frozen models、整数纳美元、原生 React 管理组件、OpenAPI 生成类型

**Spec:** 当前用户请求与已确认的选择：保留现有账户和 Key 权限，分组控制倍率及禁用

## Constraints

普通用户组和普通模型组为保留默认项，未分组模型归普通模型组，未配置的组合为允许、1 倍。倍率接受 0 到 1000 的十进制字符串，最多六位小数，使用百万分整数和向上取整计算。倍率 0 不取消原有账户、余额及限额检查。默认配置不改变现有收费。修改配置和归组均带版本检查与审计；历史及正在进行的请求使用原快照。分组禁用必须在 API 服务端执行，不能只隐藏菜单。数据库迁移只增加配置、归组及快照字段，不重写历史资金

## Task 1: Policy and durable configuration

**Files:** 新增 `litellm/models/commerce_billing_groups.py`、`litellm/repositories/commerce_billing_group_repository.py`；两份 Prisma schema、新迁移；`tests/unit/models/test_commerce_billing_groups.py`、`tests/integration/commerce/test_billing_groups.py`

**Interfaces:** `BillingGroups` contains user_groups/model_groups/rules；`PricingSnapshot` contains revision, membership_version, group ids/names, multiplier_millionths and requested model；`scaled_units(base_units, multiplier_millionths)` returns bounded integer units or AuthError

- [x] 先写默认 1 倍、0.8 倍、免费、上浮、非法小数及溢出测试，确认旧版本失败
- [x] 实现有界不可变配置、默认组校验、每模型唯一归组、每组组合唯一规则，以及十进制到整数的无损转换
- [x] 增加带版本配置历史表，客户 default 归组与归组版本，调用快照及基础费用列；默认配置 revision=1
- [x] 配置写入使用事务 advisory lock 与期望 revision，不能删除已被客户使用的组；归组同时检查期望版本和目标组
- [x] 真实 Postgres 验证新注册默认组、配置并发冲突、归组审计及删除保护

## Task 2: Billing, permissions and customer receipts

**Files:** `commerce_wallet_repository.py`、`commerce_wallet.py`、`billing_hook.py`、`gateway_service.py`、`commerce_gateway_repository.py`

**Interfaces:** `reserve_call` 的输入仍为基础报价，在客户行锁内读取策略并预扣倍率后金额；`authorize_deployment` 和 `settle_call` 从已保存快照计算，后者接收基础实际费用，保存基础及最终费用

- [x] 先验证 0.5 倍预扣、2 倍余额不足、禁用拒绝、修改倍率及用户组不影响已预扣请求、重复结算幂等
- [x] 客户访问列表按分组禁用规则进一步过滤；原有账户及 Key 仍是权限上限
- [x] 将可信调用标识写入现有 spend_logs_metadata，以用户、Key 和调用标识关联钱包实际金额，用户用量与日志显示实际费用
- [x] 钱包账单显示用户组、模型组、倍率和基础费用；旧记录使用原金额且不伪造历史分组
- [x] 真实 HTTP 验证流式、非流式、余额不足、重试、回退追加预扣及禁用对已有 Key 立即生效

## Task 3: Native administration UI

**Files:** 新增 `admin_billing_group_routes.py`、`BillingGroupsAdmin.tsx`、`billingGroupsApi.ts`、`/commerce/groups/page.tsx`，扩展现有 CommercePage 导航和用户余额操作入口

**Endpoints:** GET/PUT `/commerce/admin/v1/billing-groups`；GET `/billing-groups/catalog`；GET `/billing-groups/members`；POST `/billing-groups/members/{user_id}`，仅完整代理管理员使用

- [x] 在账号管理加入“分组与倍率”，复用 Page、Card、DataTable、Input、Select、Checkbox 和现有提示组件
- [x] 可创建、命名和移除未使用用户组，配置模型组的公开模型成员，编辑用户组与模型组组合的倍率及是否允许调用
- [x] 用户查询、选择目标组并填写原因后保存，冲突时提示重新加载；默认普通组不可删除
- [x] 先写网络边界集成测试，验证倍率、禁用和用户归组请求及错误提示
- [x] 运行 `npm run gen:api`、定向 Vitest、类型检查、生产构建和显式 postbuild

## Task 4: Review and release

- [x] 独立代码审查并处理发现的问题，检查规则绕过、快照幂等、并发修改、历史费用及最低余额
- [x] 备份数据库和环境，构建基于当前运行镜像的增量版本，迁移先在隔离库验证
- [x] 临时账号真实模型验证普通组、折扣、上浮、禁用和流式结算，使用管理员浏览器验收桌面及移动端
- [x] 切换主实例，核对未改动核心、配置及账本，撤销临时 Key、会话和测试额度，保留审计记录
- [x] 更新部署文档和版本，提交并推送源码
