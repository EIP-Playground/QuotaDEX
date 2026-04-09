# QuotaDEX 阶段路径图（swen）

> 日期：2026-04-09
> 目的：提供一个一眼可读的开发阶段路径图，帮助团队成员和 AI 快速判断“现在在哪个 Phase、下一步做什么”。
> 配套文档：
> - `docs/mvp-rules(swen).md`
> - `docs/development-order(swen).md`

当前：`Phase 7 / Step 3` `接真实 receipt 校验`

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
[Phase 7 Real chain + Escrow | deposit / receipt / release / refund] NEXT
        |
        v
[Phase 8 SDK | buyer-sdk / seller-sdk / 封装流程]
        |
        v
[Phase 9 Dashboard + Stability | 事件流 / 超时 / 退款 / 重试]
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

### Phase 7：Real chain + Escrow

状态：`NEXT`

关键词：`Escrow` `deposit` `receipt` `release` `refund`

步骤进度：`2/5 done`

当前步骤：`Step 3` `接真实 receipt 校验`

步骤清单：

- `✓` Step 1: 实现 Escrow 合约
- `✓` Step 2: 接入 `deposit(payment_id, seller, amount)`
- `○` Step 3: 接真实 receipt 校验
- `○` Step 4: 接入 `release`
- `○` Step 5: 接入 `refund`

目标：

- 把 Mock 支付替换成真实链上流程

需要完成的事：

1. 接真实 receipt 校验
2. 接 release
3. 接 refund

### Phase 8：SDK

状态：`LATER`

关键词：`buyer-sdk` `seller-sdk` `封装` `复用` `接入库`

步骤进度：`0/2 done`

步骤清单：

- `○` Step 1: 提炼 `buyer-sdk`
- `○` Step 2: 提炼 `seller-sdk`

目标：

- 把已经跑通的流程提炼为 `buyer-sdk` 和 `seller-sdk`

注意：

- 这是工程化封装阶段
- 不是第一条主链路成立之前要做的事

### Phase 9：Dashboard + Stability

状态：`LATER`

关键词：`Dashboard` `events` `timeout` `refund` `retry`

步骤进度：`0/4 done`

步骤清单：

- `○` Step 1: Dashboard 事件流
- `○` Step 2: seller 状态展示
- `○` Step 3: 超时处理
- `○` Step 4: 退款与重试

目标：

- 加展示、监控和稳定性

需要完成的事：

1. Dashboard 事件流
2. seller 状态展示
3. 超时处理
4. 退款与重试

## 4. 现在最该做什么

如果你现在准备继续开发，默认动作就是：

1. 打开 `docs/mvp-rules(swen).md`
2. 打开 `docs/development-order(swen).md`
3. 按本文件进入 `Phase 7`
4. 优先实现真实 receipt 校验，再接 `release / refund`

## 5. 不该做什么

在 `Phase 7` 主链路跑通之前，不建议提前展开：

1. 完整 SDK 封装
2. Dashboard
3. 复杂权限体系
4. 复杂容错机制
5. 生产级合约治理、多签和审计扩展

原因：

- 这些都不是当前最短闭环的阻塞项

## 6. 一句话总结

当前仓库的位置是：

- 基础工程已搭完
- 数据层已落完
- Seller 生命周期已完成
- `quote` 已完成
- `verify(Mock)` 已完成
- `Seller worker` 已完成
- `Buyer demo` 已完成
- 下一步进入 `Real chain + Escrow`
