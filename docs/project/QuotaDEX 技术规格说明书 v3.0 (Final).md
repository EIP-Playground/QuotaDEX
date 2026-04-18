# QuotaDEX 技术规格说明书 v3.0 (Final)

> **版本**: v3.0 — 整合 PRD v1.0/v2.0 + 技术 Spec v2.0 + 评审决策  
> **日期**: 2026-04-07  
> **定位**: 黑客松 MVP 的唯一权威技术规格文档，跑通 Happy Path

---

## 0. 当前执行说明

这份规格书当前采用以下执行口径，作为阅读全篇时的最高优先级：

1. **当前主支付路线**：`Custom Escrow real-chain path`
2. **当前稳定 fallback**：`Mock payment flow`
3. **Future Plan**：`Pieverse Facilitator + Agent Passport + Kite MCP + real X-PAYMENT`
4. **当前主线目标**：把一个 `input -> payment trigger -> on-chain action -> result / receipt` 的 demo loop 打磨清楚，而不是继续扩协议分支
5. **SDK / Dashboard**：属于 demo 之后的产品化工作，不属于当前主线

说明：

- `Escrow` 不是临时占位，而是当前可演示、可反复验证、可提供链上 proof 的主路线
- `Mock` 保留，是为了保证本地和现场演示的稳定 fallback
- `Facilitator` 相关代码已经接入仓库，但 live validation 依赖外部访问条件，因此移入 Future Plan

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
| **价值结算** | Kite AI Network (EVM) | 当前主路线为 `Custom Escrow`，`Mock` 为稳定 fallback |
| **未来支付集成** | Pieverse Facilitator + Agent Passport | Future Plan：`X-PAYMENT`、`verify / settle`、live validation |
| **端侧载体** | TypeScript/Node.js Scripts / Future SDK | 当前以 buyer/seller 脚本为主，SDK 未来再产品化 |

### 2.1 Kite AI Chain 配置（已确认）

| 环境 | Chain Name | Chain ID | RPC URL | Explorer | Faucet |
|------|-----------|----------|---------|----------|--------|
| **Testnet** | KiteAI Testnet | `2368` | `https://rpc-testnet.gokite.ai` | `https://testnet.kitescan.ai` | `https://faucet.gokite.ai` |
| **Mainnet** | KiteAI Mainnet | `2366` | `https://rpc.gokite.ai` | `https://kitescan.ai` | — |

- **原生代币**: KITE（用于 Gas 费）
- **当前主路线结算币种**: **PYUSD**（用于 Escrow 主路线）
- **Future Plan 支付凭证**: `X-PAYMENT`（经 Agent Passport / Kite MCP / Facilitator live validation 后接入）
- **MVP 开发阶段使用 Testnet**

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

### 3.1 当前主支付路线：Custom Escrow

```
Buyer Agent                 QuotaDEX Gateway                  Escrow Contract               Seller Agent
    │                              │                                  │                           │
    │ 1. POST /quote               │                                  │                           │
    │─────────────────────────────►│                                  │                           │
    │                              │── 匹配 idle seller + reserved ─►│                           │
    │      402 + fingerprint       │                                  │                           │
    │◄─────────────────────────────│                                  │                           │
    │                              │                                  │                           │
    │ 2. approve + deposit         │                                  │                           │
    │─────────────────────────────────────────────────────────────────►│                           │
    │                              │                                  │                           │
    │ 3. POST /verify(tx_hash)     │                                  │                           │
    │─────────────────────────────►│                                  │                           │
    │                              │── RPC 校验 receipt ──────────────│                           │
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

### 3.2 当前稳定 fallback：Mock payment flow

当前 demo 允许保留一条稳定 fallback：

1. `quote`
2. mock `verify`
3. 创建 `paid` job
4. seller 执行
5. result + receipt

说明：

- 这条路径的作用是保证本地与现场演示稳定
- 它不是目标支付终局
- 但它是当前 demo 的稳定保险丝

### 3.3 Future Plan：Pieverse Facilitator live validation

仓库已经具备 Facilitator 代码路径：

1. `quote.accepts`
2. `verify + settle`
3. `buyer-demo` facilitator mode

但以下内容移入 Future Plan：

1. `Agent Passport`
2. `Kite MCP`
3. `approve_payment`
4. 真实 `X-PAYMENT`
5. facilitator live validation

### 3.4 超时与容错（Happy Path 简化版）

| 状态 | TTL | 超时行为 |
|------|-----|---------|
| `reserved` | 60s | 自动回滚 → `idle`，Redis 释放锁 |
| `busy` / `running` | 120s（可配置） | 重试 3 次无响应 → job 标记 `failed`，当前主路线下触发 Escrow 退款 |

---

## 4. 支付架构

当前仓库存在三层支付语义，必须明确区分：

### 4.1 Primary route：Custom Escrow

当前 demo 与主支付演示都围绕 Escrow：

1. 买方 `approve + deposit`
2. Gateway 用 `tx_hash` 做 receipt 校验
3. seller 完成后 `release`
4. seller 失败或超时后 `refund`

### 4.2 Stable fallback：Mock

保留 mock 的目的只有一个：

- 让 demo 可以稳定反复跑通

它不承担“真实支付标准”的叙事角色。

### 4.3 Future integration：Pieverse Facilitator

Facilitator 现在保留为 Future Plan：

1. 代码已接入
2. live validation 尚未完成
3. 它不阻塞当前 demo 主线

### 4.4 Escrow 合约接口（MVP 简化版）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract QuotaDEXEscrow {
    address public gateway;          // QuotaDEX 网关地址，拥有放款/退款权限
    IERC20  public paymentToken;     // PYUSD 合约

    enum JobState { Funded, Released, Refunded }

    struct Job {
        address buyer;
        address seller;
        uint256 amount;
        JobState state;
    }

    mapping(bytes32 => Job) public jobs; // jobId => Job

    modifier onlyGateway() { require(msg.sender == gateway); _; }

    constructor(address _gateway, address _paymentToken) {
        gateway = _gateway;
        paymentToken = IERC20(_paymentToken);
    }

    /// @notice 买方存款（需先 approve）
    function deposit(bytes32 jobId, address seller, uint256 amount) external {
        require(jobs[jobId].buyer == address(0), "Job exists");
        paymentToken.transferFrom(msg.sender, address(this), amount);
        jobs[jobId] = Job(msg.sender, seller, amount, JobState.Funded);
    }

    /// @notice 任务完成，网关放款给卖方
    function release(bytes32 jobId) external onlyGateway {
        Job storage job = jobs[jobId];
        require(job.state == JobState.Funded, "Not funded");
        job.state = JobState.Released;
        paymentToken.transfer(job.seller, job.amount);
    }

    /// @notice 任务失败/超时，网关退款给买方
    function refund(bytes32 jobId) external onlyGateway {
        Job storage job = jobs[jobId];
        require(job.state == JobState.Funded, "Not funded");
        job.state = JobState.Refunded;
        paymentToken.transfer(job.buyer, job.amount);
    }
}
```

> **Hackathon 简化说明**：MVP 中 `gateway` 为单一 EOA 地址，拥有完全的放款/退款权限。生产环境应升级为多签或 DAO 治理。

---

## 5. 数据库 Schema（Supabase PostgreSQL）

所有表均 **开启 Realtime**。

### 5.1 `sellers` 卖方状态池

| 字段 | 类型 | 属性 | 描述 |
|------|------|------|------|
| `id` | VARCHAR | PK | 卖方 Kite 钱包地址 |
| `capability` | VARCHAR | NOT NULL | 模型能力标签，如 `llama-3`, `gpt-4-vision` |
| `price_per_task` | DECIMAL | NOT NULL | 单次调用报价 (PYUSD) |
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
  "currency": "PYUSD",
  "seller_id": "0xSeller...",
  "accepts": []
}
```

说明：

- 当前主路线下，`pay_to` 指向 Escrow 合约地址
- `accepts` 为 Future Facilitator 集成预留，不作为当前主支付叙事核心

**错误: 无可用卖方 (503)**:
```json
{ "error": "No available seller", "code": "NO_SELLER_AVAILABLE" }
```

### 6.5 `POST /api/v1/jobs/verify` — 核销与派单

**请求（当前主路线）**:
```json
{
  "fingerprint": "8f4a2c...",
  "tx_hash": "0xabc123...",
  "payload": {
    "buyer_id": "0xBuyer...",
    "capability": "llama-3",
    "prompt": "Analyze this data..."
  }
}
```

**网关逻辑（当前 Escrow 主路线）**:
1. **防篡改**: 用 payload 重算指纹，对比传入的 fingerprint。不一致 → 403。
2. **Redis 校验**: `GET FP:{Fingerprint}`。不存在 → 403（过期或伪造）。
3. **链上查账**: 调用 `eth_getTransactionReceipt(tx_hash)`，校验:
   - `status == 1` (成功)
   - `to` 地址为托管合约
   - 解析 Transfer event log 确认 PYUSD 金额和收款方正确
4. **防双花落地**: `INSERT INTO jobs (..., tx_hash) VALUES (...)`。UNIQUE 冲突 → 409。
5. **清理缓存**: `DEL FP:{Fingerprint}`。
6. **更新卖方状态**: `reserved` → `busy`。
7. **写入 events**: `PAID`。

**Future Plan（Facilitator 路线）**：

- `verify` 也可以读取 `X-PAYMENT`
- Gateway 可调用 facilitator `verify / settle`
- 但这条 live validation 当前不属于主线验收项

**成功响应 (200)**:
```json
{ "job_id": "uuid-1234", "status": "paid" }
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

1. `scripts/buyer-demo.mjs`
2. `scripts/seller-worker.mjs`

这两者已经足够支撑 demo。  
正式 `buyer-sdk / seller-sdk` 不属于当前主线，留到 demo 之后再产品化。

### 7.1 当前 Buyer 接入脚本（Escrow 主路线）

```typescript
async function request(prompt: string, capability: string): Promise<JobResult> {
  // 1. 询价 → 拿到 402 + fingerprint + escrow info
  const quote = await fetch('/api/v1/jobs/quote', { body: { buyer_id, capability, prompt } });

  // 2. 先 approve，再调用 Escrow.deposit
  await walletClient.writeContract({
    address: PYUSD_CONTRACT,
    abi: erc20Abi,
    functionName: 'approve',
    args: [quote.pay_to, parseUnits(quote.amount, 18)],
  });
  const tx = await walletClient.writeContract({
    address: ESCROW_CONTRACT,
    abi: escrowAbi,
    functionName: 'deposit',
    args: [quote.payment_id, quote.seller_id, parseUnits(quote.amount, 18)],
  });

  // 3. 【关键】等待交易确认（买方侧承担等待）
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== 'success') throw new Error('Payment failed');

  // 4. 提交已确认的 TxHash → 核销
  const job = await fetch('/api/v1/jobs/verify', {
    body: { fingerprint: quote.fingerprint, tx_hash: tx, payload: { buyer_id, capability, prompt } },
  });

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

- 这段逻辑当前由 buyer script 承担
- 后续如需正式 `buyer-sdk`，再把这些步骤抽成可复用模块
- Facilitator 路线会作为 Future Plan 的可选 payment mode，而不是当前主线

### 7.2 当前 Seller 接入脚本

```typescript
// seller worker — 无头常驻进程
async function serve(capability: string, handler: (prompt: string) => Promise<string>) {
  // 1. 上线注册
  await fetch('/api/v1/sellers/register', { body: { seller_id, capability, price_per_task, wallet } });

  // 2. 心跳保活 (每 20s)
  setInterval(() => fetch('/api/v1/sellers/heartbeat', { body: { seller_id } }), 20_000);

  // 3. Realtime 监听新任务
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
💳 [14:23:05] Paid: 0.01 PYUSD 交易已确认 (0xabc...)
🚀 [14:23:06] Running: Seller 开始执行任务
🎉 [14:23:12] Done: 结果已交付
💰 [14:23:13] Released: 0.01 PYUSD 已放款给 Seller
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
| `KITE_RPC_URL` | Kite AI RPC 地址 | `https://rpc-testnet.gokite.ai` |
| `PYUSD_CONTRACT_ADDRESS` | Escrow 主路线使用的 PYUSD 合约地址 | 需从 Kite 链浏览器获取 |
| `ESCROW_CONTRACT_ADDRESS` | QuotaDEX 托管合约地址（当前主路线） | 部署后填入 |
| `GATEWAY_PRIVATE_KEY` | 网关 EOA 私钥（托管合约操作） | — |
| `PIEVERSE_FACILITATOR_BASE_URL` | Future Plan：Facilitator 地址 | `https://facilitator.pieverse.io` |
| `KITE_PAYMENT_ASSET_ADDRESS` | Future Plan：Facilitator 支付资产地址 | — |
| `GATEWAY_MERCHANT_WALLET` | Future Plan：Facilitator 收款地址 | — |

---

## 10. 当前阶段计划

### 已完成

| 阶段 | 结果 |
|------|------|
| 项目骨架 + 数据层 | Next.js / Supabase / Redis / migrations 就绪 |
| Seller 生命周期 | register / heartbeat / offline 已完成 |
| Buyer / Seller 脚本 | `buyer-demo` / `seller-worker` 已完成 |
| Mock 闭环 | `quote -> verify(mock) -> result` 已跑通 |
| Escrow 主路线 | `deposit / receipt / release / refund` 已实现 |
| Facilitator 代码接入 | 作为 Future Plan 保留在仓库中 |

### 当前主线：Demo Hardening

| 任务 | 产出 |
|------|------|
| 锁定支付叙事：`Escrow = primary` | 仓库口径统一 |
| 反复跑通 Escrow 主路线 | 稳定的 on-chain demo loop |
| 优化 receipt / status / result 展示 | 更清晰的演示界面 |
| 补 explorer proof | 可验证的链上展示 |
| 收紧 2 分钟 demo 讲述顺序 | 更易讲清的现场演示 |

### Future Plan

| 任务 | 产出 |
|------|------|
| Agent Passport / Kite MCP / real `X-PAYMENT` | Facilitator live validation |
| `buyer-sdk / seller-sdk` | 产品化接入层 |
| `Dashboard + Stability` | 后续产品化能力 |

---

## 11. 当前决策记录

| Topic | Current decision | Notes |
|------|------|------|
| Primary payment route | **Custom Escrow** | 当前 demo 主路线 |
| Stable fallback | **Mock payment flow** | 保证本地与现场演示稳定 |
| Future payment integration | **Pieverse Facilitator** | 代码已接入，live validation 进入 Future Plan |
| Settlement asset | **PYUSD** | 当前 Escrow 主路线结算币种 |
| Chain proof | **Escrow tx + explorer proof** | 当前最适合现场展示 |
| Seller comms | **Supabase Realtime + fallback polling** | 当前已实现 |
| `sellers.status` | `offline` \| `idle` \| `reserved` \| `busy` | 保持不变 |
| `events` table | **保留** | 供未来 Dashboard / 调试使用 |
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
