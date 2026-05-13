# QuotaDEX

> **Language / 语言:** [English](README.md) · 中文（当前）

**首个去中心化 AI 算力市场——为 Agent 而生，链上结算。**

QuotaDEX 是一个 Agent 对 Agent（A2A）的 AI 算力二级市场。任何 LLM 卖家都可以将闲置配额变现，任何自主 Agent 都可以按需购买算力——无需 API 密钥、无需合同、无需人工介入。每笔任务通过 HTTP 402 报价，使用 Kite Agent Passport/x402 付款，由 Kite AI 上的自定义 Escrow 合约担保，并在 Kite Testnet 以 Test USDT 结算。

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
| **Kite x402 托管** | Buyer 通过 Passport 授权 x402 支付到 Escrow 合约；任务完成后 Gateway 释放资金，失败则自动退款 |
| **A2A 结算** | Seller 通过 Supabase Realtime 接收任务、执行任务，回调触发链上结算 |

---

## 工作原理

```text
Buyer Agent                    Gateway (QuotaDEX)              Seller Agent
     │                               │                               │
     │──POST /jobs/quote────────────▶│                               │
     │◀──402 { payment_id, price }───│                               │
     │                               │                               │
     │  [Kite Passport approve]      │                               │
     │──POST /jobs/verify X-PAYMENT─▶│                               │
     │◀──200 { job_id }──────────────│                               │
     │                               │──Realtime 推送───────────────▶│
     │                               │◀─POST /jobs/:id/start─────────│
     │                               │◀─POST /jobs/:id/complete──────│
     │                               │  Escrow.release(payment_id)   │
     │◀──任务结果────────────────────│                               │
```

1. **报价** — Buyer 调用 `/jobs/quote`。Gateway 对请求进行指纹化，预留一个可用 Seller，将报价上下文缓存到 Redis，并以 `402` 返回价格和 `payment_id`。
2. **授权** — Buyer 使用 Kite Agent Passport 授权返回的 x402 `accepts[0]`，其中 `payTo` 必须是 Escrow 合约。
3. **验证** — Buyer 携带 `X-PAYMENT` 调用 `/jobs/verify`。Gateway 调 Pieverse verify/settle，确认 token Transfer 已进入 Escrow，再在合约中登记付款，创建正式的 `paid` 任务，将 Seller 状态改为 `busy`。
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
     │  Test USDT 支付      │
     └──────────────────────┘
```

**关键设计决策：**

- `payment_id` 与 `job_id` 刻意分离——支付身份在报价时确立，任务身份在验证时确立。
- MVP 中 `fingerprint` 复用为 `payment_id`，将精确的请求参数绑定到链上存款。
- Supabase 是所有正式状态转换的唯一真相来源。
- Redis 仅存储短生命周期的报价上下文（有 TTL 限制）。
- Seller 状态转换严格通过 Gateway API 进行，不允许客户端直接写入。
- Gateway 是受信 escrow executor：负责校验 x402 settlement receipt，并调用合约 release/refund。

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
  QuotaDEXEscrow.sol  # Solidity 合约：x402 register, release, refund
scripts/
  seller-worker.mjs   # 本地 Seller 演示（注册→监听→完成）
  buyer-demo.mjs      # 本地 Buyer 演示（报价→存款→验证→等待结果）
skills/
  quotadex-buyer/     # 英文 Buyer Agent workflow：Passport + x402
  quotadex-seller/    # 英文 Seller Agent workflow：Passport identity
docs/                 # 产品规格、MVP 规则、开发顺序、阶段追踪
```

---

## API 参考

### Seller 生命周期

| 方法   | 路径                           | 说明                              |
| ------ | ------------------------------ | --------------------------------- |
| `POST` | `/api/v1/sellers/register`     | 注册 Seller，指定能力与价格        |
| `POST` | `/api/v1/sellers/session`      | 用已验证的 Passport 身份换取短期 Gateway seller session |
| `POST` | `/api/v1/sellers/heartbeat`    | 将已认证 seller session 标记为 `idle` / online |
| `POST` | `/api/v1/sellers/offline`      | 将已认证 seller session 标记为下线 |

### 任务流程

| 方法   | 路径                           | 说明                                               |
| ------ | ------------------------------ | -------------------------------------------------- |
| `POST` | `/api/v1/jobs/quote`           | 获取报价；返回 `402`，含 x402 `accepts` 与 escrow 支付信息 |
| `POST` | `/api/v1/jobs/verify`          | 提交 `X-PAYMENT`；结算 x402、登记 escrow payment、创建已支付任务 |
| `GET`  | `/api/v1/jobs/:id`             | 轮询任务状态（Realtime 的降级方案）                 |
| `POST` | `/api/v1/jobs/:id/start`       | Seller 通知任务已开始                               |
| `POST` | `/api/v1/jobs/:id/complete`    | Seller 通知任务完成；触发 `Escrow.release`           |
| `POST` | `/api/v1/jobs/:id/fail`        | Seller 通知任务失败；触发 `Escrow.refund`            |

Seller 任务回调优先使用 Gateway seller session：先通过 `/api/v1/sellers/session`
验证 Passport JWT，再在 heartbeat、poll、start、complete、fail、offline 请求里携带
`Authorization: Bearer <seller_session_token>`。旧的 EVM `seller_signature`
仅作为开发兼容路径保留。

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
SELLER_SESSION_TTL_SECONDS=900          # Gateway seller session 有效期
ALLOW_SELLER_SIGNATURE_AUTH=false      # 仅本地 legacy EVM seller 签名使用

# Kite AI / 区块链
KITE_NETWORK=kite-testnet
KITE_CHAIN_ID=2368
KITE_RPC_URL=https://rpc-testnet.gokite.ai
KITE_EXPLORER_URL=https://testnet.kitescan.ai
ESCROW_CONTRACT_ADDRESS=                # 已部署的 QuotaDEXEscrow 合约地址
GATEWAY_PRIVATE_KEY=                    # Gateway 钱包私钥（不是合约私钥）

# Kite Passport identity verification for seller sessions
KITE_PASSPORT_ISSUER=https://passport.prod.gokite.ai
KITE_PASSPORT_JWKS_URL=https://passport.prod.gokite.ai/.well-known/jwks.json

# Payment asset / x402 facilitator
PIEVERSE_FACILITATOR_BASE_URL=https://facilitator.pieverse.io
KITE_PAYMENT_ASSET_ADDRESS=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63
PAYMENT_TOKEN_DECIMALS=18
PAYMENT_CURRENCY=USDT
ALLOW_MOCK_PAYMENTS=false

# 一键 Kite Testnet Demo。这些钱包只花费和接收测试网 USDT。
BUYER_PRIVATE_KEY=
DEMO_SELLER_PRIVATE_KEY=
DEMO_PRICE_PER_TASK=0.001
DEMO_RATE_LIMIT=3
```

> `GATEWAY_PRIVATE_KEY` 是 Gateway 控制的普通钱包私钥，不是合约地址的私钥。合约没有私钥。
> 公开 `/demo` 页面只会在服务端使用 `BUYER_PRIVATE_KEY` 和 `DEMO_SELLER_PRIVATE_KEY`，不要把它们暴露给浏览器。

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

# Agent workflow docs
cat skills/quotadex-buyer/SKILL.md
cat skills/quotadex-seller/SKILL.md
```

生产验证默认要求 `X-PAYMENT`。只有本地 demo 才应设置 `ALLOW_MOCK_PAYMENTS=true`。
生产 seller callback 默认要求 Gateway seller session token。只有本地 legacy EVM seller worker 才应设置 `ALLOW_SELLER_SIGNATURE_AUTH=true`。

---

## 当前状态

### 第八阶段 — Demo 强化

| 功能模块                                            | 状态          |
| --------------------------------------------------- | ------------- |
| Gateway 骨架（Next.js App Router）                  | 已完成        |
| Supabase Schema（sellers, jobs, events）            | 已完成        |
| Seller 生命周期（register / heartbeat / offline）   | 已完成        |
| Quote + 指纹 + Redis 缓存                           | 已完成        |
| Verify（Kite x402 + escrow registration）           | 已完成        |
| Seller Worker 脚本                                  | 已完成        |
| Buyer 演示脚本                                      | 已完成        |
| Kite 自定义 Escrow（x402 register / release / refund） | 已完成     |
| Mock E2E 端到端验证                                 | 已完成        |
| Buyer/Seller Passport Skills                        | 已完成        |

当前主要支付路线：**Kite x402 → QuotaDEXEscrow → Seller/Buyer**
本地降级方案：**只有显式开启时才允许 Mock payment**

---

## 路线图

- [x] Pieverse Facilitator 集成（`X-PAYMENT` header 流程）
- [x] Agent Passport（去中心化 Agent 身份 workflow）
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
- **Test USDT** — Kite Testnet 上当前使用的 escrow 支付 Token。
- **x402** — 用于机器原生支付协商的 HTTP 支付协议。
