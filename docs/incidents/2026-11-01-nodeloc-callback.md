# 排查报告：NodeLoc OAuth 回调 500

使用 backend-incident-investigator、systematic-debugging 与测试先行流程排查，未重放用户提供的一次性授权码

## 1. 现象摘要

生产 NodeLoc 登录回调返回内部服务器错误。入口为 `account_routes.oauth_callback`，发生在换取令牌阶段

## 2. 入口与调用链

回调先消费与浏览器绑定的 state，再调用 `ProviderClient.exchange`、Authlib `AsyncOAuth2Client.fetch_token` 和 NodeLoc token endpoint。身份验证成功后才创建或关联客户，本次错误发生在身份创建之前

## 3. 关键逻辑与嫌疑点

日志显示 NodeLoc 返回 `invalid_client`。实际抛出的是 `authlib.integrations.base_client.errors.OAuthError`，原代码只捕获 RFC6749 的 `OAuth2Error`，两者没有继承关系，因此异常漏出成为 500

后台保存的 Client Secret 有首尾空白。使用诊断用无效 code 时，原值返回 `invalid_client`，去除空白后返回 `invalid_grant`，表明客户端认证被接受，但诊断码不是有效授权。这个检查没有申请或获得用户令牌

NodeLoc 的[公开发现元数据](https://www.nodeloc.com/oauth-provider/.well-known/openid-configuration) 声明同时支持 `client_secret_post` 和 `client_secret_basic`。本次没有修改客户端认证方式、PKCE、nonce 或签名验证

## 4. 配置验证

通过现有配置仓储和解密服务读取，仅输出长度及是否含首尾空白，不输出密钥。原值长度 66，归一化后长度 64。生产配置记录、注册开关和提供商开关保留原样，不进行数据迁移或改写

## 5. 结论矩阵

| 类别 | 结论 | 证据 |
| --- | --- | --- |
| 配置输入 | 密钥含多余空白 | 同一诊断请求去空白后错误从 invalid_client 变为 invalid_grant |
| 代码处理 | 捕获错误的异常类 | 真实 mock HTTP 返回相同错误时可重现未捕获异常 |
| 服务可用性 | 不是整体服务故障 | 原生后台及 readiness 正常 |

## 6. 修复和验证

支持的平台凭据在构造运行配置时归一化，覆盖已有数据库密文与环境配置。新密钥保存时去除首尾空白，全空白输入保留旧值。遗留全空白密钥会使账号配置返回 503，不能作为可用凭据启用

捕获 Authlib 实际客户端异常，`invalid_client` 映射到固定的应用凭据错误，其余授权失败映射到固定授权错误。回调返回 303 到用户登录页，不回显上游描述，仍在访问日志之前清除回调查询参数。前端提供联系管理员核对应用凭据的提示

112 项后端测试通过，包括四项 token endpoint 错误/出站凭据回归、回调跳转与查询清除、新密钥归一化和遗留空白密钥保护。6 项前端定向测试及生产构建通过，ESLint 无错误。配置服务类型检查零错误，OAuth 客户端现有 22 条第三方类型诊断与基线相同，未新增；Ruff strict 和类型纪律检查通过

真实用户登录仍需从登录页重新发起，已经消费的一次性 state 与 code 不能用于重试

## 发布信息

修复代码为 `a90c3882`，镜像 ID 为 `sha256:97dd8afcbd0b19e89d4b6336e70903cc725114d327d4f788b277eb0d9412b95a`。升级前备份位于 `/opt/cocaapi/backups/nodeloc-fix-20261101T144407Z/`，已通过备份目录检查，未做完整恢复演练

最终镜像使用真实配置调用 NodeLoc token endpoint，验证归一化后的凭据通过客户端认证，无效诊断授权码被捕获为业务错误。部署前后对配置 revision 和密文 payload 摘要进行比较，配置原文没有变化

主网关发布后已通过公网完整负向回调流程：新建独立诊断 state、发送新的无效诊断 code、返回 303 登录页错误提示，不创建用户会话。生产主网关为 healthy，注册和应用配置保持原值。用户真实授权成功仍需重新发起登录，未将诊断请求视为真实登录验收
