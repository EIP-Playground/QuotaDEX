# QuotaDEX 技术规格说明书 v3.0 (Final)

> **版本**: v3.0 — 整合 PRD v1.0/v2.0 + 技术 Spec v2.0 + 评审决策  
> **日期**: 2026-04-07  
> **定位**: 黑客松 MVP 的唯一权威技术规格文档，跑通 Happy Path

---

## 0. 当前执行说明

这份规格书当前采用以下执行口径，作为阅读全篇时的最高优先级：

> **2026-05-15 状态更新：** 本 v3.0 文档保留早期 MVP 规格和历史决策。PR #4-#16 已把支付、身份、Dashboard 与审计能力推进到新版主线。当前权威入口请以 `README.md`、`README.zh.md`、`docs/hackathon-readiness.md`、`skills/quotadex-buyer/SKILL.md` 和 `skills/quotadex-seller/SKILL.md` 为准。

1. **当前主支付路线**：`Kite x402 -> Pieverse verify/settle -> QuotaDEXEscrow registration -> release/refund`
2. **当前受控 fallback**：`direct-escrow tx_hash`，仅在 selected network profile 显式开启时可用
3. **本地稳定 fallback**：`Mock payment flow`，仅本地/开发显式开启
4. **当前主线目标**：展示 `AI Agent task -> paid action -> Kite escrow attestation -> result / receipt` 的可复现 demo loop
5. **已完成产品化能力**：Buyer capability discovery、Passport Seller session、seller bond renewal、Demo/Live network profiles、Live Dashboard、Kitescan audit links
6. **Future Plan**：`Kite MCP / Buyer SDK / Seller SDK / AgentBazaar parent marketplace`

说明：

- `Escrow` 不是临时占位，而是当前可演示、可反复验证、可提供链上 proof 的主路线
- `Mock` 保留，是为了保证本地开发稳定 fallback，不应作为生产评审路径
- `Facilitator` / `X-PAYMENT` 已经进入当前实现；direct escrow fallback 只用于 x402 被外部条件阻塞时的受控临时路径

---

## 1. 产品概述

- **产品名称**：QuotaDEX
- **所属平台**：AgentBazaar（规划中的 Agent Marketplace）
- **AgentBazaar 定位**：一个用于展示 Accountable Agent Commerce Layer 的 Agent Marketplace
- **产品定位**：基于 API Gateway 模式构建的"闲置 AI 额度"交易撮合平台
- **当前关系**：QuotaDEX 是未来 AgentBazaar 中规划的第一个垂直服务
- **核心愿景**：通过 Hybrid P2P 与无缝的微支付拦截，建立 Agent to Agent (A2A) 的算力二级市场
- **买方受众**：需要低门槛、按次调用高级大模型能力的 Agent 开发者
- **卖方受众**：拥有闲置大模型 API 额度，希望通过极简部署被动变现的用户

---

## 2. 系统架构与选型

QuotaDEX 采用轻量化 Web2.5 混合架构，核心设计理念为：**人类旁观，机器交易**。

| 层级 | 选型 | 职责 |
|------|------|------|
| **API 网关** | Next.js (App Router) + Vercel Serverless | 无状态高并发路由与请求鉴权 |
| **高速缓存** | Upstash Redis | 指纹短期存储 (TTL)、卖方在线池、状态锁 |
| **持久化 + 实时通信** | Supabase Cloud (PostgreSQL + Realtime) | 订单落地、防双花、WebSocket 广播 |
| **价值结算** | Kite AI Network (EVM) + QuotaDEXEscrow | 当前主路线为 `X-PAYMENT -> Pieverse verify/settle -> escrow registration -> release/refund` |
| **身份与 Agent workflow** | Kite Agent Passport + QuotaDEX Skills | Buyer 使用 Passport/x402；Seller 使用 Passport payer address + USDC bond + Gateway session |
| **端侧载体** | Agent Skills / TypeScript/Node.js Scripts / Future SDK | 当前公开可复现入口是 Buyer/Seller Skills，本地脚本用于开发 |
| **审计展示** | Dashboard + Kitescan | Demo/Live profile dashboard、seller status、recent settlements、Kitescan links |

### 2.1 Kite AI Chain 配置（已确认）

| 环境 | Chain Name | Chain ID | RPC URL | Explorer | Faucet |
|------|-----------|----------|---------|----------|--------|
| **Testnet** | KiteAI Testnet | `2368` | `https://rpc-testnet.gokite.ai` | `https://testnet.kitescan.ai` | `https://faucet.gokite.ai` |
| **Mainnet** | KiteAI Mainnet | `2366` | `https://rpc.gokite.ai` | `https://kitescan.ai` | — |

- **原生代币**: KITE（用于 Gas 费）
- **Demo Testnet 结算币种**: **Test USDT**（用于公开一键 demo）
- **Live Mainnet 结算币种**: **USDC.e / USDC**
- **生产支付凭证**: `X-PAYMENT`（Kite Passport / Pieverse facilitator）
- **Fallback**: `direct-escrow tx_hash` 仅在对应 network profile 显式开启时可用；`Mock` 仅本地开发使用

```typescript
import { defineChain, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const kiteAITestnet = defineChain({
  id: 2368,
  name: 'KiteAI Testnet',
  network: 'kite-ai-testnet',
  nativeCurrency: { name: 'KITE', symbol: 'KITE', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-testnet.gokite.ai'] } },
  blockExplorers: { default: { name: 'KiteScan', url: 'https://testnet.kitescan.ai' } },
});

export const kiteAIMainnet = defineChain({
  id: 2366,
  name: 'KiteAI Mainnet',
  network: 'kite-ai',
  nativeCurrency: { name: 'KITE', symbol: 'KITE', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.gokite.ai'] } },
  blockExplorers: { default: { name: 'KiteScan', url: 'https://kitescan.ai' } },
});

export const buyerWallet = createWalletClient({
  account: privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`),
  chain: kiteAITestnet, // MVP 使用 Testnet
  transport: http(),
});
```

---

## 3. 核心业务流

### 3.1 当前主支付路线：Kite x402 + QuotaDEXEscrow

```
Buyer Agent                 QuotaDEX Gateway                  Escrow Contract               Seller Agent
    │                              │                                  │                           │
    │ 0. GET /buyers/capabilities  │                                  │                           │
    │─────────────────────────────►│                                  │                           │
    │      exact capabilities      │                                  │                           │
    │◄─────────────────────────────│                                  │                           │
    │                              │                                  │                           │
    │ 1. POST /quote               │                                  │                           │
    │─────────────────────────────►│── 匹配 idle seller + reserved ─►│                           │
    │      402 + accepts[0]        │                                  │                           │
    │◄─────────────────────────────│                                  │                           │
    │                              │                                  │                           │
    │ 2. Passport approve x402     │                                  │                           │
    │ 3. POST /verify X-PAYMENT    │                                  │                           │
    │─────────────────────────────►│                                  │                           │
    │                              │── facilitator verify/settle ────►│ token transfer to escrow  │
    │                              │── registerFacilitatorPayment ───►│                           │
    │                              │── INSERT job(status=paid) ───────│                           │
    │      { job_id, paid }        │                                  │                           │
    │◄─────────────────────────────│                                  │                           │
    │                              │                                  │                           │
    │                              │── Realtime / poll 通知 job ────────────────────────────────►│
    │                              │                                  │          4. UPDATE running │
    │                              │                                  │          5. 执行 handler   │
    │                              │                                  │          6. UPDATE done    │
    │                              │◄──────────────────────────────────────────────────────────────│
    │                              │── Escrow.release() ─────────────►│                           │
    │     7. result + receipt      │                                  │                           │
    │◄─────────────────────────────│                                  │                           │
```

### 3.2 当前受控 fallback：direct escrow tx hash

当 x402 因外部 allowlist / discovery 条件临时不可用时，可按 network profile 显式开启 `direct-escrow`：

1. `quote`
2. Buyer 按 quote 返回的 `pay_to / asset / amount` 发送精确 token transfer
3. `/verify` 提交 `tx_hash`
4. Gateway 校验 receipt、登记 escrow payment、创建 `paid` job
5. seller 执行
6. `release/refund`

说明：

- 这条路径不是默认生产路径
- 必须由 `*_ALLOW_DIRECT_ESCROW_PAYMENTS=true` 显式开启
- Buyer Agent Skill 要求 operator 显式允许后才可使用

### 3.3 本地 fallback：Mock payment flow

本地开发仍允许保留 mock fallback：

1. `quote`
2. mock `verify`
3. 创建 `paid` job
4. seller 执行
5. result + receipt

说明：

- 只用于本地开发和故障隔离
- 生产环境默认 `ALLOW_MOCK_PAYMENTS=false`

### 3.4 Seller Session 与 Buyer Capability Discovery

新增生产 Agent 约束：

1. Buyer Agent 先调用 `/api/v1/buyers/capabilities?network_profile=live-mainnet` 或 `live-testnet`，只使用返回的精确 capability。
2. Seller 注册后默认 offline，必须通过 Passport payer address、seller bond challenge、`kpass wallet send` 和 `/api/v1/sellers/session` 换取 Gateway session。
3. Seller session 到期后，Returning Seller 使用 `seller_renewal_token` 续期；只有 wallet 或 agent id 改变时才重新支付 bond。
4. Seller callback 默认使用 `Authorization: Bearer <seller_session_token>`；legacy EVM signature 只作为开发 fallback。

### 3.5 超时与容错（Happy Path 简化版）

| 状态 | TTL | 超时行为 |
|------|-----|---------|
| `reserved` | 60s | 自动回滚 → `idle`，Redis 释放锁 |
| `busy` / `running` | 120s（可配置） | 重试 3 次无响应 → job 标记 `failed`，当前主路线下触发 Escrow 退款 |

---

## 4. 支付架构

当前仓库存在三层支付语义，必须明确区分：

### 4.1 Primary route：Kite x402 + Custom Escrow

当前生产主支付演示围绕 `X-PAYMENT` 与 Escrow：

1. Buyer Agent 获取 `quote.accepts[0]`
2. Buyer 使用 Kite Passport approve x402 payment
3. Gateway 用 `X-PAYMENT` 调 Pieverse verify/settle
4. Gateway 校验 settlement token transfer 已进入 `QuotaDEXEscrow`
5. Gateway 调 `registerFacilitatorPayment`
6. seller 完成后 `release`
7. seller 失败或超时后 `refund`

### 4.2 Guarded fallback：direct escrow

direct escrow fallback 的目的只有一个：

- 当 x402 暂时被外部条件阻塞时，允许 operator 明确授权 Buyer 发送精确 token transfer 到 escrow，并用 tx hash 完成 receipt verification

它不承担默认生产路径叙事角色，必须通过 profile-specific env 显式开启。

### 4.3 Local fallback：Mock

保留 mock 的目的只有一个：

- 让本地开发可以稳定反复跑通

它不承担“真实支付标准”的叙事角色，生产默认关闭。

### 4.4 Escrow 合约接口（当前实现）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract QuotaDEXEscrow {
    address public gateway;          // QuotaDEX 网关地址，拥有放款/退款权限
    IERC20  public paymentToken;     // profile payment token: Demo Test USDT / Live USDC.e
    uint256 public totalLiabilities; // registered funds still backing open payments

    enum PaymentStatus { Registered, Released, Refunded }

    struct Payment {
        address buyer;
        address seller;
        uint256 amount;
        bytes32 settlementTxHash;
        PaymentStatus status;
    }

    mapping(bytes32 => Payment) public payments; // paymentId => Payment

    modifier onlyGateway() { require(msg.sender == gateway); _; }

    constructor(address _gateway, address _paymentToken) {
        gateway = _gateway;
        paymentToken = IERC20(_paymentToken);
    }

    /// @notice Gateway registers a facilitator/direct escrow settlement already transferred into the contract
    function registerFacilitatorPayment(
        bytes32 paymentId,
        address buyer,
        address seller,
        uint256 amount,
        bytes32 settlementTxHash
    ) external onlyGateway {
        require(payments[paymentId].buyer == address(0), "Payment exists");
        require(paymentToken.balanceOf(address(this)) >= totalLiabilities + amount, "Insufficient escrow balance");
        payments[paymentId] = Payment(buyer, seller, amount, settlementTxHash, PaymentStatus.Registered);
        totalLiabilities += amount;
    }

    /// @notice 任务完成，网关放款给卖方
    function release(bytes32 paymentId) external onlyGateway {
        Payment storage payment = payments[paymentId];
        require(payment.status == PaymentStatus.Registered, "Not registered");
        payment.status = PaymentStatus.Released;
        totalLiabilities -= payment.amount;
        paymentToken.transfer(payment.seller, payment.amount);
    }

    /// @notice 任务失败/超时，网关退款给买方
    function refund(bytes32 paymentId) external onlyGateway {
        Payment storage payment = payments[paymentId];
        require(payment.status == PaymentStatus.Registered, "Not registered");
        payment.status = PaymentStatus.Refunded;
        totalLiabilities -= payment.amount;
        paymentToken.transfer(payment.buyer, payment.amount);
    }
}
```

> **Hackathon 简化说明**：当前 `gateway` 为单一 EOA 地址，拥有登记、放款、退款权限。生产环境应升级为多签或更严格的治理/监控策略。

---

## 5. 数据库 Schema（Supabase PostgreSQL）

所有表均 **开启 Realtime**。

### 5.1 `sellers` 卖方状态池

| 字段 | 类型 | 属性 | 描述 |
|------|------|------|------|
| `id` | VARCHAR | PK | 卖方 Kite 钱包地址 |
| `capability` | VARCHAR | NOT NULL | 模型能力标签，如 `llama-3`, `gpt-4-vision` |
| `price_per_task` | DECIMAL | NOT NULL | 单次调用报价（按 network profile currency：Demo Test USDT / Live USDC） |
| `status` | VARCHAR | DEFAULT `'offline'` | `offline` \| `idle` \| `reserved` \| `busy` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | 自动更新时间戳，用于探活 |

### 5.2 `jobs` 交易与任务全生命周期

| 字段 | 类型 | 属性 | 描述 |
|------|------|------|------|
| `id` | UUID | PK (自动生成) | 任务唯一 ID |
| `buyer_id` | VARCHAR | NOT NULL | 买方 Kite 钱包地址 |
| `seller_id` | VARCHAR | FK → sellers.id | 接收任务的卖方 ID |
| `tx_hash` | VARCHAR | UNIQUE, Nullable | 当前 Escrow 主路线下是链上支付凭证；Mock / Future Plan 下允许为空 |
| `payload` | JSONB | NOT NULL | `{ capability, prompt }` |
| `status` | VARCHAR | DEFAULT `'paid'` | `paid` \| `running` \| `done` \| `failed` |
| `result` | JSONB | Nullable | 卖方回传的生成结果 |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | — |

### 5.3 `events` 系统事件日志

> 保留此表。Dashboard 直接查询 events 表渲染实时事件流，避免在 jobs 表上做过重的 UI 逻辑。events 表作为专用的事件总线，记录每个 job 的关键节点便于 Dashboard 展示和调试。

| 字段 | 类型 | 属性 | 描述 |
|------|------|------|------|
| `id` | UUID | PK (自动生成) | — |
| `job_id` | UUID | FK → jobs.id, Nullable | 关联的任务 ID |
| `type` | VARCHAR | NOT NULL | `MATCHING` \| `LOCKED` \| `PAID` \| `RUNNING` \| `DONE` \| `FAILED` \| `REFUNDED` |
| `message` | TEXT | — | 可读的事件描述 |
| `timestamp` | TIMESTAMPTZ | DEFAULT `now()` | — |

---

## 6. 网关 API 契约

网关 (`/app/api/...`) 暴露无状态 RESTful 接口，全局统一错误格式：

```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### 6.1 `POST /api/v1/sellers/register` — 卖方注册

**请求**:
```json
{
  "seller_id": "0xSeller...",
  "capability": "llama-3",
  "price_per_task": "0.01",
  "wallet": "0xSeller..."
}
```

**网关逻辑**:
1. UPSERT 到 Supabase `sellers` 表，status 设为 `idle`。
2. 注册时发送一个简单测试 Prompt（如 `"hello"`），要求 10s 内返回非空响应，验证可用性。
3. 写入 events 表记录上线事件。

**成功响应 (200)**:
```json
{ "status": "registered", "seller_id": "0xSeller..." }
```

**失败响应 (422)**:
```json
{ "error": "Capability verification failed", "code": "VERIFICATION_FAILED" }
```

### 6.2 `POST /api/v1/sellers/heartbeat` — 卖方心跳

**请求**:
```json
{ "seller_id": "0xSeller..." }
```

**网关逻辑**: UPDATE `sellers.updated_at = now()`, 确保状态为 `idle`（若当前非 `busy`/`reserved`）。

**响应 (200)**:
```json
{ "status": "ok" }
```

### 6.3 `POST /api/v1/sellers/offline` — 卖方主动下线

**请求**:
```json
{ "seller_id": "0xSeller..." }
```

**网关逻辑**: UPDATE `sellers.status = 'offline'`。

**响应 (200)**:
```json
{ "status": "offline" }
```

### 6.4 `POST /api/v1/jobs/quote` — 发现与拦截

**请求**:
```json
{
  "buyer_id": "0xBuyer...",
  "capability": "llama-3",
  "prompt": "Analyze this data..."
}
```

**网关逻辑**:
1. 从 Supabase `sellers` 拉取 `capability` 匹配且 `status = 'idle'` 的节点（取第一个匹配的，MVP 不做高级调度）。
2. 生成指纹: `Fingerprint = SHA256(buyer_id + capability + prompt + GATEWAY_SALT)`。
3. Redis 原子锁: `SET seller:{seller_id}:lock 1 NX EX 30` → 卖方状态 → `reserved`。
4. Redis 缓存: `SET FP:{Fingerprint} "{seller_id, price}" EX 300`。
5. 写入 events: `MATCHING`。

**响应 (402 Payment Required)**:
```json
{
  "error": "Payment Required",
  "fingerprint": "8f4a2c...",
  "pay_to": "0xEscrowContract...",
  "amount": "0.01",
  "currency": "USDC",
  "network_profile": "live-mainnet",
  "seller_id": "0xSeller...",
  "accepts": [{ "scheme": "exact", "network": "kite-mainnet" }]
}
```

说明：

- 当前主路线下，`pay_to` 指向 Escrow 合约地址
- `accepts[0]` 是 Buyer Passport approve x402 payment 的输入

**错误: 无可用卖方 (503)**:
```json
{ "error": "No available seller", "code": "NO_SELLER_AVAILABLE", "details": { "capabilities_url": "https://quota-dex.vercel.app/api/v1/buyers/capabilities?network_profile=live-mainnet" } }
```

### 6.5 `POST /api/v1/jobs/verify` — 核销与派单

**请求（当前主路线）**:
```json
{
  "fingerprint": "8f4a2c...",
  "payload": {
    "buyer_id": "0xBuyer...",
    "capability": "llama-3",
    "prompt": "Analyze this data..."
  }
}
```

**网关逻辑（当前 x402 Escrow 主路线）**:
1. **防篡改**: 用 payload 重算指纹，对比传入的 fingerprint。不一致 → 403。
2. **Redis 校验**: `GET FP:{Fingerprint}`。不存在 → 403（过期或伪造）。
3. **x402 校验**: 读取 `X-PAYMENT`，调用 Pieverse facilitator `verify / settle`。
4. **链上查账**: 校验 settlement Transfer event 已把精确 token amount 打到当前 profile 的 Escrow 合约。
5. **Escrow 登记**: 调 `registerFacilitatorPayment(paymentId, buyer, seller, amount, settlementTxHash)`。
6. **防双花落地**: 创建 `settling/paid` job；重复 payment 或 tx hash → 409。
7. **清理缓存**: `DEL FP:{Fingerprint}`。
8. **更新卖方状态**: `reserved` → `busy`。
9. **写入 events**: `PAID`。

**direct-escrow fallback**：

- 只有对应 profile 显式开启时，`verify` 才接受 `tx_hash`
- receipt 校验与 escrow registration 路径和 x402 settlement 一致
- Buyer Skill 要求 operator 明确允许后才可使用

**成功响应 (200)**:
```json
{ "job_id": "uuid-1234", "status": "paid", "payment_mode": "x402-escrow", "settlement_tx_hash": "0x...", "escrow_registration_tx_hash": "0x..." }
```

### 6.6 `GET /api/v1/jobs/:id` — Job 查询（轮询 Fallback）

**响应 (200)**:
```json
{
  "job_id": "uuid-1234",
  "status": "done",
  "result": { "text": "..." }
}
```

> 主要用于 Realtime 断线时的 Fallback 轮询，或外部系统查询。

### 6.7 错误码汇总

| HTTP | Code | 含义 |
|------|------|------|
| 402 | `PAYMENT_REQUIRED` | 请先付款 |
| 403 | `FINGERPRINT_INVALID` | 指纹不匹配或过期 |
| 409 | `TX_ALREADY_USED` | TxHash 已被使用（防双花） |
| 422 | `VERIFICATION_FAILED` | 卖方能力验证失败 |
| 503 | `NO_SELLER_AVAILABLE` | 无可用卖方 |

---

## 7. Buyer / Seller 接入层说明

当前仓库已经有：

1. `skills/quotadex-buyer/SKILL.md`
2. `skills/quotadex-seller/SKILL.md`
3. `scripts/buyer-demo.mjs`
4. `scripts/seller-worker.mjs`

Agent Skills 是公开、可复现的黑客松 Buyer/Seller workflow；本地 scripts 用于受控开发。
正式 `buyer-sdk / seller-sdk` 不属于当前主线，留到 demo 之后再产品化。

### 7.1 当前 Buyer Agent workflow（x402 Escrow 主路线）

```typescript
async function request(prompt: string, capability: string): Promise<JobResult> {
  // 1. 能力发现 → 只使用 exact live capability
  const inventory = await (await fetch('/api/v1/buyers/capabilities?network_profile=live-mainnet')).json();
  if (!inventory.capabilities.some((item) => item.capability === capability)) {
    throw new Error('NO_SELLER_AVAILABLE');
  }

  // 2. 询价 → 拿到 402 + fingerprint + accepts[0] + escrow info
  const quote = await (await fetch('/api/v1/jobs/quote', {
    body: { buyer_id, capability, prompt, network_profile: 'live-mainnet' },
  })).json();

  // 3. Kite Passport approve x402 payment，得到 X-PAYMENT header
  const xPayment = await passport.approvePayment(quote.accepts[0]);

  // 4. 提交 X-PAYMENT → facilitator settle + escrow registration
  const job = await (await fetch('/api/v1/jobs/verify', {
    headers: { 'X-PAYMENT': xPayment },
    body: { fingerprint: quote.fingerprint, payload: { buyer_id, capability, prompt } },
  })).json();

  // 5. Supabase Realtime 订阅结果
  return new Promise((resolve) => {
    supabase.channel('job').on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'jobs',
      filter: `id=eq.${job.job_id}`,
    }, (payload) => {
      if (payload.new.status === 'done') resolve(payload.new.result);
    }).subscribe();
  });
}
```

说明：

- 这段逻辑当前由 Buyer Skill 规范化，`buyer-demo` 仅用于本地受控开发
- 后续如需正式 `buyer-sdk`，再把这些步骤抽成可复用模块
- direct escrow fallback 只在 x402 受阻且 operator 显式允许时使用

### 7.2 当前 Seller Agent workflow

```typescript
// seller worker — 无头常驻进程
async function serve(capability: string, handler: (prompt: string) => Promise<string>) {
  // 1. 注册为 offline
  await fetch('/api/v1/sellers/register', { body: { seller_id, capability, price_per_task, wallet } });

  // 2. Passport payer address + seller bond challenge -> Gateway seller session
  const challenge = await fetch('/api/v1/sellers/session/challenge', { body: { seller_id, capability } });
  const txHash = await kpass.wallet.send(challenge.kpass_command);
  const session = await fetch('/api/v1/sellers/session', { body: { seller_id, tx_hash: txHash } });

  // 3. 心跳保活 (每 20s)
  setInterval(() => fetch('/api/v1/sellers/heartbeat', {
    headers: { Authorization: `Bearer ${session.seller_session_token}` },
    body: { seller_id },
  }), 20_000);

  // 4. Realtime 监听新任务，polling 作为 fallback
  supabase.channel('seller-jobs').on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'jobs',
    filter: `seller_id=eq.${seller_id}`,
  }, async (payload) => {
    const job = payload.new;
    // 4. 锁定为 running
    await supabase.from('jobs').update({ status: 'running' }).eq('id', job.id);
    try {
      // 5. 调用本地模型
      const result = await handler(job.payload.prompt);
      // 6. 回传结果
      await supabase.from('jobs').update({ status: 'done', result: { text: result } }).eq('id', job.id);
    } catch (e) {
      await supabase.from('jobs').update({ status: 'failed' }).eq('id', job.id);
    }
  }).subscribe();
}
```

说明：

- 这段逻辑当前由 seller worker script 承担
- 正式 `seller-sdk` 留到 demo 之后再产品化

---

## 8. Dashboard 可视化控制台

### 8.1 技术方案

- 作为 Next.js App Router 的一部分，与网关同项目部署
- 前端通过 `@supabase/supabase-js` 订阅 `events` 表的 Realtime INSERT
- 展示全局事件流 + sellers 在线状态

### 8.2 事件流展示

```
🔍 [14:23:01] Matching: Buyer 0x12... 寻找 llama-3 能力
🔒 [14:23:01] Locked: Seller 0x34... 已锁定
💳 [14:23:05] Paid: 0.01 USDC 交易已确认 (0xabc...)
🚀 [14:23:06] Running: Seller 开始执行任务
🎉 [14:23:12] Done: 结果已交付
💰 [14:23:13] Released: 0.01 USDC 已放款给 Seller
```

---

## 9. 环境变量清单

| 变量名 | 描述 | 示例 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名 Key | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端 Key（仅后端） | — |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | — |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis Token | — |
| `GATEWAY_SALT` | 指纹哈希的盐值 | 随机 32 字节 hex |
| `GATEWAY_PUBLIC_BASE_URL` | Gateway 对外 URL，用于 x402 resource / capabilities URL | `https://quota-dex.vercel.app` |
| `KITE_RPC_URL` | Kite AI RPC 地址 | `https://rpc-testnet.gokite.ai` |
| `KITE_PAYMENT_ASSET_ADDRESS` | Demo Testnet payment token | Test USDT |
| `ESCROW_CONTRACT_ADDRESS` | Demo Testnet QuotaDEXEscrow 地址 | 部署后填入 |
| `LIVE_MAINNET_PAYMENT_ASSET_ADDRESS` | Live Mainnet payment token | USDC.e |
| `LIVE_MAINNET_ESCROW_CONTRACT_ADDRESS` | Live Mainnet QuotaDEXEscrow 地址 | 部署后填入 |
| `GATEWAY_PRIVATE_KEY` | 网关 EOA 私钥（托管合约操作） | — |
| `PIEVERSE_FACILITATOR_BASE_URL` | Facilitator verify/settle 地址 | `https://facilitator.pieverse.io` |
| `SELLER_SESSION_TTL_SECONDS` | Gateway seller session 有效期 | `900` |
| `SELLER_BOND_AMOUNT` | Seller wallet-proof bond 基础金额 | `0.01` |
| `ALLOW_DIRECT_ESCROW_PAYMENTS` / profile-specific variants | direct escrow fallback 开关 | 默认 `false` |

---

## 10. 当前阶段计划

### 已完成

| 阶段 | 结果 |
|------|------|
| 项目骨架 + 数据层 | Next.js / Supabase / Redis / migrations 就绪 |
| Seller 生命周期 | register / heartbeat / offline 已完成 |
| Buyer / Seller 脚本 | `buyer-demo` / `seller-worker` 已完成 |
| Mock 闭环 | `quote -> verify(mock) -> result` 已跑通 |
| Kite x402 Escrow 主路线 | `X-PAYMENT / settlement receipt / escrow registration / release / refund` 已实现 |
| Agent Passport Skills | Buyer/Seller 公开 workflow 已实现 |
| Seller bond session | challenge / renewal token / heartbeat / callback auth 已实现 |
| Buyer capability discovery | `/api/v1/buyers/capabilities` 已实现 |
| Live Dashboard | Demo/Live profiles、seller status、settlements、Kitescan links 已实现 |

### 当前主线：Hackathon Demo Ready

| 任务 | 产出 |
|------|------|
| 保持公开 `/demo` 可用 | Kite Testnet E2E settlement proof |
| 保持 Live Seller 在线 | Live Mainnet Agent demo 可购买目标 capability |
| 展示 Kitescan 链接 | Seller address / settlement tx 可审计 |
| 准备 2 分钟 demo 讲述顺序 | 更易讲清的现场演示 |
| 录制最终 demo video | 提升评审可复现性 |

### Future Plan

| 任务 | 产出 |
|------|------|
| Kite MCP | 官方工具链集成 |
| `buyer-sdk / seller-sdk` | 产品化接入层 |
| AgentBazaar parent marketplace | 多垂直产品化能力 |
| Governance / monitoring | 生产级稳定性 |

---

## 11. 当前决策记录

| Topic | Current decision | Notes |
|------|------|------|
| Primary payment route | **Kite x402 + QuotaDEXEscrow** | 当前 demo/production 主路线 |
| Guarded fallback | **direct-escrow tx_hash** | x402 受阻时显式开启 |
| Local fallback | **Mock payment flow** | 仅本地开发 |
| Settlement asset | **Demo Test USDT / Live USDC.e** | 按 network profile 区分 |
| Chain proof | **Escrow registration / release / refund + Kitescan links** | 当前最适合现场展示 |
| Seller comms | **Supabase Realtime + fallback polling** | 当前已实现 |
| `sellers.status` | `offline` \| `idle` \| `reserved` \| `busy` | 保持不变 |
| `events` table | **保留** | 供 Dashboard / 调试使用 |
| SDK | **Post-demo productization** | 当前不进入主线 |

---

## 12. 未来规划 (Post-Demo / Post-Hackathon)

1. **TEE 隐私节点**: 卖方部署于 Purrfect Claw TEE 安全沙箱，输出加密执行证明
2. **Web3 仲裁与质押**: 乐观仲裁 + 智能合约保证金机制
3. **Chrome 扩展算力节点**: 让 ChatGPT Plus/Claude Pro 用户浏览器挂机接单
4. **动态 AMM 定价**: 闲置算力报价随供需自动浮动
5. **ChatOps 可观测**: Telegram/Discord Bot 实时推送 Agent 节点收益
6. **行业计费重塑**: 推动大模型厂商从 API Key 月结向 x402 微支付转型
7. **托管合约升级**: EOA → 多签 / DAO 治理
8. **卖方匹配策略**: 基于延迟、历史成功率的智能调度
