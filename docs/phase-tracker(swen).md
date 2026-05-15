# QuotaDEX 阶段路径图（swen）

> 日期：2026-04-09
> 目的：提供一个一眼可读的开发阶段路径图，帮助团队成员和 AI 快速判断“现在在哪个 Phase、下一步做什么”。
> 配套文档：
> - `docs/mvp-rules(swen).md`
> - `docs/development-order(swen).md`

> **2026-05-15 状态更新：** 这份阶段图记录的是早期开发路线。PR #4-#16 已完成 `Kite x402 + QuotaDEXEscrow`、Kite Passport Buyer/Seller workflows、seller bond session、network profiles、buyer capability discovery、direct escrow fallback、Live Dashboard、Kitescan audit links。当前权威状态请以 `README.md`、`README.zh.md` 与 `docs/hackathon-readiness.md` 为准。

当前：`Phase 9` `Hackathon demo ready`
剩余运营事项：`保持 Live Seller 在线 / 录制最终 demo video / 如展示主网则确认 mainnet escrow env`

最近验收：
- `quote -> X-PAYMENT/direct escrow verify -> escrow registration -> seller done -> release/refund proof`
- `Demo / Live Testnet / Live Mainnet dashboard profiles`
- `Buyer capability discovery + Seller Passport session renewal`

## 1. 路径图

```text
[Phase 0 项目骨架 | Next.js / app-api / lib / env]   DONE
        |
        v
[Phase 1 数据层 | sellers / jobs / events / migration]     DONE
        |
        v
[Phase 2 Seller 生命周期 | register / heartbeat / offline] DONE
        |
        v
[Phase 3 quote | 匹配卖家 / reserved / fingerprint / 402]      DONE
        |
        v
[Phase 4 verify(Mock) | 指纹校验 / tx mock / 建 job / busy]   DONE
        |
        v
[Phase 5 Seller worker | realtime / start / complete / fail]  DONE
        |
        v
[Phase 6 Buyer demo | quote / pay / verify / wait result]     DONE
        |
        v
[Phase 7 Custom Escrow real-chain primary route | deposit / receipt / release / refund] DONE
        |
        v
[Phase 8 Demo Hardening | escrow / fallback / receipt / explorer proof] DONE
        |
        v
[Phase 9 Hackathon Demo Ready | x402 / passport / dashboard / Kitescan proof] CURRENT
        |
        v
[Future Plan | Kite MCP / SDK / AgentBazaar]
```

## 2. 状态图例

- `DONE`：已经完成并进入仓库主分支
- `NEXT`：下一步优先级最高，应立即开始
- `LATER`：后续阶段，不应提前展开

## 3. 各阶段说明

### Phase 0：项目骨架

状态：`DONE`

关键词：`Next.js` `app/api` `lib` `env` `README`

步骤进度：`6/6 done`

步骤清单：

- `✓` 初始化 `Next.js` 项目
- `✓` 建立 `app/api/v1` 目录
- `✓` 建立 `lib` 目录
- `✓` 建立 `supabase/migrations` 目录
- `✓` 建立基础环境变量管理
- `✓` 建立 README 与项目入口说明

目标：

- 把仓库从纯文档仓库变成可开发的 Next.js 网关项目

已完成内容：

- `Next.js App Router` 项目壳
- `app/api/v1` 路由目录
- `lib` 共享库目录
- `supabase/migrations` 目录
- `.env.example`
- 基础 README 结构说明

### Phase 1：数据层

状态：`DONE`

关键词：`Supabase` `sellers` `jobs` `events` `migration`

步骤进度：`6/6 done`

步骤清单：

- `✓` 创建 `sellers` 表
- `✓` 创建 `jobs` 表
- `✓` 创建 `events` 表
- `✓` 为 `jobs` 加上 `payment_id`
- `✓` 为 `jobs.tx_hash` 加唯一约束
- `✓` 加入 Realtime publication 迁移逻辑

目标：

- 建立正式状态源

已完成内容：

- `sellers` 表
- `jobs` 表
- `events` 表
- `payment_id` 字段
- `tx_hash` 唯一约束
- Realtime publication 迁移脚本

### Phase 2：Seller 生命周期接口

状态：`DONE`

关键词：`register` `heartbeat` `offline` `校验` `seller state`

步骤进度：`4/4 done`

步骤清单：

- `✓` 实现 `POST /api/v1/sellers/register`
- `✓` 实现 `POST /api/v1/sellers/heartbeat`
- `✓` 实现 `POST /api/v1/sellers/offline`
- `✓` 接入 seller 请求体校验和错误返回

目标：

- 先让平台中“有卖家存在并可保活”

已完成内容：

- `POST /api/v1/sellers/register`
- `POST /api/v1/sellers/heartbeat`
- `POST /api/v1/sellers/offline`
- Seller 请求体校验
- Seller 相关错误返回

### Phase 3：quote

状态：`DONE`

关键词：`quote` `匹配卖家` `reserved` `fingerprint` `402`

步骤进度：`6/6 done`

步骤清单：

- `✓` Step 1: 校验 `buyer_id / capability / prompt`
- `✓` Step 2: 查找能力匹配且 `idle` 的 seller
- `✓` Step 3: 用数据库原子更新将 seller 置为 `reserved`
- `✓` Step 4: 生成 `fingerprint`
- `✓` Step 5: Redis 写入 `quote:{payment_id}`
- `✓` Step 6: 返回 `402 + payment_id + seller + amount`

目标：

- 让 Buyer 能拿到有效的 `402 Payment Required`

需要完成的事：

1. 校验 `buyer_id / capability / prompt`
2. 查找能力匹配且 `idle` 或已过期 `reserved` 的 seller
3. 用数据库原子更新将 seller 置为 `reserved`
4. 生成 `fingerprint`
5. Redis 写入 `quote:{payment_id}`
6. 返回 `402 + payment_id + seller + amount`

完成标准：

1. 正常请求可返回 `402`
2. 无 seller 时返回 `503`
3. 相同 seller 不会被并发重复占用

### Phase 4：verify(Mock)

状态：`DONE`

关键词：`verify` `fingerprint` `tx_hash` `payment_id` `job`

步骤进度：`6/6 done`

步骤清单：

- `✓` Step 1: 重算 `fingerprint`
- `✓` Step 2: 查 Redis 中的 quote 临时上下文
- `✓` Step 3: Mock 校验 `tx_hash`
- `✓` Step 4: 创建正式 `job`
- `✓` Step 5: 建立 `payment_id -> job_id` 映射
- `✓` Step 6: 将 seller 状态更新为 `busy`

目标：

- 在不接真实链上的情况下，把支付后正式建单跑通

需要完成的事：

1. 重算 `fingerprint`
2. 查 Redis 中的 quote 临时上下文
3. Mock 校验 `tx_hash`
4. 创建正式 `job`
5. 通过 `jobs.payment_id` 建立 `payment_id -> job_id` 映射
6. seller 状态变为 `busy`

### Phase 5：Seller worker

状态：`DONE`

关键词：`seller worker` `Realtime` `start` `complete` `fail`

步骤进度：`6/6 done`

步骤清单：

- `✓` Step 1: 启动前本地自检
- `✓` Step 2: 调用 `register`
- `✓` Step 3: 订阅属于自己的 job
- `✓` Step 4: 调用 `start`
- `✓` Step 5: 执行 handler
- `✓` Step 6: 调用 `complete` 或 `fail`

目标：

- 让 Seller 真正接单执行

需要完成的事：

1. 启动前本地自检
2. 注册上线
3. 心跳保活
4. 订阅属于自己的 job
5. 调 `start`
6. 执行 handler，并调 `complete` 或 `fail`

### Phase 6：Buyer demo script

状态：`DONE`

关键词：`buyer demo` `quote` `mock pay` `verify` `wait result`

步骤进度：`4/4 done`

步骤清单：

- `✓` Step 1: 调 `quote`
- `✓` Step 2: 模拟支付
- `✓` Step 3: 调 `verify`
- `✓` Step 4: 订阅并等待结果

目标：

- 让 Buyer 侧有一个最小闭环脚本

需要完成的事：

1. 调 `quote`
2. 模拟支付
3. 调 `verify`
4. 通过 Realtime + 轮询 Fallback 等待 job 结果

### Phase 7：Custom Escrow real-chain primary route

状态：`DONE`

关键词：`Escrow` `deposit` `receipt` `release` `refund`

步骤进度：`5/5 done`

步骤清单：

- `✓` Step 1: 实现 Escrow 合约
- `✓` Step 2: 接入 `deposit(payment_id, seller, amount)`
- `✓` Step 3: 接真实 receipt 校验
- `✓` Step 4: 接入 `release`
- `✓` Step 5: 接入 `refund`

目标：

- 做出一条基于自定义 Escrow 的真实链上支付原型

已完成内容：

1. `QuotaDEXEscrow.sol`
2. `X-PAYMENT -> facilitator verify/settle -> escrow registration`
3. `direct-escrow` fallback 真实 receipt 校验
4. `complete -> release`
5. `fail -> refund`

说明：

- 这一阶段完成的是当前对外演示可用的真实链上主支付路线
- 它会作为 demo 阶段的 primary route 保留
- `Mock` 继续作为稳定 fallback

### Phase 8：Demo Hardening

状态：`DONE`

关键词：`escrow` `fallback` `receipt` `explorer` `demo loop`

步骤进度：`4/4 done`

步骤清单：

- `✓` Step 1: 锁定主支付路线叙事为 `Kite x402 + QuotaDEXEscrow`
- `✓` Step 2: 跑通 escrow registration / release / refund proof
- `✓` Step 3: 收紧 Dashboard result / receipt / status 展示
- `✓` Step 4: 准备公开 `/demo` 与 `/marketplace` 演示路径

目标：

- 把当前可演示的 Escrow 主路线打磨成一个清晰、可验证、可反复演示的 demo loop，并补齐黑客松要求的公开 UI、Agent workflow 与 Kite attestations

Phase 8 后的最新验收结果：

- 生产 app 已公开部署到 Vercel
- `/demo` 可作为 Kite Testnet controlled E2E proof
- `/marketplace` 支持 Demo / Live Testnet / Live Mainnet profile
- Live Dashboard 展示真实 seller status、24h released volume、recent settlements，并链接 Kitescan
- Buyer/Seller Skills 覆盖 Passport/x402、seller bond、renewal token、foreground poll/process runtime loop

注意：

- `Kite x402 -> QuotaDEXEscrow` 是当前主支付路线
- `direct-escrow` 是 x402 受阻时显式开启的临时 fallback
- `Mock` 只作为本地开发 fallback
- 评审窗口需要保持目标 capability 的 Live Seller 在线，或使用 `/demo` 作为公开可复现 fallback

### Phase 9：Hackathon Demo Ready

状态：`CURRENT`

关键词：`x402` `Agent Passport` `seller bond` `Dashboard` `Kitescan`

待办：

- `✓` Buyer capability discovery
- `✓` Seller Passport session + bond renewal
- `✓` Production `X-PAYMENT` verify/settle into escrow
- `✓` Direct escrow fallback docs
- `✓` Live Dashboard + Kitescan links
- `○` 保持 Live Seller pool 在线
- `○` 录制最终 demo video
- `○` 视评审重点确认 Live Mainnet escrow env

说明：

- 这部分对应当前黑客松演示口径
- `docs/hackathon-readiness.md` 是评审对照表
- README 是公开复现入口

### Future Plan：Kite MCP / SDK / AgentBazaar

状态：`LATER`

关键词：`Kite MCP` `SDK` `AgentBazaar` `stability`

步骤进度：`0/4 done`

步骤清单：

- `○` Step 1: Kite MCP integration
- `○` Step 2: buyer-sdk / seller-sdk
- `○` Step 3: AgentBazaar parent marketplace
- `○` Step 4: production-grade governance / monitoring / policy hardening

目标：

- 从黑客松 demo 进入长期产品化

需要完成的事：

1. Kite MCP integration
2. SDK 产品化封装
3. 多垂直 marketplace
4. 生产治理、监控和策略加固

## 4. 现在最该做什么

如果你现在准备继续开发，默认动作就是：

1. 打开 `README.md` / `README.zh.md`
2. 打开 `docs/hackathon-readiness.md`
3. 确认 `/demo` 与 `/marketplace` 生产入口可访问
4. 如果要演示 Live Mainnet，先让目标 capability 的 Seller Agent 在线

## 5. 不该做什么

在当前黑客松演示阶段，不建议提前展开：

1. SDK 产品化封装
2. 复杂权限体系
3. 大范围 UI 重构
4. 复杂容错机制
5. 生产级合约治理、多签和审计扩展
6. 与演示主线无关的协议分支

原因：

- 这些都不是当前最短闭环的阻塞项

## 6. 一句话总结

当前仓库的位置是：

- 基础工程已搭完
- 数据层已落完
- Seller 生命周期已完成
- `quote` 已完成
- `verify(X-PAYMENT/direct escrow/mock)` 已完成
- `Seller worker` 已完成
- `Buyer demo` 已完成
- `Kite x402 + QuotaDEXEscrow` 主路线已完成
- Buyer/Seller Passport Skills 已完成
- Live Dashboard 与 Kitescan audit links 已完成
- 当前进入 `Hackathon Demo Ready`
