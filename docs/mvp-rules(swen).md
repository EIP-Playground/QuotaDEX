# QuotaDEX MVP 接手规则（swen）

> 日期：2026-04-08
> 目的：作为当前仓库接手后的 MVP 实施边界与开发共识，优先保证 Happy Path 跑通，并为后续扩展保留清晰边界。

## 1. 总体目标

1. 当前阶段只做黑客松 MVP，优先跑通 Happy Path，不优先做完整开放平台能力。
2. 当前阶段的第一目标不是“全部功能完整”，而是“买方询价、付款验证、卖方执行、结果回传”闭环可演示。
3. 所有实现决策优先服从以下原则：
   - 简单可落地
   - 状态边界清晰
   - 后续可扩展

## 2. 核心架构角色

1. `Gateway` 是唯一可信协调中心。
2. `Gateway` 负责：
   - 卖家注册与状态管理
   - 买家询价与支付验证
   - 正式创建 job
   - 更新 job 状态
   - 记录 events
   - 后续触发 release / refund
3. `Supabase` 是唯一正式状态源。
4. `Supabase Realtime` 只负责通知，不负责承担核心业务权限。
5. `Redis` 只负责短期临时数据，不负责成为正式业务状态源。
6. `Seller Agent` 负责实际执行模型调用，不直接持有核心数据库的高权限写入能力。
7. `Buyer Agent` 负责发起请求、完成支付、等待结果。

## 3. 请求内容与支付标识

1. `quote` 阶段保留传完整 `buyer_id + capability + prompt`。
2. 当前 MVP 不做 `prompt hash` 优化。
3. `fingerprint` 用于标识一次请求内容摘要。
4. MVP 中直接复用 `fingerprint` 作为 `payment_id`。
5. `payment_id` 与 `job_id` 必须分离。
6. 支付阶段使用 `payment_id`。
7. 正式任务阶段使用数据库生成的 `job_id`。
8. `verify` 成功后，系统建立 `payment_id -> job_id` 的映射关系。

## 4. 支付路径规则

1. 当前文档中“直接 transfer 到托管地址”和“Escrow.deposit(...)”两种支付路径存在冲突，实施时必须统一。
2. MVP 的统一方向为：真实链上支付最终以 `Escrow.deposit(payment_id, seller, amount)` 为准。
3. 原因是合约必须知道：
   - 这笔资金对应哪个支付单
   - 对应哪个 seller
   - 金额是多少
4. 否则后续 release / refund 无法形成清晰闭环。
5. 在真实链上接通之前，`verify` 可以先走 Mock 验证，以便优先跑通主流程。

## 5. Seller 与 Gateway 的关系

1. `Gateway` 是平台后端。
2. `Seller` 是外部接单执行 worker。
3. `Seller` 与 `Gateway` 的关系是：
   - Seller 向 Gateway 注册
   - Seller 通过 Realtime 收到属于自己的 job 通知
   - Seller 通过 Gateway API 上报执行状态与结果
4. Seller 不直接写核心表，不直接承担状态流转的最终控制权。

## 6. Gateway API 规则

1. `Gateway API` 本质就是项目后端提供的 HTTP 接口。
2. 除 Buyer 使用的接口外，Seller 侧也应有最小上报接口。
3. Seller 侧最小接口集约定如下：
   - `POST /api/v1/jobs/:id/start`
   - `POST /api/v1/jobs/:id/complete`
   - `POST /api/v1/jobs/:id/fail`
4. Seller 收到 job 后：
   - 开始执行前调用 `start`
   - 成功执行后调用 `complete`
   - 执行失败时调用 `fail`
5. 由 Gateway 负责检查状态是否合法，再写入数据库。

## 7. 服务端与权限规则

1. “服务端”指项目后端运行的 API 逻辑，即 `Next.js app/api/...` 里的代码。
2. 服务端持有后台使用的高权限密钥。
3. 这些高权限仅用于 Gateway 的受控写入，不暴露给 Buyer / Seller。
4. 这里的“服务端权限”可以理解为：
   - 允许 Gateway 更新核心表
   - 允许 Gateway 写 events
   - 允许 Gateway 做支付核验后落库
5. Buyer / Seller 不持有数据库高权限密钥。
6. 这样可以避免客户端直接篡改 job 或 seller 状态。

## 8. Supabase 规则

1. `Supabase` 是唯一正式状态源。
2. 正式业务状态只以数据库为准。
3. `Supabase Realtime` 只承担通知能力。
4. Seller 使用 Realtime 只做“收通知”：
   - 收到属于自己的新 job
5. Buyer 使用 Realtime 只做“收结果”：
   - 监听某个 job 的状态更新
6. Realtime 不替代权限校验与状态流转校验。

## 9. Redis 规则

1. MVP 中 Redis 不负责 seller 锁。
2. MVP 中 Redis 不承担“卖家是否被占用”的正式状态表达。
3. Redis 只保留两类用途：
   - `quote -> verify` 之间的临时支付上下文缓存
   - 可选的短期重复提交去重
4. Redis 中推荐的最小 key 设计：
   - `quote:{payment_id}`
   - `verify:tx:{tx_hash}`
5. `quote:{payment_id}` 存放临时上下文。
6. “临时上下文”至少包括：
   - `payment_id`
   - `buyer_id`
   - `seller_id`
   - `capability`
   - `amount`
   - `currency`
   - `expires_at`
7. `verify:tx:{tx_hash}` 用于短期重复提交去重。
8. Redis 的数据都必须带 TTL。
9. 建议 TTL：
   - `quote:{payment_id}` 为 `300s`
   - `verify:tx:{tx_hash}` 为 `30s`

## 10. Seller 占位与状态规则

1. MVP 中 seller 占位不使用 Redis 锁。
2. seller 占位统一改为数据库原子更新。
3. 占位逻辑为：
   - 只有 `status = idle` 的 seller 才能被更新为 `reserved`
4. 谁成功把 seller 从 `idle` 改成 `reserved`，谁就成功占位。
5. 这一步的成功与否以数据库返回结果为准。
6. 这样可以避免 Redis 和数据库同时表达“seller 是否被占用”而产生双重真相问题。

## 11. 状态机规则

1. Seller 生命周期状态保持为：
   - `offline`
   - `idle`
   - `reserved`
   - `busy`
2. Job 生命周期状态保持为：
   - `paid`
   - `running`
   - `done`
   - `failed`
3. 卖家状态与 job 状态是两套不同状态机，不混用。
4. `verify` 成功后：
   - 创建 `job`
   - `job.status = paid`
   - `seller.status = busy`
5. Seller 开始执行后，job 进入 `running`。
6. Seller 成功完成后，job 进入 `done`。
7. Seller 执行失败后，job 进入 `failed`。

## 12. 超时规则

1. 不再保留冲突的 `reserved` 超时定义。
2. `reserved` 的超时规则只保留一个常量。
3. MVP 建议先统一使用 `30s`。
4. 所有实现都必须引用同一个常量，不允许 Redis、数据库逻辑、文档各自写不同值。

## 13. Seller 自检规则

1. 卖家在注册前只做一次本地自检。
2. 本地自检由 Seller SDK 在本地执行最小能力检查完成。
3. 最简单的方式是执行一次最小 `handler("hello")`。
4. 自检成功后再调用 `register`。
5. 自检失败则不允许注册上线。
6. 本地自检只说明“启动时可用”，不等于后续任务一定成功。
7. 运行期失败仍然允许发生，失败时按 `job -> failed` 处理。

## 14. 权限与接入范围

1. 当前阶段是“受控 demo”，不是开放 marketplace。
2. 默认只支持团队自己控制的 Seller worker。
3. 当前阶段不优先解决开放接入、多租户、复杂权限体系。
4. 所有高权限写入统一经由 Gateway。
5. 后续开放化能力在 MVP 跑通后再设计。

## 15. 第一阶段验收标准

1. 至少有一个 Seller 可以注册上线。
2. 至少有一个 Buyer 可以成功调用 `quote`。
3. `verify` 成功后可以创建正式 job。
4. Seller 可以收到属于自己的 job 并开始执行。
5. Seller 可以成功回传结果。
6. Buyer 可以收到最终结果。
7. 只要这条主链路跑通，就算 MVP 主干成立。

## 16. 建议开发顺序

1. 先搭项目骨架。
2. 再落 Supabase schema。
3. 再实现 Seller 注册、心跳、下线。
4. 再实现 `quote`。
5. 再实现 `verify` 的 Mock 版。
6. 再接 Seller Realtime worker。
7. 再补 Buyer 最小调用脚本。
8. 主链路跑通后，再接真实链上与托管合约。
9. 最后再做 Dashboard、超时处理、退款与稳定性打磨。

## 17. 当前实施原则

1. 不为了“理论最完美”而提高 MVP 实现复杂度。
2. 先保证边界清楚，再考虑高级优化。
3. 先保证主链路跑通，再考虑开放化、权限增强、动态定价、复杂容错。
4. 所有新实现都应优先检查是否符合本规则文档。
