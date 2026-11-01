# 用户中心与 USDT 充值接入设计

本文记录 fork 的范围、源码接入点和实施约束，当前尚未实现用户中心、钱包或支付接口

后续完整产品规格见 `docs/superpowers/specs/2026-11-01-cocaapi-user-billing-design.md`，分阶段实施计划见 `docs/superpowers/plans/2026-11-01-cocaapi-user-billing.md`。两份文件覆盖本文尚未定下的账号方案、金额单位和实施顺序，支付服务商仍为未选定状态

用户随后确认参考 New API，并将 GitHub、Google、NodeLoc 的 OAuth 注册登录列入首批范围，见 `docs/design/2026-11-01-new-api-reference-and-oauth.md`

## 已确认范围

以 LiteLLM 开源网关为基础，自建用户与支付能力。充值使用第三方 USDT 支付网关，覆盖 TRON、Ethereum 和 BNB Smart Chain。具体支付服务商尚未选定，实际可用网络由商户账户配置和支付网关返回的能力共同决定

暂按独立用户中心设计，支持邮箱密码登录注册、账户余额、充值订单、个人 API Key 和消费明细。用户尚未确认账号界面方案，实施账号改动前需确定采用独立界面、复用原有界面还是对接已有账号系统

## 源码接入点

`schema.prisma` 的 `LiteLLM_UserTable`、`LiteLLM_VerificationToken` 和 `LiteLLM_SpendLogs` 分别存储用户、虚拟 Key 与请求费用。现有 `spend` 和 `max_budget` 使用 Float，新增钱包应采用独立的整数账本，不把预算字段解释成支付余额

`litellm/proxy/management_endpoints/internal_user_endpoints.py` 已有用户创建、查询、更新和权限检查。`password_endpoints.py` 已有密码修改入口。新的注册入口必须强制设置普通用户角色，不允许请求体设置管理员权限、余额、团队权限或模型授权

`litellm/proxy/management_endpoints/key_management_endpoints.py` 负责虚拟 Key 管理。用户中心只操作当前登录用户拥有的 Key，不把 master key 发给浏览器，也不允许用户借创建 Key 获得更高权限

`litellm/proxy/hooks/proxy_track_cost_callback.py` 负责费用记录。`litellm/proxy/spend_tracking/cost_finalization.py` 和 `budget_reservation.py` 涉及费用确定和预算预留。钱包扣费必须覆盖非流式、流式、失败重试、取消和后台完成路径，不能只处理成功的 Chat Completions

新数据库访问遵循 `.agents/skills/database-access/SKILL.md`，放入 `litellm/repositories`，由现有连接生命周期管理。费用数据流遵循 `docs/adrs/adr_001_provider_usage_fields_ride_as_usage_extras.md`

## 钱包与订单

内部余额使用整数最小单位，单位与舍入规则在实施规格中统一定义。USDT 原始金额、网络、代币标识、报价币种、汇率和兑换后的内部额度分别保存，不能将不同网络的原始金额直接混算

钱包记录可用余额、冻结额度与版本号。流水记录用户、变更类型、金额、业务唯一标识、订单或请求标识及时间。充值订单由服务端生成并绑定用户，保存支付服务商、网络、网关支付标识、报价、状态和有效期

支付通知与钱包入账在同一数据库事务中去重并提交。网关支付标识与充值入账业务标识分别有唯一约束，重复、并发和乱序通知都不能造成重复加款。已入账订单不被迟到的等待状态覆盖

支付成功页仅展示服务器读取的订单状态，不触发入账。回调通过服务商签名校验后，还要核对本地订单、网关支付标识、金额、币种、网络及最终到账状态，必要时通过网关查询接口复核。少付、超付、超时后到账和退款采用显式状态与处理规则

用户查询钱包、流水、充值订单或 Key 时，以登录身份确定所有者。客户端传入的 user_id 不能决定资源归属

## API 消费扣款

接入钱包前，先验证 LiteLLM 现有预留与结算路径的实际执行顺序和持久化语义。仅在后台费用回调中扣余额会留下并发透支窗口，因此请求放行之前需要原子预留可计算的消费上限

完成时按服务端确定的费用结算并释放剩余预留，失败和取消时根据实际已计费部分结算。重试的上游成本与向用户收取的价格分别记录，按稳定请求标识保证重放不会重复收费

资金流水是余额变更的依据。LiteLLM 用量统计用于模型成本、调用明细和对账，不能同时作为另一套可独立修改的余额。数据库异常时，新请求应停止进入付费上游，已有请求的结算进入可恢复流程

## 支付服务商候选

NOWPayments 可以作为首个候选，官方提供支付 API、订单查询、IPN 签名说明和沙箱，并列出 Tron、Ethereum、BSC 等网络的 USDT 支持。这里只记录技术适配候选，不代表已选定服务商、已开通账户或已测试真实到账

官方 API 入口 https://nowpayments.io/api

官方 API 文档 https://documenter.getpostman.com/view/7907941/S1a32n38

官方回调说明 https://nowpayments.zendesk.com/hc/en-us/articles/21395546303389-IPN-and-how-to-setup

官方币种说明 https://nowpayments.io/

服务商接入层负责创建支付、查询支付、验证通知和获取可用网络，钱包业务不依赖某个服务商的字段或状态名称。未配置商户账户时，支付入口明确显示未启用，不能生成看似可付款的假订单

## 实施顺序与验证

先确定账号方案、内部余额单位、模型售价、USDT 兑换规则及支付服务商，再编写分阶段实施计划。第一阶段交付注册登录和个人 Key 管理，第二阶段交付持久化钱包、订单和网关沙箱接入，第三阶段交付 API 消费预留与结算及对账

账号验证包含重复注册、密码校验、越权查询、角色提升和会话退出。支付验证包含伪造通知、金额币种网络不匹配、重复通知、乱序通知、数据库失败、订单重查以及相同支付重复绑定

消费验证包含多个 Key 共享余额、并发请求、流式中断、失败重试、进程重启和重复费用事件。资金一致性测试需要实际 PostgreSQL，不能只用内存存储来证明事务与唯一约束正确

上线前验证完整流程，注册、充值、确认到账、生成 Key、调用模型、消费扣款和查看流水。当前文档没有证明这些功能已经实现，也没有进行真实付款、自动创建商户账户或部署公开服务
