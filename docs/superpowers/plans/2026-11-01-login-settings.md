# Login Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在现有后台配置 NodeLoc、GitHub、Google OAuth 凭据与用户注册开关

**Architecture:** 使用独立数据库记录保存配置，客户端密钥由现有认证主密钥加密。无数据库记录时沿用环境配置；存在记录后由数据库配置覆盖。每次账号请求读取有效配置，两个 worker 无需重启。仅原生完整代理管理员持 Bearer 凭据可读写，GET 永不返回密钥，更新采用 revision 比较并记录无密钥审计

**Tech Stack:** FastAPI、Prisma、PostgreSQL、Fernet、Next.js、shadcn、openapi-fetch

**Spec:** 本计划中的接口与约束为本次实现规格

## Global Constraints

只允许三个固定提供商，不允许自定义 issuer 或回调地址。SMTP 暂沿用环境配置，后台展示其可用状态。注册开关保持原值，不自动开放生产注册。空密钥保留现值，清除须显式操作，缺少凭据不能启用提供商。配置解密失败时关闭账号服务，不回退到可能已经禁用的旧配置。数据库和认证加密主密钥需一同备份

## Task 1 配置存储与接口

**Files:** `litellm/models/commerce_login_settings.py`、`litellm/repositories/commerce_login_settings_repository.py`、`litellm/proxy/commerce/login_settings_service.py`、`litellm/proxy/commerce/admin_login_routes.py`、现有 config 与账号依赖、新迁移及三份 schema、`tests/integration/commerce/test_login_settings.py`

**Interfaces:** `GET/PUT /commerce/admin/v1/login-settings`；GET 返回 revision、注册及 SMTP 状态、提供商 ID、Client ID、启用/密钥已配置状态和固定回调 URL。PUT 传完整三个提供商、注册开关及 revision，密钥字段可省略保留或显式清除

- [x] 先验证管理员读取接口缺失时测试失败
- [x] 加密存储、版本冲突、空值保留、清除、权限及解密失败测试
- [x] 接入账号运行配置并测试独立服务实例立即读取已保存配置
- [x] 三份 schema、迁移、类型与既有认证及钱包回归检查

## Task 2 管理页面

**Files:** `src/components/account/LoginSettings.tsx`、配置 API 封装、`src/app/(dashboard)/commerce/settings/page.tsx`、后台导航、生成的 schema 类型、前端集成测试

- [x] 测试配置读取、NodeLoc 表单提交与密钥不回填
- [x] 使用现有 Card、Input、PasswordInput、Button、Badge 和 Alert，增加注册开关、固定回调地址与密钥保留/清除说明
- [x] 定向测试、ESLint、类型检查、生产构建及独立审查

## Task 3 验收与发布

- [x] 最终镜像在隔离数据库双 worker 环境完成后台保存、刷新、密钥脱敏及公开登录方式联动验收，随后还原测试配置
- [ ] 备份生产配置和数据库后部署，验证生产配置保持关闭、已有账号/余额/后台正常
- [ ] 更新部署文档、提交并推送，清理临时环境
