# QuotaDEX Future Integration Plan：Pieverse Facilitator（swen）

> 日期：2026-04-10
> 目的：记录未来如何把当前 QuotaDEX 从自定义 Escrow 主路线扩展到更贴近 Kite 官方推荐的 `x402 + Pieverse Facilitator` 模式。
> 适用范围：Future Plan，不属于当前 demo 主线。

## 0. 当前状态

截至当前仓库进度，下面这些 Facilitator 接入准备项已经完成：

1. 已新增 `lib/chain/facilitator.ts`
2. `quote` 已新增 x402 风格的 `accepts`
3. facilitator 专用环境变量已加入：
   - `PIEVERSE_FACILITATOR_BASE_URL`
   - `KITE_PAYMENT_ASSET_ADDRESS`
   - `GATEWAY_MERCHANT_WALLET`
4. `verify` 已支持 `X-PAYMENT -> facilitator verify -> facilitator settle`
5. `buyer-demo` 已支持 facilitator 模式：
   - `BUYER_PAYMENT_MODE=facilitator`
   - `BUYER_X_PAYMENT=<real X-PAYMENT>`

当前还未完成的是：

1. 获取真实 `X-PAYMENT` 并做 live validation
2. 仅在验证通过后，再决定是否收缩旧 mock / Escrow 路径

已移入 Future Plan 的外部验证项：

1. 获取 Kite Portal access
2. 准备可用的 MCP-capable client
3. 跑通 `approve_payment` 并拿到真实 `X-PAYMENT`
4. 用真实 `X-PAYMENT` 补做 facilitator E2E

## 1. 为什么未来仍然要集成

### 1.1 当前背景

当前仓库已经具备一条可运行的支付闭环：

1. `quote`
2. `402 Payment Required`
3. Buyer 发起支付
4. `verify`
5. 创建 job
6. Seller 执行
7. `complete/release` 或 `fail/refund`

这条路径当前主要依赖：

1. 自定义 `QuotaDEXEscrow` 合约
2. `deposit(payment_id, seller, amount)`
3. Gateway 侧 receipt 校验
4. Gateway 调 `release/refund`

### 1.2 为什么未来仍然要补 Pieverse Facilitator

Kite 当前官方 `Service Provider Guide` 推荐的服务方支付标准是：

1. 服务端返回 `402`
2. Agent 带 `X-PAYMENT` header 重试
3. 服务端验证 payment token
4. 服务端调用 facilitator `/v2/settle`
5. facilitator 代为执行链上支付

官方还明确推荐：

1. `x402 Pieverse Facilitator`
2. Base URL：`https://facilitator.pieverse.io`

参考：

1. <https://docs.gokite.ai/kite-agent-passport/service-provider-guide>
2. <https://docs.gokite.ai/kite-agent-passport/developer-guide>

### 1.3 迁移的直接收益

迁移后的收益是明确的：

1. 更贴近 Kite 官方支付标准
2. 更贴近 Pieverse 生态接入方式
3. 更利于后续接入 Pieverse Skill Store
4. 更利于黑客松答辩时说明“支付方式与官方推荐一致”

## 2. 当前实现与目标实现的差异

### 2.1 当前实现

当前支付主路径是：

1. Buyer 调 `quote`
2. Gateway 返回 `402 + payment_id + pay_to + amount`
3. Buyer 调 `approve + Escrow.deposit(payment_id, seller, amount)`
4. Gateway 在 `verify` 里校验链上 receipt
5. 完成时 Gateway 调 `release(payment_id)`
6. 失败时 Gateway 调 `refund(payment_id)`

### 2.2 目标实现

目标支付主路径是：

1. Buyer/Agent 请求受保护资源
2. Gateway 返回符合 x402 的 `402`
3. Agent 通过 Kite / Pieverse 支付能力拿到 `X-PAYMENT`
4. Agent 带 `X-PAYMENT` 重试或调用 `verify`
5. Gateway 调 facilitator `/v2/verify`
6. Gateway 调 facilitator `/v2/settle`
7. 支付直接结算到服务方钱包
8. Gateway 创建 job 并继续执行业务流程

### 2.3 最重要的结构差异

这不是“只把 receipt 校验换个接口”这么简单。

最大的变化是：

1. **当前 Escrow 模式**：资金先进入自定义合约，再决定放款/退款
2. **Facilitator 模式**：资金直接结算到服务方钱包地址

Kite 官方文档写得很明确：

1. facilitator 会执行链上转账
2. 资金直接进入服务方指定的 `payTo` 地址
3. 服务方自行管理收到的资金

这意味着：

1. 当前 `Escrow` 与 facilitator 在资金路径上是两种不同模型
2. 因此 facilitator 更适合作为未来的独立集成路线，而不是继续混进当前 demo 主路线

## 3. 推荐的迁移结论

### 3.1 Future integration path

Future Plan 里的支付扩展路线应切到：

1. `x402 + Pieverse Facilitator`
2. `payTo = Gateway merchant wallet`
3. 使用 Kite 官方推荐的测试网支付 token

### 3.2 当前 Escrow 的处理方式

当前 `QuotaDEXEscrow` 不建议直接删除，且继续保留为当前 demo 主路线。

建议改成：

1. 保留代码
2. 继续作为当前比赛版本的主支付路径
3. Facilitator 成熟后，再决定是否降级为长期实验资产

一句话：

1. **当前 demo 主路径：Escrow**
2. **未来扩展支付路线：Facilitator**

## 4. 支付模型应如何调整

### 4.1 资金收款方

迁移后，`payTo` 应改成：

1. Gateway 控制的钱包地址
2. 即服务方 merchant wallet

而不是：

1. `ESCROW_CONTRACT_ADDRESS`

### 4.2 支付 token

如果按 Kite 当前官方测试网说明走，推荐优先改成官方测试 token：

1. Kite Testnet payment token：`Test USDT`
2. 官方示例地址：`0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`

参考：

1. <https://docs.gokite.ai/kite-agent-passport/service-provider-guide>

这意味着当前文档和环境变量里写的 `PYUSD`，需要为比赛主路径重新评估。

结论：

1. **如果目标是贴官方推荐标准，优先切到官方测试 token**
2. `PYUSD` 可以保留为 QuotaDEX 自定义模式的历史方案或后续模式

### 4.3 放款与退款逻辑

迁移后要接受一个现实：

1. facilitator 支付结算后，资金已经在 Gateway merchant wallet

所以：

1. `release` 不再是“从 Escrow 放款”
2. `refund` 不再是“从 Escrow 退款”

黑客松版本可以改成：

1. `complete`
   - 只更新 job 状态
   - 可选：记录“待结算给 seller”的内部事件

2. `fail`
   - 只更新 job 状态
   - 可选：记录“待退款给 buyer”的内部事件

如果要继续保留链上动作，也应改成：

1. Gateway merchant wallet 自己发二次转账
2. 但这已经不是 Escrow 模式

## 5. 推荐迁移方案

### 5.1 方案选择

推荐采用：

**方案 A：Current Demo Escrow + Future Facilitator**

定义：

1. 当前 demo 主支付路径继续使用 Escrow
2. Pieverse Facilitator 作为 Future Plan 保留并逐步完善
3. `complete/fail` 当前继续围绕 Escrow 主路线运行
4. 等访问条件具备后，再补官方支付验收

不推荐当前阶段采用：

**方案 B：在 demo 前强行把 Facilitator 提升为主路径**

原因：

1. 真实 `X-PAYMENT` 还不可得
2. 会把当前 demo 主线切到一个未完成 live validation 的方向
3. 讲解时会同时混入太多未验收条件

## 6. 代码层需要改什么

### 6.1 保留不动的部分

下面这些不需要推翻：

1. `POST /api/v1/jobs/quote`
2. `payment_id` 生成与 Redis quote context
3. `jobs` / `events` / `sellers` 数据模型
4. Seller worker
5. job 状态流转
6. 前端 Console 的整体流程

### 6.2 需要重构的部分

#### A. `quote` 返回格式

当前 `quote` 已返回：

1. `payment_id`
2. `amount`
3. `pay_to`
4. `currency`

迁移后应至少兼容 Kite 官方 `402` 结构里的关键字段：

1. `scheme`
2. `network`
3. `maxAmountRequired`
4. `asset`
5. `payTo`
6. `maxTimeoutSeconds`
7. `merchantName`

建议：

1. 保留当前字段，方便现有 Console 与内部脚本
2. 新增一层标准化 `accepts` 数组，兼容 x402 风格

#### B. `buyer-demo`

当前：

1. mock 模式直接造 `tx_hash`
2. chain 模式直接 `approve + deposit`

迁移后：

1. mock 模式继续保留
2. chain 模式不再直接调 Escrow
3. 改为模拟或接入 `X-PAYMENT` 获取逻辑

第一阶段可以先做：

1. `buyer-demo` 支持传入 `X-PAYMENT`
2. 先不强依赖完整 Purr / MCP 客户端

#### C. `verify`

当前：

1. mock 模式：校验 mock `tx_hash`
2. chain 模式：校验 Escrow deposit receipt

迁移后：

1. `verify` 读取 `X-PAYMENT`
2. 调 facilitator `/v2/verify`
3. 调 facilitator `/v2/settle`
4. settlement 成功后创建 job

也就是说：

1. `verifyEscrowDepositReceipt(...)` 不再是主路径
2. 将变成 legacy / fallback

#### D. `complete` / `fail`

当前：

1. `complete` 调 `Escrow.release`
2. `fail` 调 `Escrow.refund`

迁移后建议先改成：

1. `complete`
   - 只更新 `done`
   - 写 `SETTLEMENT_PENDING_TO_SELLER` 或类似事件

2. `fail`
   - 只更新 `failed`
   - 写 `REFUND_PENDING_TO_BUYER` 或类似事件

如果比赛必须展示退款，也可以做第二步：

1. Gateway merchant wallet 主动发 ERC-20 转账退款
2. 但这一步不建议在第一优先级里做复杂化

## 7. 需要新增的模块

建议新增：

1. `lib/chain/facilitator.ts`

职责：

1. 封装 `/v2/verify`
2. 封装 `/v2/settle`
3. 统一 facilitator error handling

建议新增环境变量：

1. `PIEVERSE_FACILITATOR_BASE_URL`
   - 默认 `https://facilitator.pieverse.io`

2. `KITE_PAYMENT_ASSET_ADDRESS`
   - 当前推荐填官方测试 token 地址

3. `GATEWAY_MERCHANT_WALLET`
   - 用于 `payTo`
   - 如果能从 `GATEWAY_PRIVATE_KEY` 推导，也可不单独存

## 8. 推荐的分步迁移顺序

### Step 1：先加 Facilitator helper

产出：

1. `lib/chain/facilitator.ts`
2. facilitator env 配置

### Step 2：改 `quote` 402 返回格式

产出：

1. 兼容 x402 的 `accepts` 结构
2. `payTo` 改为 merchant wallet
3. `asset` 改为 Kite 官方测试 token

### Step 3：改 `verify`

产出：

1. 接收 `X-PAYMENT`
2. 调 facilitator verify / settle
3. settlement 成功后创建 `paid` job

### Step 4：改 buyer 侧

产出：

1. `buyer-demo` 新支付模式
2. 为未来 `buyer-sdk` 打基础

### Step 5：降级 Escrow 依赖

产出：

1. `complete/fail` 不再依赖 Escrow 作为主路径
2. Escrow 标记为 legacy / experimental

### Step 6：重新跑 E2E

验收：

1. `402` 返回格式可对齐官方思路
2. `verify` 不再依赖 receipt
3. job 仍能顺利进入 `paid -> running -> done`

## 9. 对当前阶段计划的影响

这次迁移意味着：

1. Facilitator 不再阻塞当前 demo 主线
2. 当前阶段最优先的是 `Demo Hardening`

原因：

1. 当前主支付路线已经回到 Escrow
2. live validation 依赖外部访问条件
3. demo 前继续扩协议会稀释主循环表达

结论：

1. **先完成 Escrow 主路线 demo 打磨**
2. **再决定是否做 SDK**
3. **最后再回到 Facilitator Future Plan**

## 10. 一句话总结

如果目标是先做一个可验证、可重复演示、能快速讲清楚的 demo，那么当前最合理的做法是：

**继续以 Escrow 作为主支付路线，把 Facilitator 保留为 Future Integration Plan。**
