# QuotaDEX 开发顺序说明（swen）

> 日期：2026-04-08
> 目的：作为当前仓库的 MVP 开发顺序说明，帮助团队成员和 AI 在正式编码前先统一实施路径。
> 配套文档：`docs/mvp-rules(swen).md`

## 1. 先说清楚：这里的 SDK 是什么意思

1. `SDK` 就是 `Software Development Kit`。
2. 在这个项目里，SDK 更准确地说是“给买方 Agent 和卖方 Agent 接入平台用的代码工具包”。
3. 它不是平台本身，而是平台外面的接入层。
4. 这个项目里未来会有两类 SDK：
   - `buyer-sdk`
   - `seller-sdk`

### 1.1 buyer-sdk 是做什么的

`buyer-sdk` 未来负责封装买方侧流程，例如：

1. 调用 `quote`
2. 处理 `402 Payment Required`
3. 发起链上支付
4. 等待链上确认
5. 调用 `verify`
6. 订阅任务结果

它的作用是让买方 Agent 不需要自己重复写整套接入逻辑。

### 1.2 seller-sdk 是做什么的

`seller-sdk` 未来负责封装卖方侧流程，例如：

1. 本地自检
2. 注册上线
3. 定时心跳
4. 监听属于自己的新 job
5. 向 Gateway 上报 `start / complete / fail`
6. 调用本地模型 handler

它的作用是让卖方 Agent 不需要自己重复写整套接单逻辑。

### 1.3 为什么现在不先做 SDK

1. 现在仓库还没有网关主干代码。
2. 如果现在先做 SDK，本质上是在给一个还没稳定的协议提前封装壳子。
3. 这样很容易出现接口一改，SDK 跟着返工。
4. 所以 MVP 正确顺序是：
   - 先做网关和数据层
   - 先跑通最小闭环
   - 再把重复逻辑提炼成 SDK

结论：

1. `SDK` 是第二阶段的“工程化封装”
2. 不是第一阶段的“必须先做的基础设施”

## 2. 当前阶段真正的目标是什么

当前阶段的目标不是：

1. 合约全部完成
2. Dashboard 全部完成
3. SDK 全部完成
4. 开放第三方卖家接入

当前阶段真正目标是：

1. 有一个 Seller 能上线
2. 有一个 Buyer 能发起 `quote`
3. `verify` 成功后能创建 `job`
4. Seller 能收到 job 并执行
5. Buyer 能收到结果

只要这条主链路跑通，MVP 就成立。

## 3. 推荐开发顺序总览

推荐按下面顺序推进：

1. 项目骨架
2. 数据层
3. Seller 生命周期接口
4. `quote`
5. `verify` 的 Mock 版
6. Seller worker
7. Buyer 最小调用脚本
8. 真实链上与 Escrow 合约
9. Payment Migration to Pieverse Facilitator
10. SDK
11. Dashboard 与稳定性补充

这个顺序的核心原则是：

1. 先把主链路打通
2. 再做真实支付
3. 再做封装
4. 最后做展示和优化

## 4. Phase 0：项目骨架

### 目标

先把仓库从“文档仓库”变成“可开发仓库”。

### 需要完成的事

1. 初始化 `Next.js` 项目
2. 建立 `app/api/v1` 目录
3. 建立 `lib` 目录
4. 建立 `supabase/migrations` 目录
5. 建立基础环境变量管理
6. 建立 Supabase client
7. 建立 Redis client

### 推荐的第一批目录

```text
app/
  api/
    v1/
lib/
supabase/
  migrations/
scripts/
```

### 推荐的第一批文件

```text
app/api/v1/sellers/register/route.ts
app/api/v1/sellers/heartbeat/route.ts
app/api/v1/sellers/offline/route.ts
app/api/v1/jobs/quote/route.ts
app/api/v1/jobs/verify/route.ts
app/api/v1/jobs/[id]/route.ts
app/api/v1/jobs/[id]/start/route.ts
app/api/v1/jobs/[id]/complete/route.ts
app/api/v1/jobs/[id]/fail/route.ts
lib/env.ts
lib/errors.ts
lib/fingerprint.ts
lib/redis.ts
lib/supabase.ts
```

### 这一阶段完成标准

1. 项目可以启动
2. 基础目录清晰
3. 环境变量有统一读取方式
4. Supabase 和 Redis client 可以被代码正确引用

## 5. Phase 1：数据层

### 目标

先把正式状态源建立起来。

### 需要完成的事

1. 创建 `sellers` 表
2. 创建 `jobs` 表
3. 创建 `events` 表
4. 为 `jobs` 加上 `payment_id`
5. 为 `jobs.tx_hash` 加唯一约束
6. 明确 seller 和 job 的状态枚举

### 这一阶段必须满足的设计点

1. `Supabase` 是唯一正式状态源
2. `payment_id` 与 `job_id` 必须分离
3. `payment_id` 在 MVP 中直接复用 `fingerprint`
4. `job_id` 只在 `verify` 成功后创建

### 这一阶段完成标准

1. 数据表结构稳定
2. 可以手动插入 seller / job / event 记录
3. 代码层已经能正常读写这些表

## 6. Phase 2：Seller 生命周期接口

### 目标

先让平台里“有卖家可用”。

### 先做哪些接口

1. `POST /api/v1/sellers/register`
2. `POST /api/v1/sellers/heartbeat`
3. `POST /api/v1/sellers/offline`

### 规则

1. Seller 注册前先做一次本地自检
2. 本地自检成功后再调用 `register`
3. 当前阶段不做 Gateway 侧能力回调验证

### 这一阶段完成标准

1. Seller 能注册成功
2. Seller 状态能变成 `idle`
3. 心跳能更新时间
4. 主动下线能变成 `offline`

## 7. Phase 3：实现 quote

### 目标

让 Buyer 可以拿到一张有效的“待支付预订单”。

### `quote` 阶段要做的事

1. 校验 `buyer_id / capability / prompt`
2. 查找 `status = idle` 且能力匹配的 seller
3. 用数据库原子更新把 seller 从 `idle` 改成 `reserved`
4. 生成 `fingerprint`
5. 把临时支付上下文写入 Redis
6. 返回 `402 Payment Required`

### Redis 在这里做什么

Redis 只做两件事：

1. 存 `quote:{payment_id}` 这类短期临时上下文
2. 后续可选做短期去重

### 这一阶段完成标准

1. Buyer 能成功拿到 `402`
2. 返回结果里包含 `payment_id/fingerprint`
3. 没有可用 seller 时能返回 `503`
4. 两个 buyer 同时请求时，不会占用同一个 seller

## 8. Phase 4：实现 verify 的 Mock 版

### 目标

在不接真实链上的情况下，先把“支付后正式建单”跑通。

### `verify` 阶段要做的事

1. 重算 `fingerprint`
2. 查 Redis 里的 `quote:{payment_id}`
3. 校验临时上下文是否存在
4. Mock 校验 `tx_hash`
5. 创建 `job`
6. 建立 `payment_id -> job_id` 对应关系
7. 把 seller 改成 `busy`
8. 写 `events`
9. 删除 `quote:{payment_id}`
10. 返回 `job_id`

### 这一阶段完成标准

1. `verify` 成功后能创建正式 job
2. 同一个 `tx_hash` 不能重复使用
3. 错误的 `fingerprint` 会被拒绝
4. seller 状态能从 `reserved` 进入 `busy`

## 9. Phase 5：实现 Seller worker

### 目标

让 Seller 真正能接单和执行。

### 注意

这一阶段先做最小 worker，不先做完整 SDK。

### 最小 Seller worker 要做的事

1. 启动时做本地自检
2. 调用 `register`
3. 通过 Supabase Realtime 监听属于自己的新 job
4. 收到 job 后调用 `POST /api/v1/jobs/:id/start`
5. 执行本地 `handler`
6. 成功时调用 `POST /api/v1/jobs/:id/complete`
7. 失败时调用 `POST /api/v1/jobs/:id/fail`

### 这一阶段完成标准

1. 新 job 能被 Seller 收到
2. job 状态能从 `paid -> running -> done`
3. 失败时 job 能进入 `failed`

## 10. Phase 6：实现 Buyer 最小调用脚本

### 目标

把 Buyer 这一侧也简化成一个最小可跑脚本，先证明主链路闭环。

### 最小 Buyer 脚本要做的事

1. 调 `quote`
2. 模拟支付
3. 调 `verify`
4. 监听 job 更新
5. 收到结果后结束

### 为什么先做脚本，不先做 buyer-sdk

1. 这个阶段主要目标是验证链路，不是封装产品形态
2. 脚本更轻、更快、更容易调试
3. 等接口稳定后再抽成 SDK 更合理

### 这一阶段完成标准

1. 一次 Buyer 请求可以完整跑通主链路
2. Buyer 最终能拿到 Seller 返回的结果

## 11. Phase 7：自定义 Escrow 链上原型

### 目标

把前面的 Mock 支付扩展成一条可运行的自定义 Escrow 链上原型。

### 需要完成的事

1. 实现 Escrow 合约
2. 支付路径统一为 `deposit(payment_id, seller, amount)`
3. `verify` 改成真实 receipt 校验
4. 成功任务接入 `release`
5. 失败任务接入 `refund`

### 为什么这一步放后面

1. 真实链上是复杂度最高的一段
2. 如果前面的主链路还没通，就过早进入高复杂度区域
3. 先 Mock，后真链，是更稳的 MVP 节奏

### 这一阶段的定位

1. 这是自定义 Escrow 方案的链上原型
2. 它证明 QuotaDEX 能走通真实链上支付闭环
3. 但它不是当前黑客松主支付路线的最终标准答案

## 12. Phase 8：Payment Migration to Pieverse Facilitator

### 为什么要插入这一阶段

1. 当前黑客松主线已经从自定义 Escrow 原型转向 Kite 官方更推荐的支付路线
2. 如果现在直接提炼 SDK，很容易把旧支付路径封进 SDK，后面返工
3. 所以在 SDK 之前，先完成 facilitator 支付迁移更合理

### 这一阶段要做什么

1. 新增 facilitator helper
2. 调整 `quote` 的 x402 风格返回
3. 引入 facilitator 专用环境变量
4. 在 `verify` 中接入 facilitator `verify / settle`

### 这一阶段的本质

1. 不推翻现有主链路
2. 而是把比赛主支付路径切换到更贴近官方推荐的标准

## 13. Phase 9：再做 SDK

### 这一步到底是在做什么

当网关协议和主链路已经稳定后，再把重复流程提炼成可复用库。

### buyer-sdk 的目标

1. 封装 Buyer 的整套接入流程
2. 让外部 Buyer Agent 只需要少量调用代码

### seller-sdk 的目标

1. 封装 Seller 的整套接单流程
2. 让外部 Seller Agent 更容易接入

### 这一步的本质

1. 不是新增核心业务能力
2. 而是把已经验证过的流程产品化、可复用化

## 14. Future Plan：Agent Passport / Kite MCP Live Validation

### 为什么把它移出主线

1. 这一步依赖外部访问条件，不是仓库代码本身的问题
2. 当前缺少 Kite Portal invite / access，无法获取真实 `X-PAYMENT`
3. 如果继续把它挂在当前主线，会阻塞 SDK 与后续产品化工作

### 这一阶段以后再做什么

1. 获取 Kite Portal access
2. 准备可用的 MCP-capable client
3. 跑 `get_payer_addr`
4. 跑 `approve_payment`
5. 用真实 `X-PAYMENT` 补做 facilitator live validation

## 15. Phase 10：Dashboard 与稳定性补充

### 目标

在主链路跑通后，再补展示和稳定性。

### 可以在这一步做的事

1. Dashboard 实时事件流
2. seller 状态面板
3. 超时处理
4. 退款流程
5. 重试策略
6. 基础监控与日志完善

## 15. 当前最重要的里程碑

第一阶段最重要的 milestone 不是：

1. 合约部署成功
2. Dashboard 做出来
3. SDK 发布出来

第一阶段最重要的 milestone 是：

1. 有一个 Seller 在线
2. 有一个 Buyer 发起 `quote`
3. `verify` 成功后创建 `job`
4. Seller 收到任务并执行
5. Buyer 收到结果

只要这个闭环成立，项目就从“概念设计”进入“可运行原型”。

## 16. 给团队和 AI 的执行建议

1. 开发前先读 `docs/mvp-rules(swen).md`
2. 再读本文件，按阶段推进
3. 不要跳阶段开发
4. 不要在 facilitator 迁移完成前先做 SDK、Dashboard、复杂容错
5. 第一优先级永远是主链路闭环

## 17. 一句话总结

当前正确的开发路线是：

1. 先做网关和数据层
2. 再做 Seller 接单和 Buyer 调用
3. 先用 Mock 跑通支付闭环
4. 再接真实链上
5. 再把比赛主支付路径迁移到 Pieverse Facilitator
6. 最后再把流程封装成 SDK，并补 Dashboard 和稳定性
