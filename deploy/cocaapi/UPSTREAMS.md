# CocaAPI 上游接入

## GPT-6 Luna Decisions，2026-11-02

已修正现有 `gpt-6-luna-decisions` 部署。此前 `/v1/decisions` 返回 HTTP 400，错误为 `Unknown Decisions provider 'custom_openai'`，配置同时将完整接口路径填进了 API Base。现使用提供商 `openai`、上游模型 `openai/gpt-6-luna-decisions`、API Base `https://api.experientiallabs.ai/v1`、模式 `decisions`，支持端点为 `/v1/decisions`

该模型使用 `input` 和 `questions`，不生成聊天回复，也不支持流式输出。按[上游模型页](https://platform.experientiallabs.ai/models/gpt-6-luna-decisions)当日标准价配置，输入和缓存读取均为每百万 Token $0.10，输出为 $0，不依赖 Free 促销标签。客户实际扣费继续应用其用户分组和模型分组倍率

客户钱包已支持 `/decisions` 和 `/v1/decisions` 的文本请求。调用前检查余额，问题描述、选项和评分等级参与预扣估算，最终部署发送前再次检查，成功后按真实用量结算并释放差额。零余额和预扣不足返回 402，明确的上游失败释放预扣。图像、音视频、流式请求及聊天输出上限暂不支持，客户端不能夹带 `messages` 或 `prompt` 绕过输入估算

模型已加入当时 180 个启用客户的模型范围，以及注册默认模型名单。原有预算、分组规则和 Key 的明确模型限制继续执行。旧 Key 未授权该模型时，在客户密钥页面新建并勾选 `gpt-6-luna-decisions`；普通聊天 Playground 不适用于这个模型

客户调用示例，密钥从本地环境读取

```sh
curl --fail-with-body --max-time 45 https://cocaapi.com/v1/decisions \
  -H "Authorization: Bearer $COCAAPI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-6-luna-decisions","input":"The sky is blue.","questions":[{"type":"predicate","name":"color","instructions":"Is a color mentioned?"}]}'
```

正式 HTTPS 实测返回 HTTP 200，响应如下；三种题型的另一笔真实请求也返回了判断、选择和评分结果

```json
{"model":"gpt-6-luna-decisions","answers":[{"type":"predicate","name":"color","probability":1.0}],"usage":{"input_tokens":158,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0},"output_tokens":0,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":158}}
```

验证仅使用临时验收账户。候选与两版正式实例的四次真实调用共 842 个输入 Token，账本合计扣除 84200 纳美元，成功调用日志与账本一致，没有剩余预扣。余额为零的请求返回 402。验收后通过带审计的余额调整收回 9915800 纳美元未用额度，停用测试账户、删除会话并撤销密钥，撤销后四个新 HTTPS 连接均返回 401

自动化覆盖位于原有 `test_billing_pricing.py`、`test_api_billing.py` 和 `test_group_api_billing.py`。隔离测试代理需在原计费测试配置中增加以下模型，脚本上游使用 `tests/integration/commerce/billing_upstream.py`，数据库必须是独立的 `cocaapi_wallet_test`

```yaml
- model_name: wallet-decision-model
  litellm_params:
    model: openai/test-decision-model
    api_base: http://cocaapi-billing-test-upstream:9000/v1
    api_key: billing-test-only
  model_info:
    mode: decisions
    input_cost_per_token: 0.001
    output_cost_per_token: 0
    max_input_tokens: 8192
```

增量构建使用 `Dockerfile.decisions`，仅替换现有钱包的两个 Python 模块，不修改前端或数据库结构。备份目录为 `/opt/cocaapi/backups/decisions-20261102T134001Z/`，包含配置、此前镜像、模型与授权快照和通过目录检查的数据库归档，未做完整恢复演练。回退代码时需同时暂停该决策模型的客户访问，避免旧钱包拒绝路由；不能恢复整个数据库覆盖新账本

最终 37 项定价测试、61 项钱包及 HTTP 集成测试通过，类型检查、类型纪律和测试质量检查通过，两个运行模块的严格 Ruff 规则计数与修改前一致。复查发现的聊天字段遮蔽输入问题已通过先失败后通过的单元和 HTTP 回归验证，修复后独立复查无其他待修问题。托管 CI、覆盖率和外部评审机器人未运行，不计为通过

正式镜像为 `cocaapi-decisions:20261102-final`，ID 为 `sha256:3feb43d679c65846b052382fb592a55437cfb5d3f5fcf671a51da64976601eb1`。主实例双 worker 健康，Caddy 恢复指向 4000，公网真实请求返回 200，带聊天字段的决策请求返回 400

## Experiential Labs，2026-11-02

通过原生 `/model/new` 接入 `https://api.experientiallabs.ai/v1`，使用 OpenAI 兼容协议。只登记用户截图指定的四个模型，没有导入上游模型列表中的其他模型，也没有改动既有用户、钱包、Key、预算或授权

| 截图名称 | CocaAPI 与上游模型 ID | 服务器直连实测 | 当前状态 |
| --- | --- | --- | --- |
| DeepSeek V4.1 Flash | `deepseek-v4.1-flash` | 最新客户 Playground HTTP 200，返回 OK | 已配置原厂价，保留当前启用开关 |
| GPT-6 Luna | `gpt-6-luna` | 最新客户 Playground HTTP 200，返回 OK | 已配置原厂价，保留当前启用开关 |
| DeepSeek V4.1 Flash 1017 | `deepseek-v4.1-flash-1017` | 最新客户 Playground HTTP 200，返回 OK | 已配置原厂价，保留当前启用开关 |
| DeepSeek V4.1 Flash 1017 Uncensored | `deepseek-v4.1-flash-uncensored` | 普通与 SSE 请求 HTTP 200，均返回 OK | 已配置发布方标准价，保留当前启用开关 |

上游 `/v1/models` 鉴权成功，返回 314 个模型，四个 ID 均存在。Uncensored 的实际 ID 不带 `1017`。初次接入时前三个模型返回地区限制，最新 Playground 修复验收时四个模型均从同一服务器返回 HTTP 200 / OK，详见本文末尾故障记录。上游地区规则仍以其实际响应为准，参见 [官方错误说明](https://platform.experientiallabs.ai/docs/errors) 与 [模型地区规则](https://platform.experientiallabs.ai/docs/models)

截图中的 Free 标签不等同于 CocaAPI 售价。两次 Uncensored 短请求各报告 11 个输入 Token、2 个输出 Token、费用 0，其中流式请求正常返回结束帧及用量。该测试只说明这两次请求的结果，不构成其他模型、其他请求或后续促销期间的费用承诺

初次接入时四个部署均暂停。定价操作前检查发现后台已经取消四个部署的暂停，本次保持这些开关，不替用户恢复或取消暂停。用户已确认采用 DeepSeek / OpenAI 原厂价、Uncensored 发布方标准价；后续面向所有现有及新注册客户开放四个目标模型，保留余额检查与调用限额。其余三个模型仍需解决上游地区拒绝后重新验证，本次定价没有改动客户、新注册客户或现有 Key 的授权

### 客户模型权限修复，2026-11-02

注册默认模型通过 `auth.env` 的 `COCAAPI_DEFAULT_MODELS` 配置，值为逗号分隔的上表四个模型 ID。只允许明确的模型名，不允许 `all-proxy-models` 或通配符；未配置时仍默认禁止模型访问。邮箱及 OAuth 新建客户共用该配置，注册后仍须通过邮箱验证或提供已验证的 OAuth 身份

配置了默认模型的新账号不再写入原生 `max_budget=0`，而是使用 `NULL`，由钱包余额限制消费；这不会充值或授予信用额度。管理员之后单独配置的原生预算、Key 模型范围和限额继续执行，再次登录也不会覆盖这些配置。线上已有两个启用客户仍是注册初始的 `no-default-models`、预算 0、消费 0，使用原生 `/user/update` 将其模型范围设为四个目标模型，并解除初始零预算拦截。只修复确认处于初始状态的账号，不覆盖其他客户的独立设置

镜像增量构建使用 `Dockerfile.access`，基础镜像必须是已经包含钱包扣费、定价和品牌资源的 `cocaapi-official-pricing:20261102`。本次不修改模型启用开关，前三个模型的上游地区拒绝仍需另行处理

原生创建 Key 表单中的 `All Proxy Models` 在客户接口中只代表该客户当前获准的模型，会立即展开并保存明确名单。名单之外的模型和混合使用特殊值的请求继续拒绝，不随网关以后新增模型扩大权限

回归脚本 `python3 deploy/cocaapi/tests/customer-access.verify.py` 仅允许 `DATABASE_URL` 指向隔离的 `cocaapi_wallet_test` 数据库。先用同一数据库启动真实代理，监听 `localhost:4400`，设置 `COCAAPI_PUBLIC_URL=http://localhost:4400`、明确的 `COCAAPI_DEFAULT_MODELS`、测试专用 `COCAAPI_AUTH_SECRET` 和 `LITELLM_MASTER_KEY`，并配置测试 SMTP host/from。脚本通过测试发件箱完成验证，不发送邮件。测试代理需至少有两个允许模型及一个名单外模型，并有可估算的价格；使用不可达的脚本上游也可验收零余额拦截。测试库需应用原生及 Commerce 迁移；从生产只复制 schema 时也应同步 `_prisma_migrations`，不得将该脚本指向生产数据库

脚本先通过后台接口保存登录配置，再走实际 HTTP 注册、验证、登录、原生表单的全部模型选项、Key 模型名单、零余额 402 和管理接口 403。它会在隔离库保留测试账号和日志供排查，完成后可移除整个隔离测试库

本次验证为 86 项 Commerce 单元测试和 48 项账号、客户网关、后台登录设置集成测试通过。线上临时普通账号也验证了四项模型可见、Key 创建 201、零余额调用 402、管理接口 403，浏览器通过原生表单选择全部模型并创建 Key 成功；测试账号与 Key 已清理，没有充值或扣费。Ruff 严格规则在四个改动运行模块中没有新增违规，品牌资源和健康检查通过

当前镜像为 `cocaapi-customer-access:20261102`，镜像 ID `sha256:4c640e3a1163b9faf22516908e7ef5b29be9c85a6012d7ddc86cb4ed946eaa23`。变更前备份目录为 `/opt/cocaapi/backups/customer-access-20261102T060337Z/`，包含数据库、部署配置、旧镜像和两个客户的修改前后快照，数据库归档目录检查通过。需要回滚时可使用原定价镜像并保留当前数据库；如另行撤回授权，应对照客户快照逐人检查，不得将整库恢复覆盖上线后发生的钱包流水或管理员设置

### 原定开放规则与定价验收范围

发布授权仅限上表四个模型，客户与 Key 保存明确的模型名单，后续新增上游或其他模型不会随之自动开放。现有客户和新注册客户使用相同的公开模型范围，账号停用、邮箱验证、原有 Key 模型范围及调用限额继续执行。模型可见不代表上游地区限制已经解决，不能承诺前三个部署在当前出口可用

上线时需同步处理原注册流程的 `no-default-models` 和默认 API 预算为 0 的拦截，避免仅取消模型暂停却仍无法创建 Key。不得通过跳过钱包检查或清空原有客户预算来解除拦截；原生 API 预算与钱包余额仍为独立检查，已有客户 Key 的范围不自动扩大

收到本次开放策略后，在当前生产镜像的独立 Python 进程中通过 LiteLLM OpenAI 兼容适配器再次验证 Uncensored，普通和流式请求均返回 OK，各报告 13 个 Token。这属于适配器连接测试，没有借用客户会话、修改线上模型暂停状态或验收定价后的钱包结算链路

凭据使用原生模型 API 加密存入数据库，没有进入此文档、前端或 Git。受限服务端配置为 `/opt/cocaapi/experiential.env`，本地受限副本位于部署密钥目录；不要将这些文件加入镜像、构建归档或代码仓库

变更前数据库备份位于 `/opt/cocaapi/backups/experiential-20261102T040044Z/database.dump`，归档目录检查通过，没有执行完整恢复演练。登记过程不需要重启网关或修改数据库结构。管理后台读取确认四个模型均存在且暂停，上游直连测试没有借用客户 Key 或扣除客户余额

## 官方标准定价，2026-11-02

以下均为美元 / 百万 Token，不使用上游 Free 标签、套餐优惠或限时促销作为长期售价。可复核快照为 [pricing/experiential-20261102.json](pricing/experiential-20261102.json)

| 模型与时段 | 普通输入 | 缓存命中输入 | 输出 |
| --- | ---: | ---: | ---: |
| DeepSeek V4.1 Flash 与 1017，峰时 | 0.30 | 0.006 | 1.20 |
| DeepSeek V4.1 Flash 与 1017，谷时 | 0.15 | 0.003 | 0.60 |
| GPT-6 Luna，输入不超过 272000 Token | 0.10 | 0.010 | 0.50 |
| GPT-6 Luna，输入超过 272000 Token | 0.20 | 0.020 | 0.75 |
| DeepSeek 1017 Uncensored，发布方标准价 | 0.30 | 0.030 | 1.20 |

DeepSeek 按 [原厂定价页](https://api-docs.deepseek.com/quick_start/pricing/)：UTC 工作日 01:00–04:00、06:00–10:00 为峰时，其余时间、周末和中国公共假期为谷时。假期按 [国务院 2026 年安排](https://www.beijing.gov.cn/cs/gncs/zcwj/202603/t20260327_4568275.html)配置 33 个自然日，假期日期使用 Asia/Shanghai，周时段使用 UTC。已覆盖日历截至 2026-12-31，跨入未知年度后客户调用在预扣前拒绝，不能静默按峰价扣费；需在下一年度启用前补齐官方日历

GPT-6 Luna 按 [OpenAI 模型说明](https://developers.openai.com/api/docs/models/gpt-6-luna)：超过 272000 输入 Token 时，整个请求按输入及缓存 2 倍、输出 1.5 倍计价。默认短缓存写入为 0.125，长上下文为 0.25。12 小时缓存、Fast、Flex 和 Batch 不在当前客户计费范围，显式缓存选项与嵌套 breakpoint 均拒绝，避免使用未实现的计价档位

Uncensored 按 [发布方页面](https://platform.experientiallabs.ai/models/deepseek-v4.1-flash-uncensored)的标准牌价，缓存写入按普通输入单价，不固化当前促销价。DeepSeek 缓存未命中或写入按普通输入计价，命中部分使用缓存命中价

价格覆盖通过原生模型更新接口写入 `litellm_params`，因为只写 `model_info` 的价格会被原生服务当作展示字段剔除。峰谷和节假日日历保存在 `model_info.off_peak_pricing`，GPT 长上下文使用原生 `tiered_pricing`，使预扣和最终计价选择相同档位。未知缓存命中情况时，预扣按输入、缓存读、缓存写的最高单价保守估算，实际费用按返回用量结算并释放差额

### 本次验证与发布

365 项定向测试通过，包括原生计价、预算预扣及账号服务；新增用例先在旧代码上复现节假日例外和缓存写入预扣问题，再验证修复。最终镜像脱网验证峰谷边界、周末、节假日、缓存读写、272000 / 272001 边界，以及日历过期在发送前拒绝。严格 Ruff 在四个修改模块上的规则计数与修改前一致，没有增加屏蔽规则

真实 Uncensored 测试通过 LiteLLM Router 返回 OK，上游费用字段为 0，原生计价回调使用配置的零售价，11 个输入、2 个输出 Token 计算为 0.0000057 美元。该请求没有借用客户会话或扣除客户余额，没有执行真实长上下文高额请求

当前镜像为 `cocaapi-official-pricing:20261102`，ID 为 `sha256:5331f6b0f5dff8d9dc4803230512af190fb2d04dd8b524abac99deb153c025cb`。回退基础为兼容钱包计费及品牌的 `cocaapi-dashboard-brand:20261102`，ID 为 `sha256:469c6b6c42f163bb0292893ed0ab10a33cbbe3affa8d21c2715f29cff04fee22`。回退前必须暂停使用新日历及缓存计价的部署，保留当前数据库与 `auth.env`，不能恢复整个数据库覆盖运行期间的账本

发布前备份为 `/opt/cocaapi/backups/official-pricing-20261102T051155Z/`，包含数据库归档、环境、Compose 和 Caddy；归档目录检查通过，没有做完整恢复演练。先通过 4001 预发布验证，再切回 4000 主实例。未变更的认证与计费核心文件摘要和加密 OAuth 配置保持一致，没有新增迁移或改动账户余额、用户预算与授权。托管 CI 未运行

## Playground 502 与扣费修复，2026-11-02

上游成功返回的 `usage` 包含缓存明细、`cost` 和 `is_byok`，客户 Playground 错把它当作禁止额外字段的内部数据校验，导致钱包已经结算而页面最终返回 502。现将外部用量字段兼容解析，再投影为公开的三个 Token 统计字段。仅服务器内部 Playground 请求设置上下文标记，在结算前校验同一份响应投影；确定无法转换时释放全部预扣并返回失败。标记不会从客户端读取，完成及异常后都会恢复，普通 API 和并发请求不受这个校验影响

本地 `UnsupportedParamsError` 在没有输出时释放预扣，包括流式请求。客户端中断、部分流式输出和其他不确定的上游结果仍保留原有复核策略，本次不承诺任意最终 HTTP 失败都自动免费

同时修复上游零成本覆盖平台自定义售价的分支：日志中暂存的零费用需要按明确部署价重新计算；费用计算器在自定义价格场景忽略上游成本 header，包括正数 header。真实缓存命中仍为零，明确免费或 PTU 零价仍按零价计算，已计算的正数内部费用保留。OpenAI Chat 与 text-completion-openai 的报价元数据只在这两个协议标识之间互认，避免依次使用文本补全、Messages 等入口后同一部署报价查找失效；其他提供商的匹配规则未放宽

核对并逐笔退回 12 笔 Playground 转换失败扣费，合计 5202601 纳美元，即 0.005202601 美元。补偿使用 `playground-502-refund:<request_id>` 唯一业务键，保留原扣费流水并新增调整及审计记录；另释放本地参数错误滞留的 6900 纳美元冻结。收据和操作前快照保存在 `/opt/cocaapi/backups/playground-502-20261102T063122Z/`。不得删除原流水或通过整库恢复撤销退款

四个已接入模型通过真实客户 Playground 均返回 HTTP 200 / OK，验收账户按配置价产生正数扣费且没有冻结余额；浏览器原生 Playground 也通过同一链路收到 OK。临时验收 Key 已撤销、会话已清理、账号已停用，未用测试额度已回收，验收账务记录保留。213 项定向测试通过，包括 88 项 Commerce 单元、29 项日志报价、4 项模型报价协议匹配、92 项 API、钱包及账号集成测试。新增用例均先复现对应失败，再验证修复；五个运行模块的严格 Ruff 规则计数没有增加

最终镜像为 `cocaapi-playground-billing:20261102`，ID `sha256:4a783f0131ec2f4613e7b59812987c0ddbe74fbd29a501d6836a65181c3313df`，基于此前客户授权镜像增量覆盖五个模块，界面资源和模型定价配置保留。没有数据库结构迁移。需要回滚时保留当前账本、退款和认证配置，并先开启计费维护，避免恢复原转换失败路径后继续扣费

切换过程中 Caddy 在 reload 后因 `context: internal error: missing cancel error` panic 退出，出现短暂 521，已重新启动并恢复入口。原服务没有自动重启策略，现使用 `caddy-restart.conf` 对应的 `/etc/systemd/system/caddy.service.d/cocaapi-restart.conf` 设置失败后自动重启。当前主网关继续使用 4000，计费维护已关闭

## 兑换码每人次数限制，2026-11-02

创建兑换码批次新增“允许同一用户多次兑换”，默认关闭。同一批次每位用户只能兑换一个码；开启后可兑换多个不同码。每个码始终只入账一次，同一用户重试已兑换的码返回原收据。限制在数据库事务持有批次行锁时检查，并发兑换不同码不能绕过限制；被拒绝的未使用码仍可供其他用户兑换

两份 Prisma schema 与迁移 `20261102160000_commerce_redemption_policy` 增加默认 false 的 `allow_repeat_redemption` 和批次、兑换用户联合索引。已有批次后续兑换也执行每人一次，保留原兑换历史与账本。后台列表显示每批次策略，用户超限收到明确中文提示。界面复用原生组件，保持现有样式

22 项钱包、权限及兑换码集成测试与 8 项界面测试通过，TypeScript 检查和生产构建通过。线上使用独立验收账号验证默认限制、同码重试、其他用户继续使用被拒绝的码以及允许多次的批次，余额核对一致。验收批次和账号已停用，测试额度通过审计调整回收，没有删除账本。桌面和 375 像素深色界面验证通过，默认选项关闭，页面没有横向溢出

生产构建补充 `postbuild` 静态导出兼容处理，为 Next 嵌套的 `__next.*` 分段文件生成相同内容的点分路径别名，保留原文件。线上预取路径返回 200，刷新后台无接口失败或脚本错误

最终镜像 `cocaapi-redemption-policy:20261102`，ID 为 `sha256:7dd0f7fa79a66d07de094a2d2d98ccc4b7a3eec17624d7732ced8b51d206c1a3`，基于上一节的钱包扣费修复镜像。备份位于 `/opt/cocaapi/backups/redemption-policy-20261102T071822Z/`，数据库归档目录检查通过，未进行完整恢复演练。回滚时需要保留新增兑换限制代码和列，或暂停兑换入口，旧镜像不会执行每人次数限制；不要恢复整个数据库覆盖账本

## Playground 输出截断修复，2026-11-02

用户 Playground 的适配层此前写死 `max_tokens=512`，同时把响应结束原因替换为 `stop`。真实上游对同一篇中文科普提示，在 512 上限时返回 `length`，在 4096 时返回 `stop` 并使用 717 个输出 Token，其中含 347 个推理 Token。截断来自生成上限，页面并没有收到完整回答

现在默认输出上限为 4096，用户可以通过原生 Model Settings 开启高级参数，将 Max Tokens 调整为 1 到 32768。参数经过前后端严格校验后送入原有余额预扣链路，余额需要覆盖本次最大费用，最终仍按实际用量结算并释放差额。客户设置只展示输出上限，保留原有界面风格

保留真实 `finish_reason`，达到上限时在回答下方显示中文提示，并允许推理耗尽上限时没有正文的响应。结束状态独立于模型文本保存，续问不会将提示或空 assistant 写进 API 历史。assistant 历史单条最多 131072 字符，用户和系统消息仍最多 8000 字符，会话总量最多 262144 字符，支持长回答后继续提问

15 项网关单元、19 项网关及权限集成、2 项真实 HTTP 钱包 Playground 测试通过，128 项相关前端测试通过。新增回归先复现失败再验证修复，TypeScript 检查、生产构建和静态导出处理通过。修改的两个 Python 运行模块严格 Ruff 规则计数没有增长，前端 ESLint 无错误，保留既有文件的警告。独立代码复查通过

预发布使用独立客户测试真实上游，默认请求输出 649 Token 并正常结束，显式 1 Token 返回 `length` 和空正文，显式 8192 和 GPT-6 Luna 兼容请求正常结束。均按实际用量结算，没有遗留冻结余额。浏览器验证客户设置入口、截断提示及提高上限后的续问，不借用客户账号或密钥

浏览器将上限从 1 调整到 8192 后发送“继续”，返回 603 字符正文、631 个输出 Token，结束原因为 `stop`，历史中没有空 assistant。375 像素视口的页面宽度仍为 375。临时验收 Key 已撤销、会话已清理、账号已停用，剩余测试额度通过审计调整回收，真实测试消耗共 2337700 纳美元

最终镜像 `cocaapi-playground-output:20261102`，ID 为 `sha256:0945a93063159cdf5c826ed683b211c2bf21c622f4d25047fdcd8d46078dcad2`，基于上一节兑换码限制镜像，只覆盖两个 Python 模块和前端静态资源。备份位于 `/opt/cocaapi/backups/playground-output-20261102T074253Z/`，数据库归档目录检查通过，未进行完整恢复演练。本次没有数据库迁移或定价变更，回滚可以使用上一节镜像并保留当前数据库和认证配置，不能整库恢复覆盖账本

本机构建环境设置了 npm `ignore-scripts=true`，生产构建后需显式运行 `npm run postbuild`，确保静态分段文件别名已经生成

## 用户 Playground 流式输出，2026-11-02

用户 Playground 默认开启 Stream responses，沿用原生消息、指标、停止按钮和 Model Settings，也可以关闭开关继续使用非流式方式。流式请求先经 `/account/api/v1/gateway/playground/authorize` 校验登录会话、CSRF、个人 Key 归属、邮箱和模型授权，并使用与原入口相同的限流桶。该步骤不调用模型或扣费；随后用个人 Key 请求固定同源的 `/v1/chat/completions`，实际余额检查、最大费用预扣、模型权限及速率限制仍在原生后端执行

页面只转发允许的模型、历史、输出上限和流式参数，强制请求末尾用量，保留取消信号，原生请求不携带账号 Cookie。SSE 按完整事件增量解析，支持跨包 UTF-8 与 CRLF，只保留公开内容、结束原因和三项 Token 统计。上游费用及私有字段不会作为平台售价展示；缺少结束标记或流内异常会明确失败。客户 SDK 自动重试已关闭，避免一次操作因响应格式异常重复发起收费请求，管理员 SDK 选项保持原行为

验收发现正数上游费用也可能覆盖配置价：此前仅对上游零价绕过费用捷径。现在有自定义价格时，日志的 hidden cost、已有 cost 和钱包非流式成功回调均重新使用平台定价计算；底层已有的上游费用过滤继续生效。缓存命中免费、显式免费、自定义价格以外的预计算费用及未知费用 None 都保留各自语义。没有修改模型配置、标价或历史用户账本

Caddy 对两个原生 chat 路径关闭响应压缩并设置 `Cache-Control: no-cache, no-transform` 与 `X-Accel-Buffering: no`，保留 `flush_interval -1`，减少代理将多段内容压成一批后才显示的延迟。官网和静态资源继续使用压缩

75 项费用计算与预计算费用回归、63 项真实 HTTP API、钱包及用户网关集成测试通过，128 项相关前端测试通过。新回归先复现后修复，包括上游正数低价覆盖流式配置价、SDK 三次重复调用、跨包中文、取消传播及首段早于生成结束。TypeScript 检查、生产构建、75 个静态导出别名和独立代码复查通过，修改运行模块的严格 Ruff 规则计数没有增加。托管 CI 未运行

流式断线或上游结果不确定时继续沿用原有预扣复核策略，不把部分已生成结果自动当作免费调用。验收中一次上游 HTTP 402 没有产生正式扣款，临时测试账号的预扣在核对原生日志为失败、输出为零且费用为零后，通过带审计的操作释放，保留原记录

最终主实例真实验收：Uncensored 返回 265 段内容，约 3.3 秒开始正文、7.7 秒完成，725 个输出 Token 扣除 885900 纳美元，与当时配置价及用量核算一致；GPT 返回 608 段，按配置价核算一致，纳美元向上取整差异不超过一个最小单位。两次均以 `stop` 结束并释放预扣差额。禁用压缩后浏览器观察到 245 次正文增长，从 28 字符持续到 1498 字符，跨越约 4.7 秒，关闭流式后也可正常返回。375 像素视口没有横向溢出

临时验收 Key 已撤销，账号已停用，会话已清理，剩余 93486849 纳美元测试额度通过审计调整回收；验收实际消耗合计 6513151 纳美元，账本保留。上线后主实例健康，认证配置和原有兑换码批次保持不变

最终镜像 `cocaapi-playground-stream:20261102`，ID 为 `sha256:205c50196dbb1a88f169cec2ba805c50c135b39b115dde15efa46f54fde1888e`，基于上一节输出上限修复镜像，覆盖四个 Python 模块和前端资源。发布前备份位于 `/opt/cocaapi/backups/playground-stream-20261102T081352Z/`，数据库归档目录检查通过，未做完整恢复演练。没有新增数据库迁移。回滚时保留本次计价修复，或先开启计费维护，不能整库恢复覆盖账本
