# GoEpay 充值

GoEpay V2 适配器接入支付宝与微信，钱包仍按 USD 记账。USDT 保留原接口，当前没有启用的 USDT 通道。用户已确认先部署代码，当前生产 `COCAAPI_GOEPAY_ENABLED=false`，充值入口关闭，兑换码、余额检查和 API 扣费继续使用原逻辑

真实商户身份、支付开关和平台 RSA 签名验证成功。支付宝和微信的真实下单均被平台以已验签的 `payment channel not permitted` 拒绝，随后主动查单确认没有外部订单。通道授权、真实收银台、原单号重放及实际付款到账尚未验收，不计作通过

## 配置

私钥及平台公钥放在服务器 `payments/merchant.pem`、`payments/platform.pem`，目录为 700，文件为 600，属于网关运行账户。Compose 以只读方式挂载到 `/run/cocaapi-payments`。密钥不进入 Git、静态前端、镜像层或环境变量内容。以下参数写入受限的 `auth.env`，示例商户号及域名须替换

```dotenv
COCAAPI_GOEPAY_ENABLED=false
COCAAPI_GOEPAY_ORIGIN=https://pay.example.com
COCAAPI_GOEPAY_MERCHANT_ID=1001
COCAAPI_GOEPAY_PRIVATE_KEY_FILE=/run/cocaapi-payments/merchant.pem
COCAAPI_GOEPAY_PUBLIC_KEY_FILE=/run/cocaapi-payments/platform.pem
COCAAPI_GOEPAY_RECOVER_CHECKOUT=false
```

平台先为商户分配实际支付宝及微信通道，再将启用开关改为 true 并重建网关。适配器要求返回带平台单号的 `pay_type=jump`、`pay_info` 托管收银台，且收银台与配置网关同源。商户不能强制切换到没有平台单号的收银台意图分支；该分支会拒绝处理，不能猜测外部单号或支付方式

同单号恢复默认关闭。只有在实际商户上验证未付款订单重放保持原平台单号后，才可启用 `COCAAPI_GOEPAY_RECOVER_CHECKOUT`。恢复先按原商户订单号主动查单，只有身份、原金额及未支付状态均正确时，才以完全相同业务参数重放并要求平台单号一致。回调不会发起创建请求，查不到订单或结果不明时不会猜测重建

签名密钥在进程内缓存，轮换密钥文件后需重建网关。保留原认证、OAuth、兑换及计费密钥

## 汇率与报价

支付以 CNY 计价。`rates` 服务每小时检查 [Frankfurter USD/CNY 接口](https://frankfurter.dev/)，源数据为日度参考汇率，使用 Decimal 并将人民币应付金额向上取整到分。报价先随本地订单保存，再调用外部支付接口。更换汇率不会改变既有订单的 CNY 应付金额、USD 入账额度、汇率数值及日期

汇率查询结果超过 36 小时没有成功更新、参考日期超过七天或时间异常时，拒绝新下单。首次没有有效报价时也拒绝，不使用固定比例兜底；既有订单仍可查单与入账。汇率独立存储在 `CommerceExchangeRate`，不需要给前端访问外部汇率服务

```sh
docker compose -f compose.yaml -f compose.auth.yaml --profile payments up -d rates
docker compose -f compose.yaml -f compose.auth.yaml run --rm --no-deps rates --once
```

原 `network` 请求字段为兼容保留，现在也可表示 `alipay`、`wxpay`。订单新增 `payment_amount`、`asset` 和 `quote`；旧 `amount_usdt` 只为 USDT 返回，不能用它展示人民币。界面沿用原充值表单、表格与 CSS，显示支付币种和下单汇率，保留中英文切换

## 回调与入账

异步通知地址为应用公开地址加 `/commerce/webhooks/goepay`，使用 GET 查询参数。浏览器返回 `/account/orders/` 仅展示订单，不确认付款。依据 [V2 签名规则](https://goepay.cc/doc/sign_note.html)、[创建](https://goepay.cc/doc/pay_create.html)、[查询](https://goepay.cc/doc/pay_query.html) 和 [通知](https://goepay.cc/doc/pay_notify.html) 文档实现

请求及响应采用 RSA-SHA256、PKCS#1 v1.5，密钥至少 2048 位。响应在使用业务字段前核对平台签名和 300 秒时间窗口。重复参数、重复 JSON 键、嵌套响应、未签名内容和非法格式均拒绝，签名前使用原始标量值，之后再做表单编码

通知验签后再主动查单，核对商户、原订单、平台单号、支付方式及精确金额。只有 `status=1`、没有已退款金额且付款时间有效时才入账；全退、部分退款、冻结和未释放预授权不能作为完整充值。已入账订单的后续退款不自动扣回钱包，须结合账本与平台账单人工核查，当前没有开放退款接口

订单、钱包、唯一流水和外部通知在原事务边界内处理。并发查单和重复通知只入账一次，待补缴费用仍按原钱包规则优先偿还。只有事务已成功且订单确认为 paid 时，通知才返回 HTTP 200 和精确正文 `success`

## 2026-11-03 验证与发布

91 项后端定向测试通过，覆盖真实 RSA 运算、回调篡改、重复参数、人民币报价快照、创建超时、恢复边界、部分退款、冻结、并发通知、唯一入账、原 USDT 兼容、钱包、兑换与 API 扣费。20 项前端定向测试、生产类型检查和静态构建通过。定向严格 Python 类型、类型纪律和 Ruff 检查为零错误；前端 ESLint 为零错误，保留复杂度等警告。三份 Prisma schema 验证通过，220 个迁移通过禁止数据改写检查

浏览器在预发布及主服务验证了支付关闭状态、人民币报价和汇率显示、桌面导航状态、390 像素手机布局与菜单，无页面异常。公开 HTTP 检查继续覆盖两个官网、静态资源、用户页面、受保护读取、原管理登录和 readiness。没有执行实际付款，没有向测试钱包充值或创建个人 Key。没有运行全量测试、托管 CI 或外部审查机器人；独立只读复核的财务及恢复问题均已处理

镜像为 `cocaapi-goepay:20261103-v2`，ID `sha256:1f39431b9124f0bbcded2c86f4b1013774c3cc7bd4111e27d9b3fa27753935d6`，继承已运行镜像，仅覆盖充值代码、schema、新迁移与前端。备份位于 `/opt/cocaapi/backups/goepay-20261103T034732Z/`，数据库归档通过目录检查，未进行完整恢复演练。已有认证和模型配置、原计费代码、两站官网及 Caddy 保持原样

主服务确认支付关闭、汇率进程运行，且持久汇率更新时间晚于该进程启动时间。两个未付款本地意图再次通过平台验签查单确认不存在外部订单后移除，测试账户停用并清除会话。测试环境、预发布实例及临时浏览器状态已清理，回退资料和验收记录保留在受限备份目录

不要把已产生人民币订单的环境直接回退到不认识新支付类型的旧版本，也不要恢复旧数据库覆盖后续流水。维护时保留兼容镜像和密钥，先停止新建充值订单并保持已付款订单的通知与查单可用，再核对外部订单和本地账本
