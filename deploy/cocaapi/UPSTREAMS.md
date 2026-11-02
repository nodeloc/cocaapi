# CocaAPI 上游接入

## Experiential Labs，2026-11-02

通过原生 `/model/new` 接入 `https://api.experientiallabs.ai/v1`，使用 OpenAI 兼容协议。只登记用户截图指定的四个模型，没有导入上游模型列表中的其他模型，也没有改动既有用户、钱包、Key、预算或授权

| 截图名称 | CocaAPI 与上游模型 ID | 服务器直连实测 | 当前状态 |
| --- | --- | --- | --- |
| DeepSeek V4.1 Flash | `deepseek-v4.1-flash` | HTTP 403，`model_location_not_supported` | 已配置原厂价，保留当前启用开关 |
| GPT-6 Luna | `gpt-6-luna` | HTTP 403，`model_location_not_supported` | 已配置原厂价，保留当前启用开关 |
| DeepSeek V4.1 Flash 1017 | `deepseek-v4.1-flash-1017` | HTTP 403，`model_location_not_supported` | 已配置原厂价，保留当前启用开关 |
| DeepSeek V4.1 Flash 1017 Uncensored | `deepseek-v4.1-flash-uncensored` | 普通与 SSE 请求 HTTP 200，均返回 OK | 已配置发布方标准价，保留当前启用开关 |

上游 `/v1/models` 鉴权成功，返回 314 个模型，四个 ID 均存在。Uncensored 的实际 ID 不带 `1017`。服务器出口 IP 为 141.98.197.58，DB-IP 自查返回日本，前三个模型仍被上游拒绝，不能据此承诺该出口可用。上游文档将该错误定义为模型地区不支持或地区无法确认，建议联系上游核实；单纯重试、换 Key 或增加余额不能解决，参见 [官方错误说明](https://platform.experientiallabs.ai/docs/errors) 与 [模型地区规则](https://platform.experientiallabs.ai/docs/models)

截图中的 Free 标签不等同于 CocaAPI 售价。两次 Uncensored 短请求各报告 11 个输入 Token、2 个输出 Token、费用 0，其中流式请求正常返回结束帧及用量。该测试只说明这两次请求的结果，不构成其他模型、其他请求或后续促销期间的费用承诺

初次接入时四个部署均暂停。定价操作前检查发现后台已经取消四个部署的暂停，本次保持这些开关，不替用户恢复或取消暂停。用户已确认采用 DeepSeek / OpenAI 原厂价、Uncensored 发布方标准价；后续面向所有现有及新注册客户开放四个目标模型，保留余额检查与调用限额。其余三个模型仍需解决上游地区拒绝后重新验证，本次定价没有改动客户、新注册客户或现有 Key 的授权

### 后续开放规则

发布授权仅限上表四个模型，不使用 `all-proxy-models`，后续新增上游或其他模型不会随之自动开放。只将完成连接和计价验证的模型加入公开范围；没有通过验证的部署继续暂停。现有客户和新注册客户使用相同的公开模型范围，账号停用、邮箱验证、原有 Key 模型范围及调用限额继续执行

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
