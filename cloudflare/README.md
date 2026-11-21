# Cloudflare 免费采集器

网页保留在 GitHub Pages。使用免费 SQLite Durable Object 的持久化 alarm 每 15 秒执行一次采集；每次请求前先保存下一次闹钟，重启后继续。分钟 Cron 仅检查闹钟是否存在并尝试归档备份，不负责轮次交接。慢请求会跳过已错过的时隙，不并发追赶；网络、平台或数据库故障仍可能造成偏差，并非毫秒级保证。

## 数据与免费额度

- Worker 只解析公开榜单、计算变化并写入 D1；历史合并及重新计分在浏览器和备份任务执行，避免历史增长拖慢每次采集。
- 使用一个 SQLite Durable Object 调度，不使用付费 KV Durable Objects。免费 DO 每天包含 100,000 次请求及 13,000 GB-s；正常一天约 5,760 次 alarm，加分钟检查约 1,440 次。每次只处理一次榜单采集，并记录实际运行异常。
- 无变化只保存心跳；有变化才保存队伍增量。提交 ID、状态、耗时、名次、TBest 的变化都会触发记录。
- 每天正常约 5,760 次采样；心跳和变化事件合计通常不超过约 12,000 行写入，另有异常记录。D1 Free 的写入额度为每天 100,000 行；访问量和其他账号服务也会消耗共享免费额度。
- 429 不立即重试，尊重 Retry-After；其他失败指数退避，成功后恢复 15 秒。公开 `/api/head` 显示最后成功、下次尝试、错误及实际间隔，`/api/gaps` 显示最近 100 条异常 / 超过 30 秒的采集间隔。
- 所有 HTTP 接口只读，源站为固定公开 API，不需要 CANN 账号、Cookie 或 GitHub 写入凭据。
- `COLLECT_UNTIL` 当前为 2026-12-05 12:45（北京时间）；到期只停止自动采集，历史仍可读取。其他赛事需调整算子 ID 和此时间。

## 初次部署

1. 安装锁定版本开发依赖：`npm ci`；完成 Wrangler 登录。
2. `npx wrangler d1 create cann-ranking-data`，把返回的数据库 ID 填入 `cloudflare/wrangler.jsonc`。
3. `npx wrangler d1 execute cann-ranking-data --remote --file cloudflare/schema.sql --config cloudflare/wrangler.jsonc`。
4. 在 `monitor_head` 插入 id=1、baseline_version='initial'、baseline_url。URL 必须指向本仓库 `data` 分支**已验证的不可变提交**中的 latest.json，例如 `https://raw.githubusercontent.com/hblgzsx/cann-ranking-monitor/<commit-sha>/latest.json`；不得指向会移动的分支名。
5. `npx wrangler deploy --config cloudflare/wrangler.jsonc`。发布后核验数次心跳和实际间隔，检查 CPU / 调用错误指标。
6. 把成功部署的 HTTPS workers.dev 地址写入根目录 `data-source.json`，不带末尾斜杠，推送 main 发布网页。
7. 设仓库变量 `CANN_PRIMARY_COLLECTOR=cloudflare`，关闭 Actions 主采集任务，启用每 6 小时备份。手动执行一次 `backup.yml` 验证完整导出。

## 备份、归档与恢复

`scripts/backup-cloud.mjs` 从不可变基线重放完整 D1 增量，写入 `.state/latest.json` 和清单，然后 Actions 提交到 data 分支。每 6 小时的 GitHub 调度允许延迟；**它不参与 15 秒采集链路**。

Worker 每小时检查本仓库备份清单。只有清单的父版本、游标和计数符合当前数据库，且不可变 Git 提交中的备份文件可读取时，才切换基线并清理已归档事件。新游标后的事件不会清理。Git 旧提交仍保留归档历史；备份故障时保留 D1 事件并继续积累，不静默删掉未备份记录。

新浏览器从 GitHub 不可变备份恢复，再补拉增量；已有浏览器只拉新事件。遇到归档竞态保留当前数据，下轮自动重新加载基线。Cloudflare 暂不可访问时，网页仍可显示 GitHub 备用快照，但明确显示过期时间。

若长期换赛事使用，应定期检查 D1 空间、Git 仓库体积、备份工作流状态与免费额度，必要时导出迁移。免费服务不承诺永久额度不变或无故障；每 15 秒读取当前榜单仍无法恢复两次采样间被覆盖的中间提交。

官方限制：https://developers.cloudflare.com/workers/platform/limits/

官方 D1 计费：https://developers.cloudflare.com/d1/platform/pricing/
