# Account Dashboard Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 用户中心采用与现有管理后台一致的模板 CSS、侧栏、顶栏、卡片、表格及移动端导航

**Architecture:** 复用 `shared/Sidebar`、Breadcrumb、Sheet、ThemeToggle、Card、Avatar、DropdownMenu 等现有组件，新增只接收客户 Profile 的用户框架。账号、余额、订单和安全设置使用该框架，公开登录及注册表单仍使用现有认证布局。所有请求保留客户 HttpOnly 会话与 CSRF，不引入管理员鉴权或管理接口

**Tech Stack:** Next.js 静态导出、React、TypeScript、现有 Tailwind/shadcn/Base UI 模板

**Spec:** 用户要求「用户后台和现在的管理后台保持一样的风格，可以使用现在的模板 CSS」

## Global Constraints

沿用现有 Inter 字体与主题变量，不增加色板、渐变、图表或虚构统计。使用现有可用功能和后端接口，API Key 发放、调用计费与真实 USDT 收款不在本次范围。客户退出只清理客户会话，不影响管理员登录。手机导航提供可访问的开关与关闭操作，内容区域独立滚动，金额仍以 BigInt 精确展示

## Task 1 用户框架

**Files:** `src/components/account/AccountDashboardShell.tsx`、用户中心集成测试、既有 Wallet 集成测试

- [x] 先验证旧页面缺少安全设置导航和后台框架时测试失败
- [x] 复用侧栏与顶栏组件，加入账号菜单、客户退出、主题切换、折叠和手机抽屉
- [x] 测试当前导航、退出 CSRF、失败提示和手机导航可达性

## Task 2 页面适配

**Files:** `AccountProfile.tsx`、`AccountWallet.tsx`、`src/app/account/security/page.tsx`

- [x] 账号概览与安全设置拆分展示，账号、邮箱完成和第三方绑定能力保留
- [x] 余额采用原模板统计卡片，充值与兑换采用表单卡片，流水和订单使用全宽表格
- [x] 定向测试、ESLint、类型检查、生产构建及独立审查

## Task 3 浏览器验收与发布

- [x] 在隔离账户及最终镜像上验证桌面、手机、深色主题、导航、兑换、订单及退出
- [ ] 备份生产配置与数据库，发布并确认 OAuth、应用配置和原后台保持正常
- [ ] 更新文档，提交并推送，清理临时测试环境
