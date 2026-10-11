# Hakimi · 单人节点中枢

托管在 **Cloudflare Workers + D1**（$0 服务器成本）的节点管理面板：

1. **管理节点配置**（vless/vmess/trojan/SS/hysteria2/tuic，含 Reality/WS/gRPC 传输层）
2. **给后端拉取**——soga / XrayR / V2bX / hysteria-v2board 等通过 Xboard 兼容 API 拉配置运行
3. **给客户端订阅**——`/s/{token}` 输出 Clash / sing-box / 通用 URI，按 UA 自动识别

架构与契约见 `PLAN.md`。

## 部署

```bash
npm install

# 1. 创建 D1 数据库，把返回的 database_id 填进 wrangler.toml
npx wrangler d1 create hakimi

# 2. 建表
npm run migrate          # 远程 D1（本地调试用 npm run migrate:local）

# 3. 本地跑
npm run dev              # http://127.0.0.1:8787

# 4. 上线
npm run deploy
```

打开面板 → 初始化设置管理密码（同时自动生成通信密钥）→ 建节点 → 建用户凭据 → 建订阅 → 复制订阅链接导入 Clash / sing-box / Shadowrocket。

> 没有自己的域名也能用 `https://<worker>.<account>.workers.dev`；有 Cloudflare zone 的话在 Workers 设置里绑自定义域。

## 通过 GitHub 自动部署

项目零构建、无 secrets 文件依赖，**不需要本地跑 wrangler**——`npm run deploy:ci` 会自动完成
「创建/复用 D1 → 写入 database_id → 建表 → 部署」全流程。二选一：

**方式 A · Cloudflare Git 集成（推荐，push 即部署）**

1. Cloudflare 控制台 → Workers & Pages → **Create application** → **Import a repository** → 授权 GitHub 并选中本仓库
2. **Worker 名字必须填 `hakimi`**（要与 `wrangler.toml` 的 `name` 一致，否则构建失败）
3. Deploy command 填 `npm run deploy:ci`（不要用默认的 `npx wrangler deploy`）
4. **换 API token**：Settings → Builds → API token → 创建自定义 token，权限需包含
   **Account / D1 / Edit**（外加 Workers Scripts Edit）。Cloudflare 默认自动生成的 token
   只有 Workers/KV/R2 权限、**没有 D1**，不换会导致建库/建表失败
5. Save and Deploy → 之后每次 push 自动部署

**方式 B · GitHub Actions（本仓库自带 `.github/workflows/deploy.yml`）**

1. 在仓库 Settings → Secrets and variables → Actions 配置：
   - `CLOUDFLARE_API_TOKEN`：自建 API Token（权限 Account / Workers Scripts / D1 / Edit）
   - `CLOUDFLARE_ACCOUNT_ID`：账户 ID（Workers & Pages 首页右侧可见）
2. push 到 `main` 自动执行：类型检查 → D1 准备/迁移 → 部署

> 面板里的管理密码、通信密钥、订阅 token 都存在 D1 中，**不需要**在 CI 里配置任何应用级密钥。
> 如果不想给构建 token D1 权限：先手动 `npx wrangler d1 create hakimi` 并把 `database_id`
> 提交进 `wrangler.toml`，再把 Deploy command 改回 `npx wrangler deploy` 即可。

## 节点后端对接

面板设置页的**通信密钥**即后端配置里的 `ApiKey`，`NodeID` 填节点的 `id` 或 `code`：

```yaml
# XrayR config.yml（NewV2board 模式 = UniProxy 族）
Nodes:
  - PanelType: "NewV2board"
    ApiConfig:
      ApiHost: "https://panel.example.com"
      ApiKey: "通信密钥"
      NodeID: 1
      NodeType: "V2ray"          # VLESS 加 EnableVless: true
```

```ini
# soga.conf（节选）
panel_type = xboard
api_host = https://panel.example.com
api_key  = 通信密钥
node_id  = 1
```

```yaml
# hysteria-v2board（节选）
v2board:
  apiHost: https://panel.example.com
  apiKey: 通信密钥
  nodeID: 1
```

### 兼容端点

| 端点 | 行为 |
|---|---|
| `GET /api/v1/server/UniProxy/config` | 实装：节点配置 + `base_config{push_interval,pull_interval}`，带 ETag/304 |
| `GET /api/v1/server/UniProxy/user` | 实装：凭据表 `{users:[{id,uuid,speed_limit,device_limit}]}` |
| `GET /api/v2/server/{config,user}` | 同上（v2 认证） |
| `GET /api/v1/server/TrojanTidalab/{config,user}` | 实装：trojan-go 风格配置 / trojan_user 凭据 |
| `GET /api/v1/server/ShadowsocksTidalab/user` | 实装：`{data:[{id,port,cipher,secret}]}` |
| `POST .../push|submit|alive|status|report` | 兼容收单（不落库），返回各端点要求的成功体 |
| `GET|POST /api/v2/server/handshake` | `{"websocket":{"enabled":false}}` |
| `GET .../alivelist` | `{"alive":{}}` |

订阅：`GET /s/{token}[?types=vless|trojan&filter=香港|IEPL&flag=clash|sing-box|shadowrocket|general]`

## 范围

不做监控/流量统计/测速（见 PLAN.md §2）。上报端点保留是为了后端不报错；以后想加统计往 `push` 处理里落库即可。

## 已知取舍

- SS2022 的密码派生用 SHA-256 替代 Xboard 的 MD5（WebCrypto 无 MD5）；config 下发的 `server_key` 与订阅密码两端由本面板生成，保持一致即可互通
- `handshake` 不提供 WS 长连接通道（`websocket.enabled=false`）
- 订阅二维码暂未实现，直接复制链接即可
