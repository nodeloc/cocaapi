# Dashboard bilingual UI Implementation Plan

> Execute inline in this session, using tests before implementation and an independent review before release

**Goal:** 管理后台、用户后台和登录注册页支持中文、English 切换，保留原布局与业务行为

**Architecture:** 静态资源词库和 React 语言订阅统一管理偏好，源码级标记界面文案。页面不调用翻译接口，不扫描或改写 DOM 文本。中文默认，非敏感语言偏好持久保存并跨标签同步。字符串只在明确的界面文案位置标记，数据、模型 ID、API 参数、代码片段不翻译

**Tech Stack:** React useSyncExternalStore、TypeScript AST、静态 JSON 词库、原生 Select、Intl、Vitest 和 Playwright

**Spec:** 当前用户要求管理后台与用户后台支持中英文切换，延续之前保持现有界面风格的要求

## Task 1: Language state and translation boundary

Files: `src/lib/i18n/{locale,messages,LanguageProvider,LanguageSwitcher,LocalizedText}` and focused unit/integration tests in the same directory

- [x] 先测试默认中文、切换英文、刷新记忆、非法偏好回退、存储禁用、跨标签同步和无 hydration 不一致
- [x] 实现 `UiLocale = "zh" | "en"`、`translateMessage(source, values?)`、`useUiLocale()`、`getIntlLocale()`，无 Provider 时保留原文供独立组件使用
- [x] 使用非敏感 cookie/localStorage 保存偏好，语言变化不重挂载页面，不清除输入或请求数据
- [x] 测试逐项插入动态值，保持模型名、用户数据和 HTML 字符为原文，不把翻译结果作为 HTML 执行

## Task 2: Static copy and existing UI integration

Files: `scripts/localize-ui.mjs` and its Node tests, static dictionaries, existing admin/customer components, root layout

- [x] 先写源码转换测试，验证 JSX 文案、可访问名称、表格标题、模块标签、插值和代码片段边界，确认测试失败
- [x] 使用 AST 范围编辑保留原代码结构，明确排除测试、API schema、代码示例、value/key/model/路径等业务字段
- [x] JSX 文案使用独立 React 翻译组件，属性使用翻译函数；静态配置通过 WeakMap 保存源文案，仅展示时翻译，保留原对象、序列化及稳定键；React 组件订阅语言
- [x] 表格标题翻译保留稳定列 ID，已有 memo 依赖包含语言，禁止更改请求/业务值
- [x] 生成并校验双语词库，人工核对导航、计费、权限、登录等关键术语，缺词保持原文
- [x] 管理后台页头、原 Navbar、用户后台及登录注册框接入同一个原生语言选择器，移除局部固定语言覆盖
- [x] 依据选择语言处理日期、数字与页面语言属性，保留美元额度精度

## Task 3: Verification and production release

- [x] 运行新测试、受影响账户/导航/表格/聊天定向测试、生产类型检查、ESLint 与生产构建、显式 postbuild
- [x] 独立审查语言状态、数据误译、React hooks、表格 ID、持久化和静态导出兼容，处理重要问题
- [x] 备份当前配置及数据库，基于当前运行镜像只更新前端静态产物，保持后端计费代码与凭据
- [x] 浏览器验收管理后台和用户后台的中英文、页面导航、刷新、手机布局和表单保留，核对 API 参数未翻译
- [x] 切换主实例，核对健康与后端摘要，清理浏览器状态和预发布实例，更新文档、提交并推送
