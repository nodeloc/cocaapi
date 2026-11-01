# Account Native Style Implementation Plan

**Goal:** 账号、余额、充值、兑换码及登录配置使用原后台现有风格和组件

**Architecture:** 直接使用 shared/Page、PageHeader、DataTable、原用量 Stat 和 ui 表单控件，不添加新的 CSS 或设计系统。账号 Session、管理员鉴权、金额精度、支付开关及 OAuth 配置保持不变

**Tech Stack:** 现有 Next.js、React、Tailwind、Base UI、TanStack Table

**Spec:** 用户要求「我们新加的页面也参考他原来的风格」

## 页面统一

- [x] AccountDashboardShell 改用原 Page 和 PageHeader；AccountShell 对齐原登录页间距和 Alert
- [x] CommerceAdmin、LoginSettings 复用原页面标题、导航、CardHeader、Checkbox 和 Select
- [x] WalletTables 和管理余额、兑换码表格使用原 DataTable，保留 has_more 分页，不虚构总数
- [x] AccountWallet 使用原统计 Stat，账号和安全页使用原卡片标题与表单控件

## 验证与交付

- [x] 运行账号、钱包、登录配置及认证集成测试、修改文件 ESLint、TypeScript 和生产构建
- [x] 浏览器检查桌面、手机、深色模式及表单交互，生产不写入测试数据或凭据
- [x] 备份后预发布、切换生产、核对 OAuth 配置指纹和私有缓存头
- [x] 更新记录、提交推送并清理临时环境
