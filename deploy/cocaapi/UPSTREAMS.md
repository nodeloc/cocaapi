# CocaAPI 上游接入

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
