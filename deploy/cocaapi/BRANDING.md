# CocaAPI 控制台品牌

登录、注册、忘记密码、邮件验证、重置密码、原生管理登录和邀请页，以及用户后台侧栏统一使用用户提供的新 CocaAPI 标志。页面沿用原有 Card、Sidebar、Sheet、字体、配色和主题变量，没有新增全局 CSS 或改动业务表单

共享组件为 `ui/litellm-dashboard/src/components/common_components/CocaApiLogo.tsx`，素材位于 `public/assets/cocaapi`。完整字标保留原始比例，登录页宽 160px，用户侧栏宽 120px，收起时使用 28px 独立标志。深色主题显示 white SVG，浅色主题显示 black SVG，不使用反色滤镜或重新绘制标志

管理侧栏和旧版导航继续通过原生 `/get_image` 获取图片，镜像中的四个默认 PNG 已替换为同套品牌的深浅字标与独立图标。原有 `UI_LOGO_PATH`、`UI_LOGO_PATH_DARK` 及数据库主题设置的优先级保持不变。默认图片地址带 `v=cocaapi-20261102`，让浏览器重新加载品牌图片；自定义地址保持原值

根页面继续通过 `/get_favicon` 获取页签图标，镜像默认 `LITELLM_FAVICON_URL` 指向本地 `favicon-32.png`，显式环境变量和主题配置仍可覆盖。当前后端本地图片校验不接受 SVG，因此没有将 SVG 路径传给该接口。导出的 `favicon.ico` 及原生备用 ICO 同样换为新标志，官网继续使用原先的自适应 SVG 图标

## 构建

前端使用现有生产导出流程，不增加运行依赖。完整后端镜像的 `Dockerfile.auth` 同步复制默认品牌资源，后续构建不会恢复旧 Logo

本次使用 `Dockerfile.ui` 在已验证的兼容计费镜像上增加前端文件与默认品牌资源，没有替换后端 Python、依赖或数据库迁移。构建参数必须显式指定当前兼容镜像，并在构建前核对其镜像 ID

```sh
cd ui/litellm-dashboard
npm run build
cd ../..
docker image inspect --format '{{.Id}}' cocaapi-wallet-billing:20261102
docker build --pull=false -f deploy/cocaapi/Dockerfile.ui \
  --build-arg COCAAPI_RUNTIME_IMAGE=cocaapi-wallet-billing:20261102 \
  -t cocaapi-dashboard-brand:20261102 .
node deploy/cocaapi/tests/branding.smoke.mjs https://cocaapi.com
node deploy/cocaapi/tests/website.smoke.mjs https://cocaapi.com
```

本次基础镜像 ID 为 `sha256:819831d0f24335af6c16734c86001cb374033168e285d8adb0721e1502200a60`，最终品牌镜像为 `cocaapi-dashboard-brand:20261102`，ID 为 `sha256:469c6b6c42f163bb0292893ed0ab10a33cbbe3affa8d21c2715f29cff04fee22`

## 2026-11-02 验证与发布

8 个定向套件共 104 项测试通过，覆盖原生侧栏、导航、账户布局、登录注册与邀请表单。77 页生产导出及 TypeScript 检查通过，保留原有 AVIF 构建提示。修改文件 ESLint 为零错误，36 条警告来自原生图片组件、导航及已有测试代码，未增加屏蔽规则

最终静态产物在本地隔离响应下验证了 7 类页面的手机及桌面、深浅主题，共 28 种组合。字标正确加载、比例不变、完整字标宽度不少于 96px，用户和管理侧栏收起后显示独立标志。未捕获页面异常为零，未向生产写入测试用户、余额或设置

预发布公网 HTTP 检查通过：11 个控制台品牌资源、4 种原生 Logo 与页签图标和源码字节一致，8 个认证与账户页面及 4 个受保护读取正常。官网兼容检查覆盖首页、21 个资源、14 个用户页面、6 个受保护读取及原管理资源。真实管理员会话在 Home、Virtual Keys、Budgets、账户与充值页面完成手机和桌面深浅主题检查，共 16 种组合，原生侧栏收起及 4 个公开认证页面通过，无页面异常或品牌图片失败

备份目录为 `/opt/cocaapi/backups/dashboard-brand-20261102T034347Z/`，包含数据库归档、环境、Compose、Caddy、原镜像 ID、八个核心后端文件摘要及加密 OAuth 配置摘要。数据库归档通过目录检查，没有进行完整恢复演练。新实例与主实例的核心认证、计费文件摘要和 OAuth 配置及 revision 与发布前一致

发布先在 4001 启动兼容新实例，切换 Caddy 完成公网检查，再重建 4000 主服务并切回。Caddy 官网路径、私有缓存头、认证边界与 API 路由保持原有配置。此次无新增数据库迁移，未执行真实模型计费、第三方授权、邮件或支付验收，托管 CI 未运行

回退时只将 `.env` 的 `COCAAPI_IMAGE` 恢复为上述兼容计费基础镜像并重建 gateway，保留当前 `auth.env` 与数据库，不回退到早期不支持欠费记账的镜像。官网静态发布和 `WEBSITE_REVISION` 独立于控制台镜像
