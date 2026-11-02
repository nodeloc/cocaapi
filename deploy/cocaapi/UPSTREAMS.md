# CocaAPI 上游接入

## Experiential Labs，2026-11-02

通过原生 `/model/new` 接入 `https://api.experientiallabs.ai/v1`，使用 OpenAI 兼容协议。只登记用户截图指定的四个模型，没有导入上游模型列表中的其他模型，也没有改动既有用户、钱包、Key、预算或授权

| 截图名称 | CocaAPI 与上游模型 ID | 服务器直连实测 | 当前状态 |
| --- | --- | --- | --- |
| DeepSeek V4.1 Flash | `deepseek-v4.1-flash` | HTTP 403，`model_location_not_supported` | 已添加，暂停 |
| GPT-6 Luna | `gpt-6-luna` | HTTP 403，`model_location_not_supported` | 已添加，暂停 |
| DeepSeek V4.1 Flash 1017 | `deepseek-v4.1-flash-1017` | HTTP 403，`model_location_not_supported` | 已添加，暂停 |
| DeepSeek V4.1 Flash 1017 Uncensored | `deepseek-v4.1-flash-uncensored` | 普通与 SSE 请求 HTTP 200，均返回 OK | 已添加，暂停 |

上游 `/v1/models` 鉴权成功，返回 314 个模型，四个 ID 均存在。Uncensored 的实际 ID 不带 `1017`。服务器出口 IP 为 141.98.197.58，DB-IP 自查返回日本，前三个模型仍被上游拒绝，不能据此承诺该出口可用。上游文档将该错误定义为模型地区不支持或地区无法确认，建议联系上游核实；单纯重试、换 Key 或增加余额不能解决，参见 [官方错误说明](https://platform.experientiallabs.ai/docs/errors) 与 [模型地区规则](https://platform.experientiallabs.ai/docs/models)

截图中的 Free 标签不等同于 CocaAPI 售价。两次 Uncensored 短请求各报告 11 个输入 Token、2 个输出 Token、费用 0，其中流式请求正常返回结束帧及用量。该测试只说明这两次请求的结果，不构成其他模型、其他请求或后续促销期间的费用承诺

四个部署的 `blocked` 均为 true，尚未对客户开放。对外输入/输出价格及开放范围等待用户确定；其余三个模型还需要解决上游地区拒绝后重新验证。保留现有余额不足拦截、原生模型权限和调用限额，不自动赋予用户所有模型，不改写新注册客户的默认权限

凭据使用原生模型 API 加密存入数据库，没有进入此文档、前端或 Git。受限服务端配置为 `/opt/cocaapi/experiential.env`，本地受限副本位于部署密钥目录；不要将这些文件加入镜像、构建归档或代码仓库

变更前数据库备份位于 `/opt/cocaapi/backups/experiential-20261102T040044Z/database.dump`，归档目录检查通过，没有执行完整恢复演练。登记过程不需要重启网关或修改数据库结构。管理后台读取确认四个模型均存在且暂停，上游直连测试没有借用客户 Key 或扣除客户余额
