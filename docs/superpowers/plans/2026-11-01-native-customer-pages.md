# Native Customer Pages Implementation Plan

**Goal:** 将用户网关页面改为直接渲染现有管理后台原组件，不再维护另行设计的页面布局

**Architecture:** 客户登录后在独立 QueryClient 和客户上下文内挂载原后台 Home、Virtual Keys、Models + Endpoints、Usage、Logs、Playground、API Reference 组件。原组件的请求由限于该页面生命周期的适配层转为 HttpOnly 客户接口，未知管理操作拒绝，不发放原生管理凭据。保留已验证的数据隔离和密钥撤销逻辑

**Tech Stack:** 现有 Next.js 静态导出、React、TanStack Query、FastAPI 客户接口

**Spec:** 用户明确要求「这些界面完全利用后台的，不要自己设计」

## Global Constraints

直接 import 原页面/原表格/原创建弹窗/原图表和原聊天界面，权限裁剪在原组件中完成，不复制一套 JSX。原管理员页面继续走原请求与权限。客户不读取管理员 Cookie、不共享管理员查询缓存、不持有管理 Key。客户请求继续由服务器 Session 隔离。原生组件需要的统计字段从真实日志计算，不虚构模型、费用或统计

## Task 1 原页面与会话适配

- [x] 先验证用户侧显示原 Virtual Keys 标题与创建弹窗的测试失败
- [x] 增加客户上下文、独立查询缓存和限定生命周期的请求适配，原 useAuthorized 识别客户上下文
- [x] 直接渲染原页面，移除上一次自定义的网关页面布局；客户入口链接留在 /account 下
- [x] 原组件仅保留客户可用操作，创建/查看/删除调用现有保护接口

## Task 2 数据协议和 Playground

- [x] 将客户白名单数据适配为原表格与图表协议，缺少的数据从本人真实日志提供
- [x] 复用原 ChatUI、模型选择、聊天输入和消息展示，客户密钥只在内存保存
- [x] 日志、预算、模型及文档使用原组件，禁止通过适配层访问全局配置和其他用户数据
- [x] 定向测试、类型、lint、生产构建和独立审查

## Task 3 验收与发布

- [x] 隔离最终镜像对照原后台验证桌面、手机、深色和主要交互
- [x] 备份、预发布、切换与公网检查；保留 OAuth 配置及生产用户数据
- [x] 更新发布记录，提交推送并清理测试环境
