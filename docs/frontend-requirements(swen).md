# QuotaDEX 前端需求说明（swen）

> 日期：2026-04-10
> 目的：定义 QuotaDEX 当前业务前端页面的需求边界，并为未来接入 AgentBazaar Marketplace 预留清晰的信息架构。
> 适用范围：当前仓库的人类可见业务前端，不包含 SDK、合约、Gateway API 细节实现。

## 1. 产品关系与范围

### 1.1 产品关系

1. `AgentBazaar` 是未来的上位平台。
2. `AgentBazaar` 的定位是：一个用于展示 `Accountable Agent Commerce Layer` 的 `Agent Marketplace`。
3. `QuotaDEX` 是未来 `AgentBazaar` 中规划的第一个垂直服务。

### 1.2 当前前端要解决的问题

当前前端不是为了先做一个“完整开放 Marketplace”，而是为了先解决这三个问题：

1. 让人类用户能快速理解 `QuotaDEX` 是什么。
2. 让人类用户能从页面上看懂 `quote -> payment -> verify -> execution -> result` 这条链路。
3. 让团队可以用可视化页面演示当前已经跑通的主流程，而不只依赖脚本。

### 1.3 当前前端不做什么

当前前端不应提前承担以下目标：

1. 不做完整开放的 `AgentBazaar` 多产品商城系统。
2. 不做复杂账号体系、评论体系、购物车、订单中心。
3. 不做完整 Seller 自助后台。
4. 不做 CMS、运营后台、复杂增长组件。

## 2. 参考页面与借鉴方式

参考页面：

1. WooCommerce Marketplace 列表页：<https://woocommerce.com/products/>
2. 单产品详情页示例 `Pinterest for WooCommerce`：<https://woocommerce.com/products/pinterest-for-woocommerce/>

### 2.1 可以借鉴的结构

从 Marketplace 列表页，可以借鉴：

1. 用清晰的分类和内容分组组织产品，而不是一上来就只堆卡片。
2. 每个产品卡片都展示统一的核心摘要信息。
3. 首页先给“精选内容”和“分类入口”，再给完整产品浏览。

从单产品详情页，可以借鉴：

1. Hero 区域先说明“这个产品做什么”。
2. 右侧或首屏提供明确的主操作入口。
3. 用结构化区块承载：
   - 能力说明
   - 支持信息
   - 兼容性信息
   - FAQ
   - 相关推荐

### 2.2 不能直接照搬的地方

我们不是做传统插件商店，所以不应照搬以下逻辑：

1. `Buy now`
2. `Add to cart`
3. “按年订阅购买插件”的信息结构
4. 以评分和评论为主的信任体系

QuotaDEX / AgentBazaar 前端更适合替换成：

1. `Open App`
2. `Start Demo`
3. `Connect Wallet`
4. `View API`
5. `View Contract`
6. `View Live Events`

信任信号也应从“评分”改成更适合 Web3 + AI 的指标：

1. 支持链与结算币种
2. 托管合约状态
3. 当前在线 Seller 数
4. 平均响应时间
5. 成功率
6. 当前是否支持真实链上结算或仅支持 demo/mock

## 3. 前端信息架构

### 3.1 两层信息架构

前端应该按照两层来设计：

1. `AgentBazaar Marketplace` 层
   - 展示多个垂直产品
   - 当前只有 `QuotaDEX`
   - 未来可继续增加其他垂直服务

2. `QuotaDEX Product` 层
   - 展示 QuotaDEX 本身
   - 解释能力、流程、支付、演示入口
   - 承接 QuotaDEX 的业务操作台

### 3.2 推荐页面树

建议按下面的页面树设计：

```text
/
  AgentBazaar / QuotaDEX 入口页

/products
  AgentBazaar Marketplace 列表页

/products/quotadex
  QuotaDEX 产品详情页

/quotadex/console
  QuotaDEX 业务演示台

/quotadex/dashboard
  QuotaDEX 实时事件看板（后续）
```

### 3.3 当前仓库的落地策略

因为当前仓库还是 `QuotaDEX` 单产品仓库，所以可以先采用下面的短期策略：

1. 当前首页先作为 `QuotaDEX` 的产品入口页。
2. 页面文案中明确说明 `QuotaDEX` 属于未来 `AgentBazaar Marketplace`。
3. UI 结构预留未来 `Marketplace` 的入口和产品卡片样式。
4. 真正的 `/products` 多产品列表可以后续补，不要求当前一次性做完。

## 4. MVP 前端页面要求

当前建议优先做 3 个页面。

### 4.1 页面一：Marketplace 入口 / 产品列表页

页面目标：

1. 让用户理解 `AgentBazaar` 是什么。
2. 让用户看到 `QuotaDEX` 是第一个垂直产品。
3. 为未来更多产品预留统一展示方式。

页面内容要求：

1. 顶部 Hero
   - 一句话解释 `AgentBazaar`
   - 一句话说明 `QuotaDEX` 是第一个垂直服务
   - 一个主 CTA：进入 `QuotaDEX`

2. Marketplace 产品区
   - 至少展示 `QuotaDEX` 产品卡
   - 其他未来产品以 `Coming Soon` 形式占位即可

3. 产品卡片字段
   - 产品名
   - 一句话介绍
   - 类别标签
   - 当前状态：`Live Demo` / `Coming Soon`
   - 支持链
   - 支持结算币种
   - 主按钮：`Open Product`

4. 说明区
   - 什么是 `Accountable Agent Commerce Layer`
   - 为什么 `QuotaDEX` 是这个方向的第一个垂直服务

不需要做的事：

1. 不做复杂筛选器
2. 不做搜索建议
3. 不做评分评论
4. 不做电商式价格比较

### 4.2 页面二：QuotaDEX 产品详情页

页面目标：

1. 让用户看懂 `QuotaDEX` 到底解决什么问题。
2. 让用户理解 Buyer / Seller / Gateway / Escrow 的角色关系。
3. 给出明确的进入业务演示台入口。

页面内容结构建议：

1. Hero 区
   - 产品名：`QuotaDEX`
   - 一句话副标题
   - 状态徽标：`MVP` / `Live Demo`
   - 主按钮：`Open Console`
   - 次按钮：`View Docs` / `View Contract`

2. Product Snapshot 区
   - 结算链：Kite AI
   - 结算币种：PYUSD
   - 支付方式：Escrow
   - 交付方式：A2A + Realtime
   - 主要能力：二级 AI quota 撮合

3. What It Does 区
   - 买方提交能力请求
   - Gateway 返回 `402 Payment Required`
   - 买方付款后触发 `verify`
   - Seller 执行并回传结果
   - Gateway 放款或退款

4. Why It Matters 区
   - 闲置算力/额度可流动
   - 支付和交付有托管闭环
   - 状态可观测
   - 对 Agent 集成友好

5. Capability / Use Cases 区
   - 支持的模型或能力类型
   - 典型 Buyer 使用场景
   - 典型 Seller 使用场景

6. Trust / Settlement 区
   - Escrow 合约地址
   - 当前支持的支付模式
   - 是否支持真实链上
   - 风险提示和 MVP 限制

7. How It Works 区
   - 用 5 到 7 步的流程图或时间线说明
   - 不要求把所有底层实现细节暴露给用户

8. Developer / Integration 区
   - API / SDK / 文档入口
   - 当前支持：脚本 demo、Gateway API
   - 后续支持：正式 `buyer-sdk` / `seller-sdk`

9. Related Products 区
   - 当前先展示未来产品占位卡
   - 目的是保持未来 `AgentBazaar` 的信息架构一致

### 4.3 页面三：QuotaDEX Console

页面目标：

1. 作为当前最重要的演示页面。
2. 让人类用户不用直接跑命令，也能看懂核心流程。
3. 把当前已经跑通的后端链路可视化。

页面模块要求：

1. Buyer Request Panel
   - 输入 `buyer_id`
   - 输入 `capability`
   - 输入 `prompt`
   - 发起 `quote`

2. Payment Panel
   - 展示 `402` 返回内容
   - 展示 `payment_id`
   - 展示 `amount`
   - 展示 `pay_to`
   - 明确当前是 `mock` 还是 `real chain`

3. Verify / Job Panel
   - 展示 `job_id`
   - 展示 job 当前状态：`paid / running / done / failed`
   - 展示 seller id

4. Result Panel
   - 展示最终结果文本
   - 展示完成时间
   - 展示链路摘要

5. Event Timeline
   - 订阅并展示：
     - `MATCHING`
     - `LOCKED`
     - `PAID`
     - `RUNNING`
     - `DONE`
     - `RELEASED`
     - `FAILED`
     - `REFUNDED`

6. Seller Snapshot
   - 当前在线 Seller 数
   - 当前 seller 状态
   - 当前使用中的 seller

不需要做的事：

1. 不做复杂图表
2. 不做多租户权限界面
3. 不做完整钱包管理页

## 5. 关键组件要求

建议优先抽象这些组件，方便后续复用：

1. `ProductCard`
   - 用在未来 `AgentBazaar Marketplace`

2. `ProductHero`
   - 用在 `QuotaDEX` 详情页

3. `StatusBadge`
   - `Live Demo`
   - `MVP`
   - `Mock`
   - `Real Chain`
   - `Coming Soon`

4. `MetricPill`
   - 链
   - Token
   - Capability
   - Seller count
   - Success rate

5. `EventTimeline`
   - 未来 `Dashboard` 和 `Console` 都会复用

6. `FlowSteps`
   - 用于解释 `quote -> verify -> execution -> result`

## 6. 文案与交互要求

### 6.1 文案风格

文案要满足：

1. 第一屏先讲结果，不先讲实现细节。
2. 减少纯 Web3 黑话。
3. 把 `402 Payment Required` 解释成产品流程，而不是只展示 HTTP 术语。

### 6.2 CTA 设计

当前前端的主要 CTA 应该是：

1. `Open Product`
2. `Open Console`
3. `Start Demo`
4. `View Docs`
5. `View Contract`

不建议当前使用：

1. `Buy now`
2. `Add to cart`
3. `Subscribe`

### 6.3 状态表达

前端必须把这些状态对人类可视化：

1. `offline`
2. `idle`
3. `reserved`
4. `busy`
5. `paid`
6. `running`
7. `done`
8. `failed`

但显示时不要直接把数据库字段裸露出来，建议做成人类可读的标签。

## 7. Web3 和 AI 领域下的适配要求

相比 WooCommerce，这个项目有 4 个必须额外强调的点：

1. 钱不是直接买软件，而是为一次任务执行或一次配额使用付费。
2. 支付不是传统 checkout，而是钱包 + Escrow + receipt verification。
3. 交付不是下载插件，而是 `job result`。
4. 信任不是主要来自评论，而是来自：
   - 托管逻辑
   - 链上可验证性
   - 事件流可观测性
   - 卖方在线状态

因此前端要更强调：

1. `Payment mode`
2. `Execution status`
3. `Delivery result`
4. `Escrow protection`
5. `Live event trace`

## 8. MVP 验收标准

如果前端做到下面这些，就算满足当前阶段需要：

1. 用户进入页面后，5 秒内能理解：
   - `AgentBazaar` 是上位 Marketplace
   - `QuotaDEX` 是第一个垂直服务

2. 用户能从页面中找到明确入口：
   - 进入 `QuotaDEX`
   - 进入 `Console`
   - 查看文档

3. 用户在 `QuotaDEX` 详情页能看懂：
   - 做什么
   - 怎么付费
   - 怎么交付
   - 当前是不是 MVP

4. 用户在 `Console` 页能看见：
   - 请求输入
   - `402` 返回
   - `job` 状态变化
   - 最终结果

5. 当前页面结构未来能自然扩成 `AgentBazaar Marketplace`，而不用全部推翻。

## 9. 当前推荐实施顺序

前端建议按下面顺序做：

1. 先做 `QuotaDEX` 产品详情页
2. 再做 `QuotaDEX Console`
3. 再补 `AgentBazaar Marketplace` 列表页
4. 最后做 `Dashboard` 和更完整的数据面板

原因：

1. 当前仓库仍是单产品仓库
2. `QuotaDEX` 业务链路已经跑通，最值得先可视化
3. 真正的多产品 `AgentBazaar` 还没到需要优先落地的阶段

## 10. 一句话总结

当前前端的正确方向不是“先做一个复杂商城”，而是：

**先做一个能清晰解释 QuotaDEX、能演示链路、并且未来能自然接入 AgentBazaar Marketplace 的业务前端。**
