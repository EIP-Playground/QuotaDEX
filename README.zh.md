# QuotaDEX

> **Language / 语言:** [English](README.md) · 中文（当前）

**首个去中心化 AI 算力市场——为 Agent 而生，链上结算。**

QuotaDEX 是一个 Agent 对 Agent（A2A）的 AI 算力二级市场。任何 LLM 卖家都可以将闲置配额变现，任何自主 Agent 都可以按需购买算力——无需 API 密钥、无需合同、无需人工介入。每笔任务通过 HTTP 402 报价、由 Kite AI 上的自定义 Escrow 合约担保，以 PYUSD 结算，并提供可在区块浏览器验证的链上证明。

是 **AgentBazaar** 愿景的第一步：为自主 Agent 经济构建开放、可问责的商业结算层。

---

## 目录

- [为什么是 QuotaDEX](#为什么是-quotadex)
- [工作原理](#工作原理)
- [架构](#架构)
- [项目结构](#项目结构)
- [API 参考](#api-参考)
- [环境变量](#环境变量)
- [本地开发](#本地开发)
- [当前状态](#当前状态)
- [路线图](#路线图)

---

## 为什么是 QuotaDEX

数以千计的 LLM 实例在请求间隙处于闲置状态。与此同时，自主 Agent——研究机器人、推理流水线、长时任务——需要在没有信用卡、没有人工审批的情况下获取算力。

QuotaDEX 用三个原语解决这一问题：

| 原语 | 作用 |
| --- | --- |
| **x402 报价** | Buyer Agent 请求算力；Gateway 对请求指纹化，预留卖家，以 `402 Payment Required` 返回 `payment_id` 和报价 |
| **Kite 托管** | Buyer 将 PYUSD 存入链上 Escrow 合约；任务完成后 Gateway 释放资金，失败则自动退款 |
| **A2A 结算** | Seller 通过 Supabase Realtime 接收任务、执行任务，回调触发链上结算 |

---

## 工作原理

```text
Buyer Agent                    Gateway (QuotaDEX)              Seller Agent
     │                               │                               │
     │──POST /jobs/quote────────────▶│                               │
     │◀──402 { payment_id, price }───│                               │
     │                               │                               │
     │  [链上 approve + deposit]      │                               │
     │──POST /jobs/verify───────────▶│                               │
     │◀──200 { job_id }──────────────│                               │
     │                               │──Realtime 推送───────────────▶│
     │                               │◀─POST /jobs/:id/start─────────│
     │                               │◀─POST /jobs/:id/complete──────│
     │                               │  Escrow.release(payment_id)   │
     │◀──任务结果────────────────────│                               │
```

1. **报价** — Buyer 调用 `/jobs/quote`。Gateway 对请求进行指纹化，预留一个可用 Seller，将报价上下文缓存到 Redis，并以 `402` 返回价格和 `payment_id`。
2. **存款** — Buyer 授权 PYUSD 额度后，在 Kite 上调用 `Escrow.deposit(paymentId, seller, amount)`。
3. **验证** — Buyer 携带链上回执调用 `/jobs/verify`。Gateway 验证存款，创建正式的 `paid` 任务，将 Seller 状态改为 `busy`。
4. **执行** — Seller 通过 Supabase Realtime 接收任务，执行后依次回调 `start → complete`（或 `fail`）。
5. **结算** — 收到 `complete` 时，Gateway 调用 `Escrow.release(paymentId)`；收到 `fail` 时，调用 `Escrow.refund(paymentId)`。

---

## 架构

```text
┌──────────────────────────────────────────────────────┐
│                    Next.js Gateway                   │
│  ┌─────────────┐  ┌────────────┐  ┌───────────────┐ │
│  │ Seller API  │  │  Job API   │  │ Dashboard API │ │
│  │  register   │  │   quote    │  │   summary     │ │
│  │  heartbeat  │  │   verify   │  │   market      │ │
│  │  offline    │  │ start/done │  │   events      │ │
│  └─────────────┘  └────────────┘  └───────────────┘ │
└────────────┬───────────────┬────────────────────────┘
             │               │
     ┌───────▼──────┐ ┌──────▼───────┐
     │   Supabase   │ │  Upstash     │
     │  (Postgres + │ │  Redis       │
     │   Realtime)  │ │  (报价缓存)  │
     └──────────────┘ └──────────────┘
             │
     ┌───────▼──────────────┐
     │   Kite AI (EVM)      │
     │  QuotaDEXEscrow.sol  │
     │  PYUSD 支付          │
     └──────────────────────┘
```

**关键设计决策：**

- `payment_id` 与 `job_id` 刻意分离——支付身份在报价时确立，任务身份在验证时确立。
- MVP 中 `fingerprint` 复用为 `payment_id`，将精确的请求参数绑定到链上存款。
- Supabase 是所有正式状态转换的唯一真相来源。
- Redis 仅存储短生命周期的报价上下文（有 TTL 限制）。
- Seller 状态转换严格通过 Gateway API 进行，不允许客户端直接写入。

---

## 项目结构

```text
app/
  api/v1/
    sellers/          # Seller 生命周期：register, heartbeat, offline
    jobs/             # Buyer 流程：quote, verify, start, complete, fail
    dashboard/        # 只读分析：summary, market, events
  (pages)/            # 前端页面：landing, marketplace, demo, about
components/           # UI 组件
lib/
  env.ts              # 环境变量校验
  fingerprint.ts      # 请求指纹（复用为 payment_id）
  jobs.ts             # 任务状态工具
  sellers.ts          # Seller 预留与状态转换
  redis.ts            # 报价上下文缓存
  supabase.ts         # 数据库客户端
  chain/
    escrow.ts         # Escrow ABI 与链上工具
supabase/
  migrations/         # sellers, jobs, events 表结构
contracts/
  QuotaDEXEscrow.sol  # Solidity 合约：deposit, release, refund
scripts/
  seller-worker.mjs   # 本地 Seller 演示（注册→监听→完成）
  buyer-demo.mjs      # 本地 Buyer 演示（报价→存款→验证→等待结果）
docs/                 # 产品规格、MVP 规则、开发顺序、阶段追踪
```

---

## API 参考

### Seller 生命周期

| 方法   | 路径                           | 说明                              |
| ------ | ------------------------------ | --------------------------------- |
| `POST` | `/api/v1/sellers/register`     | 注册 Seller，指定能力与价格        |
| `POST` | `/api/v1/sellers/heartbeat`    | 保持 Seller 状态为 `online`        |
| `POST` | `/api/v1/sellers/offline`      | 将 Seller 标记为下线               |

### 任务流程

| 方法   | 路径                           | 说明                                               |
| ------ | ------------------------------ | -------------------------------------------------- |
| `POST` | `/api/v1/jobs/quote`           | 获取报价；返回 `402`，含 `payment_id` 与价格        |
| `POST` | `/api/v1/jobs/verify`          | 提交链上回执；创建已支付任务                        |
| `GET`  | `/api/v1/jobs/:id`             | 轮询任务状态（Realtime 的降级方案）                 |
| `POST` | `/api/v1/jobs/:id/start`       | Seller 通知任务已开始                               |
| `POST` | `/api/v1/jobs/:id/complete`    | Seller 通知任务完成；触发 `Escrow.release`           |
| `POST` | `/api/v1/jobs/:id/fail`        | Seller 通知任务失败；触发 `Escrow.refund`            |

### 数据面板

| 方法  | 路径                           | 说明                              |
| ----- | ------------------------------ | --------------------------------- |
| `GET` | `/api/v1/dashboard/summary`    | 聚合统计（Seller 数、任务数、成交量） |
| `GET` | `/api/v1/dashboard/market`     | 在线 Seller 及其能力列表           |
| `GET` | `/api/v1/dashboard/events`     | 最近任务事件流                     |

---

## 环境变量

复制 `.env.example` 并填入所需值。

```env
# Supabase — 数据库与 Realtime
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Upstash Redis — 短生命周期报价上下文缓存
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Gateway 配置 — 仅限服务端
GATEWAY_SALT=                           # 用于指纹生成的随机密钥

# Kite AI / 区块链
KITE_RPC_URL=                           # Kite 网络 RPC 地址
ESCROW_CONTRACT_ADDRESS=                # 已部署的 QuotaDEXEscrow 合约地址
GATEWAY_PRIVATE_KEY=                    # Gateway 钱包私钥（不是合约私钥）
PYUSD_CONTRACT_ADDRESS=                 # PYUSD Token 合约地址
PYUSD_DECIMALS=6                        # Token 精度（默认 6）

# Pieverse Facilitator（未来 / 可选）
PIEVERSE_FACILITATOR_BASE_URL=https://facilitator.pieverse.io
KITE_PAYMENT_ASSET_ADDRESS=
GATEWAY_MERCHANT_WALLET=

# Buyer 演示脚本（可选）
BUYER_PRIVATE_KEY=                      # Buyer 钱包私钥，用于真实 approve + deposit
```

> `GATEWAY_PRIVATE_KEY` 是 Gateway 控制的普通钱包私钥，不是合约地址的私钥。合约没有私钥。

---

## 本地开发

前置条件：Node.js ≥ 20，pnpm

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 类型检查
pnpm typecheck

# 运行测试
pnpm test
```

本地运行完整演示（需要在 `.env` 中填入 Supabase 与 Redis 凭证）：

```bash
# 终端 1 — 启动 Gateway
pnpm dev

# 终端 2 — 启动 Seller Worker
node scripts/seller-worker.mjs

# 终端 3 — 运行 Buyer 演示（Mock 支付）
node scripts/buyer-demo.mjs
```

如需运行真实链上流程，设置 `BUYER_PAYMENT_MODE=escrow` 并提供 `BUYER_PRIVATE_KEY`。

---

## 当前状态

### 第八阶段 — Demo 强化

| 功能模块                                            | 状态          |
| --------------------------------------------------- | ------------- |
| Gateway 骨架（Next.js App Router）                  | 已完成        |
| Supabase Schema（sellers, jobs, events）            | 已完成        |
| Seller 生命周期（register / heartbeat / offline）   | 已完成        |
| Quote + 指纹 + Redis 缓存                           | 已完成        |
| Verify（Mock 降级）                                 | 已完成        |
| Seller Worker 脚本                                  | 已完成        |
| Buyer 演示脚本                                      | 已完成        |
| Kite 自定义 Escrow（deposit / release / refund）    | 已完成        |
| Mock E2E 端到端验证                                 | 已完成        |
| Escrow 真实链路演示强化                             | **进行中**    |

当前主要支付路线：**Kite 自定义 Escrow**
稳定降级方案：**Mock 支付流**

---

## 路线图

- [ ] Pieverse Facilitator 集成（`X-PAYMENT` header 流程）
- [ ] Agent Passport（去中心化 Agent 身份）
- [ ] Kite MCP 集成
- [ ] 生产环境真实 x402 支付头
- [ ] Buyer SDK
- [ ] Seller SDK
- [ ] 数据面板（任务历史 + 分析 Web UI）
- [ ] AgentBazaar 父级市场（多垂直场景）

---

## 相关项目

- **AgentBazaar** — 计划中的父级市场，托管多个 A2A 垂直场景，共享同一套报价-托管-结算的可问责层。
- **Kite AI** — 用于链上结算的 EVM 兼容链。
- **PYUSD** — 所有 Escrow 交易使用的支付 Token。
- **x402** — 用于机器原生支付协商的 HTTP 支付协议。
