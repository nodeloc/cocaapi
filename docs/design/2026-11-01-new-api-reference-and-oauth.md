# New API 参考实现与 OAuth 接入

日期为 2026-11-01。本次完成参考仓库拉取和规划更新，未修改线上服务，也未实现或验证真实 OAuth 登录

## 参考仓库

上游为 `https://github.com/QuantumNous/new-api`，fork 为 `https://github.com/kissopen/new-api`。本地只读参考目录为 `E:\cocaapi-references\new-api`，本次检查版本为 `d0abbf6e0d33552a41c402d9b1fadbaff27cf40d`

参考仓库独立于 LiteLLM 工作树，不把它嵌入 CocaAPI 的生产镜像。New API 的 LICENSE 标识为 AGPL-3.0，LiteLLM 的非 enterprise 内容使用 MIT 许可。本次只整理功能、状态与接口参考，没有复制 New API 的业务源码、界面组件或资源；未来若决定复用源码，另行记录来源与许可处理

## 已检查的源码入口

| 功能 | New API 源码入口 | CocaAPI 采用的设计 |
| --- | --- | --- |
| 邮箱注册 | `controller/user.go` 的 Register | 注册开关、普通用户创建、邮箱冲突处理 |
| OAuth 流程 | `controller/oauth.go` | 登录与绑定明确区分、服务端保存授权事务、新用户受注册策略控制 |
| 供应商适配 | `oauth/provider.go`、`oauth/github.go`、`oauth/oidc.go`、`oauth/generic.go` | 统一适配器，核心用户业务与供应商字段分离 |
| 账号关联 | `model/user_oauth_binding.go` | 独立外部身份关联记录和唯一约束 |
| 充值 | `controller/topup.go`、`model/topup.go` | 本地订单、支付状态检查、重复完成幂等、状态与加款同事务 |
| 兑换码 | `controller/redemption.go`、`model/redemption.go` | 批次管理、有效期、条件占码、占码与入账同事务 |
| 用户页面 | `web/src/features/auth/`、`web/src/features/wallet/` | 登录入口、钱包、兑换、订单和状态反馈的功能组织 |
| 管理配置 | `web/src/features/system-settings/auth/custom-oauth/` | 供应商启停、应用配置、Discovery 与回调地址展示 |

对 OAuth、充值和兑换源码进行了定点阅读，未运行 New API 测试或进行完整安全审计，不能据此断言其所有异常路径已验证。CocaAPI 使用自己的数据库事务账本和测试，不照搬 Go/GORM 的实现或配额单位

## 用户确认的第一批登录平台

第一批为 GitHub、Google、NodeLoc，保留邮箱密码登录。Linux DO 不在本次确认的首批范围内

GitHub 使用 OAuth Authorization Code Flow，身份使用已认证 `/user` 的数值 id。Google 和 NodeLoc 使用 OIDC，身份使用受信任 issuer 与 sub，显示名和邮箱不作为外部身份主键

所有方式映射到同一个 CocaAPI user_id，钱包、Key 和消费记录与登录方式无关。已关联身份直接登录，未关联身份根据注册策略建立零余额账户，同邮箱已有账户需要先登录原账户再绑定，不自动合并

## NodeLoc 当前入口

已读取当前 Discovery 文档 `https://www.nodeloc.com/oauth-provider/.well-known/openid-configuration`

其 issuer 为 `https://www.nodeloc.com`，授权、换 token 和用户信息入口位于 `/oauth-provider/authorize`、`/oauth-provider/token` 和 `/oauth-provider/userinfo`。公开元数据声明 RS256、openid/profile/email 及 email_verified 等能力

早期教程中的 `https://www.nodeloc.com/.well-known/openid-configuration` 本次返回 404，不作为生产配置。NodeLoc 论坛教程的后续回复也给出了当前 Discovery 地址

当前元数据未列出 `code_challenge_methods_supported`，这不能证明支持或不支持 PKCE。实施时用测试应用核对 S256、nonce 与 ID token 的实际处理，不在失败后自动降级或切换到旧 conn 域名

应用管理入口为 `https://www.nodeloc.com/oauth-provider/applications`。本次没有创建应用或取得商户式凭据，不需要读取用户的 NodeLoc 管理密钥

## CocaAPI 的回调地址

| 平台 | 计划回调地址 |
| --- | --- |
| GitHub | `https://cocaapi.com/account/api/v1/oauth/github/callback` |
| Google | `https://cocaapi.com/account/api/v1/oauth/google/callback` |
| NodeLoc | `https://cocaapi.com/account/api/v1/oauth/nodeloc/callback` |

这些地址是 CocaAPI 的接口规划，当前尚未实现。New API 教程中的 `/oauth/nodeloc` 属于其自身路由，不能直接用作 CocaAPI 回调

## 实施约束

授权事务保存一次性 state、预期提供商、issuer、用途、目标账号、浏览器绑定、有效期、nonce 和 PKCE 资料。回调不相信浏览器提交的用户编号或用途，多 worker 共享授权事务并原子消费

GitHub 和 Google 使用 S256 PKCE。NodeLoc 的 PKCE 能力在真实应用中验证后锁定配置，若需协议兼容方案，必须单独明确其保护机制和验收，不通过重试自动关闭 PKCE。所有提供商都保留 state 与浏览器绑定，OIDC 必须验证签名、issuer、audience、有效期、nonce 以及 userinfo 的 sub 一致性

第三方 token 由服务端交换，只用于这次读取身份，第一版不保存长期 refresh token。登录成功使用 CocaAPI 自己的 HttpOnly Cookie，会话轮换后跳转受限的站内地址，不将会话 token 放入 URL 或 localStorage

接受提供商已验证邮箱的前提是提供商身份和对应声明已完成服务端验证。GitHub 核对其邮箱 API 的 verified 与 primary，不能把公开资料 email 当成已验证邮箱。缺失或未验证邮箱的账户需要补充并验证邮箱后才能执行钱包和 Key 操作

绑定与解绑需要当前账户会话及近期重新认证。一次外部身份不能属于两个用户，不能解绑最后一个可用登录方式。OAuth-only 用户可以在验证邮箱与重新认证后设置本地密码，不能生成一个未知随机密码冒充可用密码登录方式

公开注册关闭时，已有绑定仍可登录，新身份不能借 OAuth 绕过注册限制。用户被禁用后，所有方式都拒绝登录与模型调用，外部群组或角色声明不映射为 CocaAPI 管理员

实现优先采用维护中的 OAuth/OIDC 库，候选为 Authlib 的异步 HTTPX/Starlette 客户端，在实施时核对兼容版本与补丁并锁定依赖，不手写 JWT 签名验证

## 验收

三家分别验证首次注册、重复登录、已注册邮箱冲突、绑定、解绑、取消授权、提供商故障与停用状态。公共故障测试覆盖 state 重放、过期、跨浏览器、供应商混淆、错误 audience/issuer/nonce、授权码重复消费和多 worker 并发回调

必须证明一个外部身份只产生一个本地账户和一个钱包，同一个本地账户的三种登录方式看到相同余额和 Key。使用真实测试应用完成浏览器授权才能声明集成通过，模拟提供商只用于故障和事务测试

## 官方参考

GitHub 授权流程 https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

Google OIDC https://developers.google.com/identity/openid-connect/openid-connect

NodeLoc Discovery https://www.nodeloc.com/oauth-provider/.well-known/openid-configuration

NodeLoc 接入教程 https://www.nodeloc.com/t/topic/95280

Authlib 异步集成 https://docs.authlib.org/en/v1.7.0/oauth2/client/web/starlette.html

OWASP OAuth https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html

OWASP 身份关联 https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#secure-federated-account-linking

OWASP 会话 https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

OWASP ASVS 当前稳定版为 5.0.0，实施时将适用的认证、会话和 OAuth 控制映射为具体测试，不以本文代替符合性验证 https://asvs.owasp.org/
