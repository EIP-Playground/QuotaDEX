# PieBazaar - QuotaDEX 技术规格说明书 v3.0 (Final)

> **版本**: v3.0 — 整合 PRD v1.0/v2.0 + 技术 Spec v2.0 + 评审决策  
> **日期**: 2026-04-07  
> **定位**: 黑客松 MVP 的唯一权威技术规格文档，跑通 Happy Path

---

## 1. 产品概述

- **产品名称**：PieBazaar - QuotaDEX（派巴扎）
- **产品定位**：基于 API Gateway 模式构建的"闲置 AI 额度"交易撮合平台
- **核心愿景**：通过 Hybrid P2P 与无缝的微支付拦截，建立 Agent to Agent (A2A) 的算力二级市场
- **买方受众**：需要低门槛、按次调用高级大模型能力的 Agent 开发者
- **卖方受众**：拥有闲置大模型 API 额度，希望通过极简部署被动变现的用户

---

## 2. 系统架构与选型

PieBazaar 采用轻量化 Web2.5 混合架构，核心设计理念为：**人类旁观，机器交易**。

| 层级 | 选型 | 职责 |
|------|------|------|
| **API 网关** | Next.js (App Router) + Vercel Serverless | 无状态高并发路由与请求鉴权 |
| **高速缓存** | Upstash Redis | 指纹短期存储 (TTL)、卖方在线池、状态锁 |
| **持久化 + 实时通信** | Supabase Cloud (PostgreSQL + Realtime) | 订单落地、防双花、WebSocket 广播 |
| **价值结算** | Kite AI Network (EVM) | PYUSD 稳定币链上微支付 + 托管合约 |
| **端侧载体** | TypeScript/Node.js SDK | Buyer SDK + Seller SDK npm 包 |

### 2.1 Kite AI Chain 配置（已确认）

| 环境 | Chain Name | Chain ID | RPC URL | Explorer | Faucet |
|------|-----------|----------|---------|----------|--------|
| **Testnet** | KiteAI Testnet | `2368` | `https://rpc-testnet.gokite.ai` | `https://testnet.kitescan.ai` | `https://faucet.gokite.ai` |
| **Mainnet** | KiteAI Mainnet | `2366` | `https://rpc.gokite.ai` | `https://kitescan.ai` | — |

- **原生代币**: KITE（用于 Gas 费）
- **结算币种**: **PYUSD**（Kite 链原生稳定币，ERC-20，支持 EIP-3009 Gasless Transfer）
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

## 3. 核心业务流（七阶段协议）

### 流程概览

```
Buyer Agent                   Bazaar Gateway                    Escrow Contract               Seller Agent
    │                              │                                  │                           │
    │ 1. POST /quote               │                                  │                           │
    │─────────────────────────────►│                                  │                           │
    │                              │── 查 Redis/Supabase 匹配卖方 ──│                           │
    │       402 + fingerprint      │                                  │                           │
    │◄─────────────────────────────│                                  │                           │
    │                              │                                  │                           │
    │ 2. 链上: PYUSD.transfer()    │                                  │                           │
    │─────────────────────────────────────────────────────────────────►│                           │
    │  (等待 tx confirm)           │                                  │                           │
    │                              │                                  │                           │
    │ 3. POST /verify (tx已确认)   │                                  │                           │
    │─────────────────────────────►│                                  │                           │
    │                              │── RPC 校验 receipt ──────────────│                           │
    │                              │── INSERT job (防双花) ───────────│                           │
    │    { job_id, status: paid }  │                                  │                           │
    │◄─────────────────────────────│                                  │                           │
    │                              │                                  │                           │
    │                              │── Realtime INSERT 触发 ──────────────────────────────────────►│
    │                              │                                  │          4. UPDATE running │
    │                              │                                  │          5. 调用本地模型    │
    │                              │                                  │          6. UPDATE done    │
    │                              │◄──────────────────────────────────────────────────────────────│
    │                              │── 触发合约放款 ──────────────────►│                           │
    │                              │      PYUSD → Seller              │                           │
    │     7. Realtime: done        │                                  │                           │
    │◄─────────────────────────────│                                  │                           │
```

### 各阶段详解

**阶段一（发现与匹配）**：买方 Agent 向 Bazaar 发起能力查询，Bazaar 在 Supabase `sellers` 表中匹配状态为 `idle` 的卖方节点。

**阶段二（状态预留）**：匹配成功后，Bazaar 通过 Redis 原子锁将卖方状态从 `idle` → `reserved`（TTL 30s）。

**阶段三（拦截与 402）**：Bazaar 向买方返回 `HTTP 402 Payment Required`，附带收款托管合约地址、金额、指纹。

**阶段四（买方支付与客户端确认）**：买方 Agent 调用 PYUSD 合约向托管合约地址转账。**关键设计：买方 SDK 内部等待 `eth_getTransactionReceipt` 确认交易成功后，才提交 TxHash 到网关**，网关无需承担等待确认的延迟。

**阶段五（核销与派单）**：Bazaar 通过 RPC 二次校验 TxHash 的 receipt（收款方为托管合约地址、金额正确），INSERT job 到 Supabase（`tx_hash` UNIQUE 约束防双花），状态为 `paid`。

**阶段六（代跑）**：卖方通过 Supabase Realtime 监听到 `jobs` INSERT，将状态 UPDATE 为 `running`，调用本地大模型 API 生成结果，UPDATE 为 `done` 并回填 `result`。

**阶段七（交付与放款）**：买方通过 Realtime 订阅拿到 `done` 结果。Bazaar 后台确认 `done` 后触发托管合约放款到卖方钱包。

### 超时与容错（Happy Path 简化版）

| 状态 | TTL | 超时行为 |
|------|-----|---------|
| `reserved` | 60s | 自动回滚 → `idle`，Redis 释放锁 |
| `busy` / `running` | 120s（可配置） | 重试 3 次无响应 → job 标记 `failed`，触发托管合约退款 |

---

## 4. 资金流设计：托管合约

MVP 采用**平台托管合约**模式，而非买方直付卖方。

### 4.1 托管逻辑

```
1. 买方 → PYUSD 转账至 Escrow 合约 (附带 job 标识)
2. 卖方完成任务 → Bazaar 调用 Escrow.release(jobId, sellerAddr)
3. 卖方超时/失败 → 3 次重试无响应 → Bazaar 调用 Escrow.refund(jobId, buyerAddr)
```

### 4.2 合约接口（MVP 简化版）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PieBazaarEscrow {
    address public gateway;          // Bazaar 网关地址，拥有放款/退款权限
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
| `tx_hash` | VARCHAR | **UNIQUE** | 链上支付凭证，防双花核心约束 |
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
  "seller_id": "0xSeller..."
}
```

**错误: 无可用卖方 (503)**:
```json
{ "error": "No available seller", "code": "NO_SELLER_AVAILABLE" }
```

### 6.5 `POST /api/v1/jobs/verify` — 核销与派单

**请求**:
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

**网关逻辑 (强一致性校验)**:
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

## 7. Agent SDK 实现规范

### 7.1 Buyer Agent SDK 内部流转

```typescript
// @piebazaar/buyer-sdk
async function request(prompt: string, capability: string): Promise<JobResult> {
  // 1. 询价 → 拿到 402 + fingerprint + escrow info
  const quote = await fetch('/api/v1/jobs/quote', { body: { buyer_id, capability, prompt } });

  // 2. 链上付款: PYUSD.approve + Escrow.deposit（或直接 transfer to escrow）
  const tx = await walletClient.writeContract({
    address: PYUSD_CONTRACT,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [quote.pay_to, parseUnits(quote.amount, 18)],
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

### 7.2 Seller Agent SDK 内部流转

```typescript
// @piebazaar/seller-sdk — 无头常驻进程
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
| `PYUSD_CONTRACT_ADDRESS` | PYUSD 代币合约地址 | 需从 Kite 链浏览器获取 |
| `ESCROW_CONTRACT_ADDRESS` | PieBazaar 托管合约地址 | 部署后填入 |
| `GATEWAY_PRIVATE_KEY` | 网关 EOA 私钥（托管合约操作） | — |

---

## 10. 三周开发计划（4/7 — 4/27）

### Week 1 (4/7 – 4/13)：基建 + 核心网关 + 数据层

| 任务 | 产出 |
|------|------|
| 初始化 Next.js + Supabase + Upstash Redis | 项目骨架 |
| 创建 Supabase Schema (sellers + jobs + events) | 数据库就绪 |
| 实现 sellers/register + heartbeat + offline API | 卖方管理 |
| 实现 jobs/quote (发现 + 指纹 + 402) | 询价拦截 |
| 实现 jobs/verify (指纹 + Mock 链上 + 防双花) | 核销派单 |
| 实现 jobs/:id 查询 | Fallback 轮询 |
| cURL 端到端测试（Mock 链上） | 主干跑通 |

### Week 2 (4/14 – 4/20)：链上集成 + 托管合约 + SDK

| 任务 | 产出 |
|------|------|
| 编写 + 部署 PieBazaarEscrow 合约（Testnet） | 托管合约上线 |
| 实现链上 TxHash 校验（PYUSD Transfer log 解析） | verify 真实可用 |
| 开发 @piebazaar/buyer-sdk | npm 包 |
| 开发 @piebazaar/seller-sdk | npm 包 |
| 编写 Demo Buyer Agent + Demo Seller Agent | 示例 Agent |
| 端到端联调：真实链上 + 真实模型 | 联调通过 |

### Week 3 (4/21 – 4/27)：Dashboard + 打磨 + Demo

| 任务 | 产出 |
|------|------|
| Dashboard 实时事件流 (Supabase Realtime) | Web 大屏 |
| Seller 节点状态展示 + 统计数据 | 数据面板 |
| 超时/退款容错优化 | 稳定性 |
| 录制端到端演示视频 | Demo 视频 |
| README + 部署文档 | 交付文档 |

---

## 11. 已确认决策记录

| # | 决策项 | 结论 |
|---|--------|------|
| 1 | 结算币种 | Kite 链原生稳定币 **PYUSD** (ERC-20) |
| 2 | 资金流向 | **托管合约**：买方存入 Escrow → 完成放款 / 超时退款 |
| 3 | `sellers.status` 枚举 | `offline` \| `idle` \| `reserved` \| `busy` |
| 4 | `events` 表 | **保留**，Dashboard 专用事件总线 |
| 5 | 卖方通讯 | Supabase Realtime（Hackathon 连接数足够） |
| 6 | 能力验证 | 仅注册时做一次（Happy Path 假设诚信） |
| 7 | 链上确认策略 | **买方 SDK 侧 waitForReceipt**，网关侧仅二次校验 |
| 8 | Job 初始状态 | `paid`（INSERT 在链上确认后） |
| 9 | 存储选型 | Supabase PostgreSQL + Upstash Redis |
| 10 | Supabase 规模 | Hackathon Demo 不关注，上量再付费 |

---

## 12. 未来规划 (Post-Hackathon)

1. **TEE 隐私节点**: 卖方部署于 Purrfect Claw TEE 安全沙箱，输出加密执行证明
2. **Web3 仲裁与质押**: 乐观仲裁 + 智能合约保证金机制
3. **Chrome 扩展算力节点**: 让 ChatGPT Plus/Claude Pro 用户浏览器挂机接单
4. **动态 AMM 定价**: 闲置算力报价随供需自动浮动
5. **ChatOps 可观测**: Telegram/Discord Bot 实时推送 Agent 节点收益
6. **行业计费重塑**: 推动大模型厂商从 API Key 月结向 x402 微支付转型
7. **托管合约升级**: EOA → 多签 / DAO 治理
8. **卖方匹配策略**: 基于延迟、历史成功率的智能调度
