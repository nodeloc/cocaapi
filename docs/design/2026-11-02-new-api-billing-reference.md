# New API 计费源码对照

日期：2026-11-02。本轮完成源码对照及实施范围整理，没有变更线上费率、余额、权限或结算行为

## 对照版本与范围

参考 fork 为 `https://github.com/kissopen/new-api`，本地目录为 `E:\cocaapi-references\new-api`，工作树仍停留在 `d0abbf6e0d33552a41c402d9b1fadbaff27cf40d`。本轮 fetch 上游 main，核对版本为 `70e6af6429824f99de98e96e65254c8c2ef7ee0b`，下表列出的核心计费文件在两个版本之间没有差异；表达式执行器的变更另外通过 git show 阅读

CocaAPI 对照基线为 `bb98c5f8a9fb0aee3fc72e020b0ee637b6fa5326`。本轮为静态代码阅读，没有运行 New API，也没有新增生产调用或支付验收。上一轮 193 项测试属于当时的钱包扣费版本，不能视作下述待开发功能的测试结果

## 已确认的参考点

| New API 源码 | 已读行为 | CocaAPI 现状及采用方向 |
| --- | --- | --- |
| [service/billing_session.go](https://github.com/QuantumNous/new-api/blob/70e6af6429824f99de98e96e65254c8c2ef7ee0b/service/billing_session.go) | 单请求会话管理预扣、发送前追加、结算及退款，防止结算后再次退款 | 已有数据库持久预扣、追加冻结和唯一结算流水；继续统一生命周期，不新增第二套扣钱包的链路 |
| [relay/request_billing.go](https://github.com/QuantumNous/new-api/blob/70e6af6429824f99de98e96e65254c8c2ef7ee0b/relay/request_billing.go) | 请求准备阶段估价，最终失败统一处理退款 | 已在原生鉴权后及发送前检查；费用不明的断连仍保留冻结待核对 |
| [relay/helper/price.go](https://github.com/QuantumNous/new-api/blob/70e6af6429824f99de98e96e65254c8c2ef7ee0b/relay/helper/price.go) | 区分模型倍率、输出倍率、缓存读写及按次价格，并形成 PriceData | 当前使用 LiteLLM 配置价格及原生费用结果；需要增加面向运营的售价规则和可解释明细 |
| [pkg/billingexpr/types.go](https://github.com/QuantumNous/new-api/blob/70e6af6429824f99de98e96e65254c8c2ef7ee0b/pkg/billingexpr/types.go) | 阶梯表达式计费保存表达式与请求快照，分组相关字段会在自动分组重试及结算前刷新 | 当前预扣记录只有模型及总额等字段，缺少可重放的价格与用量快照；增加独立价格版本并记录最终适用的分组 |
| [relaykit/dto/billing_usage.go](https://github.com/QuantumNous/new-api/blob/70e6af6429824f99de98e96e65254c8c2ef7ee0b/relaykit/dto/billing_usage.go) 与 [service/billing_usage.go](https://github.com/QuantumNous/new-api/blob/70e6af6429824f99de98e96e65254c8c2ef7ee0b/service/billing_usage.go) | 保存 OpenAI、Anthropic、Gemini 用量语义及 estimated 标识，再转换成计费口径 | 当前费用计算委托 LiteLLM；补充持久用量来源、缓存拆项及估算标识，避免把协议转换后的展示用量当作另一份可扣费量 |
| [setting/ratio_setting/group_ratio.go](https://github.com/QuantumNous/new-api/blob/70e6af6429824f99de98e96e65254c8c2ef7ee0b/setting/ratio_setting/group_ratio.go) | 普通分组倍率和用户分组对使用分组的特殊倍率 | 尚无独立商业分组售价；第一版采用服务端确定的单一分组倍率，默认 1，暂不引入多重叠加折扣 |
| [model/quota_reserve.go](https://github.com/QuantumNous/new-api/blob/70e6af6429824f99de98e96e65254c8c2ef7ee0b/model/quota_reserve.go) | Redis 原子预扣、数据库条件更新及失败补偿 | 当前 PostgreSQL 锁与同事务账本已覆盖并发保护；继续以数据库作为钱包资金的权威来源 |
| [model/pricing.go](https://github.com/QuantumNous/new-api/blob/70e6af6429824f99de98e96e65254c8c2ef7ee0b/model/pricing.go) 与 [controller/pricing.go](https://github.com/QuantumNous/new-api/blob/70e6af6429824f99de98e96e65254c8c2ef7ee0b/controller/pricing.go) | 模型价格、分组可见范围和价格版本用于前端价格展示 | 客户模型目录尚缺完整售价说明；增加仅含获准模型和实际用户售价的展示，供应商成本及凭据继续留在管理侧 |

## 优先补齐的功能

第一步是价格版本和账单明细。将模型别名、最终部署标识、计费模式、规则版本、用户价格分组、适用单价和倍率与请求关联保存。记录输入、输出、缓存读取及缓存写入数量、用量来源、是否估算、预扣、最终扣款和释放额度。定价变更只影响新规则版本下的请求，旧请求可依据已记录的版本复核；发生 fallback 或服务端改写时，发送前重新确定有效规则并在事务内补足冻结

第二步是后台价格配置和用户分组。管理员配置输入、输出、缓存读写的销售单价及分组倍率，界面以 USD / 百万 Token 展示，计算使用精确十进制，最终金额统一转换成既有整数 units。成本与售价字段分开，已有原生价格继续作为兼容模式，新规则显式启用后生效，默认倍率为 1。配置必须校验模型范围、非负有限数值及明确的零价格，不能把缺少价格当成免费

第三步是账单与异常复核页面。用户能从一笔 API 扣费看到请求、模型、Token 拆项、适用价格及计算结果。管理员复用原有表格、筛选、详情抽屉和确认弹窗处理费用不明的冻结，操作保留原因和审计。已结算金额需要调整时生成关联原流水的补偿记录，不改写原流水

随后补充低余额提醒、账本核对和运营默认分组。钱包核对检查可用、冻结、欠费、入账及扣减与账本是否一致，发现异常提示管理员，不自动覆盖余额。新用户的默认模型范围和调用限额由管理员分组策略决定；充值与授权的产品流程需明确，不能简单删除当前原生权限和预算检查

## 实施边界

输入缓存需要区别两类行为：代理完整响应缓存命中可以没有新的模型调用费用；供应商 prompt cache 读取及写入仍按对应价格收费。不同协议的输入总量是否已经包含缓存 Token 必须先规范化，同一缓存 Token 不得既按普通输入收费又重复按缓存读取收费。第一版先支持当前已开放的文本与 Embeddings，图像、音频、异步任务和按次定价在对应协议及结算证据齐备后再开放

请求生命周期沿用当前数据库持久记录、发送前原子授权、重复回调幂等和冻结复核。New API 的信任额度旁路、免费模型免预扣、订阅优先扣款、违规费用和通用表达式定价均不列入这次首批适配。客户无可用余额或有欠费时继续禁止调用，Key 预算继续由原生机制执行，不能把用户余额复制成每一把 Key 的可花金额

保留现有 `1 USD = 1000000000 units`、BigInt 字符串接口及数据库约束，不迁移为 New API 的 quota 单位。缺少最终用量或费用证据时标记估算或待核对，不能仅因返回了 HTTP 200、SSE 部分内容或进程重启就确定实际扣费或退款

现有历史请求保留原计费语义。新功能需要兼容没有价格快照的旧预扣记录，并明确区分旧原生费用结算与新售价版本结算，同一请求只走一种路径，避免把已包含销售价格的 native response_cost 再乘一次销售倍率

本轮参考行为、边界及数据结构，没有移植 New API 的业务源码、组件或资源

## 开发验收

定价回归必须覆盖请求进行中改价、模型别名和 fallback 切换、分组变更、缓存读写的协议口径差异、明确免费价格与价格缺失、非法浮点与整数上限、亚分金额精度、用量缺失与断连、重复结算和历史预扣兼容

账单回归需要证明预扣估算与最终销售规则一致，账单各分项能重算出实际扣款，供应商成本与用户售价不会混用，多 Key 共享同一钱包，流水与余额同事务更新，管理员补偿不重复执行，客户只能读取本人明细和获准模型的价格

发布继续使用隔离数据库、双 worker 和脚本化上游验证，通过后再做备份、迁移、预发布与生产切换。真实供应商缓存、真实第三方支付和真实邮件分别验收，不用模拟结果代替
