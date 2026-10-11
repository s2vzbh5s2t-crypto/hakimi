<div align="center">

# Hakimi

**单人节点中枢** · 管理节点配置、给后端下发、给客户端订阅

一个托管在 **Cloudflare Workers + D1** 上的节点管理面板——服务器成本 **$0**，push 即部署。

</div>

---

## 这是什么

Hakimi 是一个轻量级节点管理面板，充当你的**代理节点中枢（Control Plane）**：

```
                    ┌─────────────────────────────┐
                    │        Hakimi（中枢）         │
                    │   Cloudflare Workers + D1    │
                    │  节点配置 · 用户凭据 · 订阅     │
                    └──────┬──────────────┬────────┘
           订阅链接          │              │  后端 API（Xboard 兼容）
                            │              │
            ┌───────────────┴──┐    ┌──────┴──────────────────┐
            │  你（浏览器/客户端）│    │  节点 × N（VPS/家里机器）  │
            │  Clash / sing-box │    │  soga · XrayR · V2bX     │
            │  / Shadowrocket   │    │  （填 ApiHost+ApiKey 即可）│
            └──────────────────┘    └─────────────────────────┘
```

它做三件事：

1. **管理节点配置** — 增删改、分组、按协议表单化配置
2. **给后端拉取** — soga / XrayR / V2bX / hysteria-v2board 等现成后端通过 **Xboard 兼容 API** 拉配置运行
3. **给客户端订阅** — `/s/{token}` 输出 Clash / sing-box / 通用 URI，按 UA 自动识别格式

它**不做**的事：监控、流量统计、测速、用户门户——纯中枢，够用就好。

---

## 特性

- 🎯 **Xboard 兼容后端 API** — 现成节点后端零改动对接
- 📡 **订阅输出** — Clash(mihomo) / sing-box / URI / base64，按客户端 UA 自动匹配
- 🧩 **mihomo 模板注入** — Xboard 同款语义：自动注入节点/策略组，支持 `/正则/` 组内筛选
- 📋 **协议参数表单** — Xboard 风格动态表单，vless/vmess/trojan/SS/hysteria2/tuic 全覆盖
- 🔑 **三权分离** — 管理密码 / 通信密钥 / 订阅 token 互不相通
- 🌐 **Cloudflare 部署** — Workers + D1 免费档跑 30+ 节点，push 即自动部署
- 🪶 **单文件数据库** — D1（边缘 SQLite），`wrangler d1 export` 随时备份

---

## 快速开始

### 部署（Cloudflare 连 GitHub 自动部署）

1. **Fork** 本仓库到你的 GitHub
2. 打开 [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) → **Create application** → **Import a repository** → 选择你的 Fork
3. **Worker 名字填 `hakimi`**（必须与 `wrangler.toml` 的 `name` 一致，否则构建失败）
4. **Deploy command 填 `npm run deploy:ci`**（不要用默认值）
5. **Settings → Builds → API token** 换成自建 token（权限：`Account / Workers Scripts / Edit` + `Account / D1 / Edit`）
6. **Save and Deploy** ✅

> 详细 token 创建步骤见 [部署文档](#部署详解)。

### 首次使用

1. 打开 `https://hakimi.<你的子域>.workers.dev` → **初始化**，设置管理密码
2. **节点**页 → 新建节点（按类型出表单，选/填即可）
3. **用户凭据**页 → 新建凭据（UUID 自动生成）
4. **订阅**页 → 新建订阅（绑定凭据）→ 复制链接导入客户端
5. **设置**页 → 复制「通信密钥」填进节点后端的 `ApiKey`

---

## 节点后端对接

面板**设置**页的「通信密钥」即后端的 `ApiKey`，`NodeID` 填节点的 `id` 或 `code`（别名）：

<details>
<summary><b>XrayR</b>（PanelType: NewV2board）</summary>

```yaml
# config.yml
Nodes:
  - PanelType: "NewV2board"
    ApiConfig:
      ApiHost: "https://hakimi.xxx.workers.dev"
      ApiKey: "面板设置页的通信密钥"
      NodeID: 1
      NodeType: "V2ray"          # VLESS 加 EnableVless: true
```
</details>

<details>
<summary><b>soga</b></summary>

```ini
# soga.conf（节选）
panel_type = xboard
api_host = https://hakimi.xxx.workers.dev
api_key  = 通信密钥
node_id  = 1
```
</details>

<details>
<summary><b>hysteria-v2board</b>（hy2 后端）</summary>

```yaml
# config.yaml（节选）
v2board:
  apiHost: https://hakimi.xxx.workers.dev
  apiKey: 通信密钥
  nodeID: 1
```
</details>

### 兼容端点

| 端点 | 行为 |
|---|---|
| `GET /api/v1/server/UniProxy/config` | 实装：节点配置 + `base_config`，带 ETag/304 |
| `GET /api/v1/server/UniProxy/user` | 实装：凭据表 |
| `GET /api/v2/server/{config,user}` | 同上（v2 认证） |
| `GET /api/v1/server/TrojanTidalab/{config,user}` | 实装：trojan-go 风格 |
| `GET /api/v1/server/ShadowsocksTidalab/user` | 实装：SS 凭据 |
| `POST .../push\|submit\|alive\|status\|report` | 兼容收单（不落库），返回成功体 |
| `GET\|POST /api/v2/server/handshake` | `{"websocket":{"enabled":false}}` |

---

## 订阅链接

```
GET /s/{token}
GET /s/{token}?types=vless,trojan          # 只出这些协议
GET /s/{token}?filter=香港                 # 名称/标签关键词过滤
GET /s/{token}?flag=clash                  # 强制格式（clash / sing-box / shadowrocket / general）
```

按客户端 UA 自动识别：Clash 系 → YAML，sing-box → JSON，Shadowrocket/Surge 等 → URI 列表，未识别 → base64。

mihomo 模板可在**设置 → mihomo 下发模板**自定义（Xboard 同款注入语义）：
节点自动合并进 `proxies`、自动追加进策略组；组内写 `/正则/` 筛选节点；注入后为空的组自动移除。

---

## 开发

```bash
npm install                  # 后端依赖
npm ci --prefix web          # 前端依赖

npm run dev                  # 后端本地调试（wrangler dev，需先 build）
npm run dev:web              # 前端 Vite 开发（API 自动代理到 8787）
npm run build                # 构建前端（tsc 检查 + vite 打包到 web/dist）
npm run typecheck            # TypeScript 检查（后端 + 前端）
npm run migrate:local        # 本地 D1 建表
npm run deploy:ci            # 部署全流程（Cloudflare 构建运行的就是它）
```

```
hakimi/
├── wrangler.toml            # Workers 配置（D1 绑定、静态资源）
├── migrations/              # D1 SQL 迁移
├── scripts/prepare-d1.mjs   # 构建用：自动创建/复用 D1、写 database_id、建表
├── src/                     # 后端（Hono + TypeScript）
│   ├── routes/              #   admin（管理 API）/ serverapi（Xboard 兼容层）/ sub（订阅）
│   ├── services/            #   buildNodeConfig / 密码派生（照抄 Xboard 语义）
│   └── render/              #   Clash / sing-box / URI 渲染器 + UA 识别
├── web/                     # 前端（React 19 + Vite + shadcn/ui + Tailwind v4）
│   ├── src/views/           #   节点 / 用户凭据 / 订阅 / 设置
│   └── src/components/      #   shadcn/ui 组件 + 节点编辑弹窗
└── PLAN.md                  # 架构设计文档
```

---

## 部署详解

<details>
<summary><b>为什么要换 API token？</b></summary>

Cloudflare 执行构建时，构建过程自己也要「登录」你的账号才能建资源、传 Worker。
默认自动生成的 token 只有 Workers/KV/R2 权限，**没有 D1**——而 `deploy:ci` 第一步就是建 D1 库和表。

**创建步骤（一次性，约 3 分钟）：**

1. 打开 [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Custom Token**
2. Permissions 添加两条：
   - `Account` / `Workers Scripts` / `Edit`
   - `Account` / `D1` / `Edit`
3. Account Resources → `Include` → 你的账户 → **Create Token** → **复制保存**
4. Workers & Pages → `hakimi` → Settings → Builds → **API token** → 选中你刚创建的 token

</details>

<details>
<summary><b>用自定义域名？</b></summary>

有 Cloudflare zone 的话，在 Workers 设置 → Domains & Routes 里绑定即可。
没有也能用 `https://hakimi.<你的子域>.workers.dev`。

</details>

<details>
<summary><b>数据库迁移</b></summary>

`deploy:ci` 自动处理迁移（按序执行未跑过的）。
以后改表结构只需要往 `migrations/` 加新 SQL 文件，push 即生效。

备份：`wrangler d1 export hakimi > backup.sql`

</details>

---

## 已知取舍

| 取舍 | 说明 |
|---|---|
| SS2022 密码派生用 SHA-256 | WebCrypto 无 MD5；config 下发的 `server_key` 与订阅密码两端由面板生成，互通不受影响 |
| `handshake` 不提供 WS 长连接 | `websocket.enabled=false`，纯中枢不需要 |
| 订阅二维码暂未实现 | 直接复制链接即可导入 |
| 上报端点收单即弃 | `push/alive/status` 只返回成功体不落库，以后想加统计往这里加一行即可 |

---

## License

[MIT](./LICENSE)
