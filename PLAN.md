# 节点管理面板（单人版）规划

> 定位：**个人自用、单用户的纯节点中枢**，托管 Cloudflare Workers/Pages + D1，服务器成本 $0。
> 职责只有三件事：
> ① **管理节点配置**（增删改、分组）
> ② **给后端提供配置**——soga / XrayR / V2bX / hysteria-v2board 通过面板的后端 API 拉取节点配置与用户凭据并运行
> ③ **给客户端提供订阅链接**——导入 Clash / sing-box / Shadowrocket 等软件直接使用
>
> 下发协议不自研，**照抄 Xboard 后端 API 的实现**（源码在 `C:\Users\lucyna\Downloads\Xboard-master\Xboard-master`，本文的契约以它为唯一权威）。
> **不做监控、不做流量统计**——上报类端点只做兼容性接收（收单即弃），保证后端不报错。

---

## 1. 角色与数据流

```
                 ┌────────────────────────────────────────────┐
                 │      节点管理面板（中枢）· Cloudflare 托管     │
                 │    Workers + D1（免费档，无面板服务器）        │
                 │        节点配置 · 用户凭据 · 订阅链接          │
                 └──────┬──────────────────────┬──────────────┘
        订阅链接          │                      │  后端 API（Xboard 兼容协议）
                         │                      │  config / user（拉取）· push/alive/status（弃收）
        ┌────────────────┴───────┐    ┌─────────┴──────────────────────────┐
        │  你本人                 │    │  节点 × N（VPS / 家里机器）           │
        │  Clash / sing-box /    │    │  soga · XrayR · V2bX · hy2-v2board   │
        │  Shadowrocket 导入订阅  │    │  （填 apiHost + api_key + nodeID）    │
        └────────────────────────┘    └─────────────────────────────────────┘
```

原则：
1. **面板声明状态**：节点长什么样、谁可以连。后端只执行：拉 config → 起核心 → 拉 user 表鉴权。
2. **面板挂了不影响线路**：生态后端都缓存最后一次配置继续跑。

---

## 2. 范围

### 做（In Scope）
- 节点配置管理（CRUD、类型、传输层、TLS/Reality、分组、启停）
- 用户凭据（单账号，一个 uuid 派生所有协议密码）
- 订阅链接输出（clash / sing-box / base64 / 二维码）
- 后端 API 兼容层（UniProxy + Tidalab 两族端点，认证与 ETag/304）

### 不做（Out of Scope）
- ~~监控、在线状态、心跳告警~~
- ~~流量统计、流量曲线、配额显示~~
- ~~延迟测速、在线 IP、设备数限制~~
- ~~Machine（一机多节点）、审计日志、订单/套餐/权限组~~

---

## 3. 概念模型（对齐 Xboard 语义，源码：`app/Models/Server.php`、`app/Services/ServerService.php`）

| 概念 | 对应生态 | 说明 |
|---|---|---|
| **Server（节点）** | `nodeID` | 查找规则（`ServerService::getServer`）：`code` **或** `id` 匹配，code 优先 → 节点可以有字符串别名，后端 `NodeID` 填什么都行 |
| **User（用户）** | `/user` 返回的凭据 | **全部协议密码都派生自 `user.uuid` 这一个字段**：vless/vmess 直接用 uuid；trojan 密码 = uuid；SS secret = uuid（SS2022 时 = `serverKey:userKey`，见 §6.3）。单用户 = 1~N 行凭据（按订阅/设备各一份） |
| **Subscription（订阅）** | `/s/{token}` | 节点集 + 指定凭据的导出视图，token 可轮换 |
| **分组** | `servers.group_ids` × `users.group_id` | Xboard 用权限组筛"哪些用户能用哪些节点"；单人版可简化为"订阅的节点筛选"用（`?filter=`） |

---

## 4. 功能模块

### M1 节点管理
- 节点 CRUD；类型（`Server::VALID_TYPES` + `TYPE_ALIASES` 归一化）：`vless` / `vmess` / `trojan` / `shadowsocks` / `hysteria` / `tuic`（可选 `anytls` / `socks` / `naive` / `http`）
- 节点字段对齐 Xboard：`code`（可读别名）、`name`、`host`（连接地址）、`port`（客户端连接端口，支持 `1000-2000` 动态范围）、`server_port`（服务端监听端口）、`tags`、`sort`、`protocol_settings`（JSON）
- `protocol_settings` 按类型表单化：`network/network_settings`（tcp/ws/grpc/h2）、`tls`(0/1/2：无/TLS/Reality)、`tls_settings`、`reality_settings`、`flow`、`multiplex`、`cipher/plugin/plugin_opts`（SS）、`bandwidth/obfs`（hysteria）、`congestion_control`（tuic）等

### M2 用户与凭据（单人）
- 一个主账号，派生多份 `uuid`（按订阅/设备各一份，丢了单独作废）
- 表单只需要 uuid 生成器 + 备注；无配额/到期/封禁逻辑（这些是商业面板概念）

### M3 订阅服务（给客户端）
- `GET /{subscribe_path}/{token}`（默认 `s`，可配置）
- 查询参数（对齐 `ClientController::subscribe`）：`?types=vless|trojan`（协议过滤）、`?filter=香港|IEPL`（名称/标签关键词，≤20 字符）、`?flag=sing-box`（强制指定客户端格式）
- 按 UA 自动匹配客户端格式；支持清单（`app/Protocols/`）：Clash、ClashMeta、SingBox、Shadowrocket、Surge、Surfboard、Stash、Loon、QuantumultX、Shadowsocks、General（base64 兜底）
- 输出 = 节点渲染器（照抄 `app/Protocols/*::buildXxx` 的字段映射）+ 模板（`resources/rules/*.clash.yaml` 等）
- token 可撤销、轮换；二维码展示

### M4 后端 API 兼容层（核心，见 §6）
- **拉取类实装**：`config`（节点配置 + 轮询节奏）、`user`（凭据表）
- **上报类兼容收单**：`push` / `submit` / `alive` / `status` / `alivelist` / `report` / `handshake`——按各端点**要求的请求形状解析**、返回**要求的成功体**后丢弃，不落库
- 认证 + `ETag`/`304` 增量拉取照抄 Xboard 行为

---

## 5. 数据模型（Cloudflare D1）

```sql
servers          (id, code,                       -- code: 字符串别名，后端 NodeID 可填 code 或 id
                  name, type,                     -- vless|vmess|trojan|shadowsocks|hysteria|tuic|...
                  group_ids, tags, sort,
                  host, port, server_port,        -- port 支持 "1000-2000" 动态范围
                  protocol_settings,              -- JSON，字段结构照抄 Xboard（见 §6.3 config）
                  created_at, updated_at)
users            (id, email,                      -- email 仅作备注/标识
                  uuid,                           -- 唯一凭据字段，其他协议密码全部由它派生
                  enabled)
subscriptions    (id, name, token, user_id,       -- 每条订阅绑定一份凭据
                  filter_json,                    -- 默认的 types/filter 参数
                  created_at)
settings         (key, value_json)                -- server_token / subscribe_path / push_interval / pull_interval
```

要点：
- `protocol_settings` 就按 Xboard 的 `PROTOCOL_CONFIGURATIONS` 结构存 → 兼容层**零转换**吐给后端（`buildNodeConfig` 只是按 type 挑字段）
- 没有流量/日志类表，写入只有增删改配置
- 备份 = `wrangler d1 export`；D1 Time Travel 兜底误删

---

## 6. API 设计（契约以 Xboard 源码为准）

### 6.1 管理 API（登录态）`/api/admin/*`
```
CRUD  /api/admin/servers       /api/admin/users       /api/admin/subscriptions
GET   /api/admin/subscriptions/{id}/url?flag=clashmeta|sing-box|shadowrocket|general
POST  /api/admin/settings/server-token/rotate
```

### 6.2 订阅 API（token 即凭证，只读）
```
GET /s/{token}[?types=&filter=&flag=]     -- UA 自动识别，flag 强制指定
```

### 6.3 后端 API（兼容层）

**路由全集**（源码：`app/Http/Routes/V1|V2/ServerRoute.php`）：

| 族 | 路径 | 用途 |
|---|---|---|
| UniProxy v1 | `GET /api/v1/server/UniProxy/{config,user}`、`POST .../{push,alive,status}`、`GET .../alivelist` | XrayR(NewV2board) / V2bX 等 |
| Tidalab | `GET /api/v1/server/TrojanTidalab/{config,user}`、`POST .../submit`；`GET /api/v1/server/ShadowsocksTidalab/user`、`POST .../submit` | tidalab-trojan / tidalab-ss 后端 |
| V2 | `GET|POST /api/v2/server/handshake`、`POST .../{report,push,alive,status}`、`GET .../{config,user,alivelist}` | 新一代后端（machine 模式入口） |
| ~~Deepbwork~~ | ~~`/api/v1/server/Deepbwork/*`~~ | **现行 Xboard 已移除**（`ServerRoute.php` 里 `use DeepbworkController` 是死引用，类不存在）。XrayR 的 `PanelType: V2board` 本就连不上现行 Xboard；确有老后端需要再补 |

**认证**：
- v1（`Middleware/Server.php`）：query `token` == `settings.server_token` + `node_id` 必填 + 可选 `node_type`（`TYPE_ALIASES` 归一化，`v2node` 特例视为无）。节点按 `code` 优先、`id` 其次查找，找不到 404
- v2（`Middleware/ServerV2.php`）：`machine_id`+`token`（机器模式）或 `token`+`node_id`；`handshake` 时 `node_id` 可空

**config（GET，实装）**——`ServerService::buildNodeConfig` 的响应，公共字段 + 按类型补充：

```
公共: protocol, listen_ip:"0.0.0.0", server_port, network, networkSettings
      + base_config: {push_interval, pull_interval}     ← settings 下发，默认各 60s
      可选附加: routes(route_ids 展开), custom_outbounds, custom_routes, cert_config
shadowsocks: cipher, plugin, plugin_opts, server_key(2022 系列按 created_at 派生)
vmess:       tls(int), tls_settings, multiplex
trojan:      host, server_name, tls(int), tls_settings(tls=2 时改用 reality_settings), multiplex
vless:       tls(int), flow, decryption, tls_settings(tls=2 → reality_settings), multiplex
hysteria:    version, host, server_name, tls_settings, up_mbps, down_mbps, obfs / obfs-password
tuic:        version, server_name, congestion_control, tls_settings,
             auth_timeout:"3s", zero_rtt_handshake:false, heartbeat:"3s"
```
（`tls` 取值 0=无 / 1=TLS / 2=Reality；ETag 见下）

**user（GET，实装）**——三种响应形状（字段就这些）：
```
UniProxy:         {"users":[{"id":1,"uuid":"...","speed_limit":0,"device_limit":0}]}
TrojanTidalab:    {"msg":"ok","data":[{"id":1,"speed_limit":0,"device_limit":0,
                    "trojan_user":{"password":"<uuid>"}}]}        ← uuid 被替换后移除
ShadowsocksTidalab:{"data":[{"id":1,"port":"<server_port>","cipher":"<节点cipher>",
                    "secret":"<uuid>"}]}
```

**上报类（收单即弃，形状必须正确）**：
```
POST UniProxy/push        body [[uid, bytes], ...]（二元组数组）   → {"data":true,"code":0,"message":"success"}
POST UniProxy/alive       body {uid: [ip, ...], ...}              → {"data":true}
POST UniProxy/status      body {cpu, mem:{total,used}, swap:{...}, disk:{...}} → {"data":true,"code":0,...}
GET  UniProxy/alivelist   —                                      → {"alive":{}}
POST Tidalab/submit       body [{"user_id":1,"u":123,"d":456},...]→ {"ret":1,"msg":"ok"}
POST v2/report            —                                      → 成功体（v2 专用）
```

**ETag 语义**（user/config）：`ETag: "<sha1(json_encode(响应))>"`；`If-None-Match` **子串匹配**命中即返 304（照抄 `strpos !== false` 的宽松比较）。

**订阅渲染侧**（`app/Protocols/*` + `app/Models/Server::generateServerPassword`）：
- 用户密码 = `uuid`；SS2022（blake3 系列）= `serverKey:userKey`：`serverKey = getServerKey(server.created_at, size)`，`userKey = uuidToBase64(uuid, size)`（确定性派生，照抄 `Helper`）
- 动态端口：`port` 为 `1000-2000` 时每次订阅随机取一个
- UA → flag → 适配器类（11 个），未识别走 `General`（base64 URI）

---

## 7. 后端对接示例（= 验收标准）

```yaml
# XrayR config.yml（用 NewV2board 模式，走 UniProxy 族；V2board 模式的 Deepbwork 端点已不存在）
Nodes:
  - PanelType: "NewV2board"
    ApiConfig:
      ApiHost: "https://panel.example.com"
      ApiKey: "面板设置里的通信密钥"     # → query token
      NodeID: 1                         # 填面板节点的 id 或 code
      NodeType: "V2ray"                 # V2ray|Trojan|Shadowsocks（VLESS 走 EnableVless: true）
```

```ini
# soga.conf（节选）
panel_type = xboard   # 或 v2board（视 soga 版本实现的端点族而定，接入时实测）
api_host = https://panel.example.com
api_key  = 面板通信密钥
node_id  = 1
```

```yaml
# hysteria-v2board（hy2 后端，节选）
v2board:
  apiHost: https://panel.example.com
  apiKey: 面板通信密钥
  nodeID: 1
auth:
  type: v2board
```

**验收矩阵**（每个目标后端打勾）：
拉 config 成功（协议字段解析正常）→ 核心起来监听端口 → 拉 user 表鉴权通过 → **客户端实际连通** → 上报端点全部返回正确成功体、后端日志无错 → 面板重启期间线路不中断。

---

## 8. 技术选型与部署形态（Cloudflare 免费档）

| 层 | 选型 | 说明 |
|---|---|---|
| 运行时 | **Cloudflare Workers（TypeScript + Hono）** | 请求驱动，正好匹配"后端定时 pull"；Go 上 Workers 只能走 WASM，不划算 |
| 存储 | **Cloudflare D1**（边缘 SQLite） | §5 的 SQL 原样可用，免费档 5GB |
| 前端 | React + Vite，产物随 Worker 发布 | Workers Static Assets，`wrangler deploy` 一次搞定；Pages + Functions 亦可 |
| 部署 | Wrangler | `wrangler dev` 本地调试，`wrangler d1 migrations` 管 schema |
| 密钥 | `wrangler secret` | server_token / 管理密码哈希 / 会话密钥 |

### 费用账（Workers Free）

| 配额 | 免费档 | 消耗（每节点，60s 轮询） |
|---|---|---|
| Workers 请求 | 100,000/天（超限 Error 1027） | config + user ≈ 2 次/分 ≈ **2,900/天/节点** |
| D1 行读 | 5,000,000/天 | 每次拉取几行 → 可忽略 |
| D1 行写 | 100,000/天 | **≈0**（无流量落库，只有改配置时写） |
| CPU | 10 ms/次 | 小 JSON 序列化，绰绰有余 |

结论：**默认 60s 轮询约 34 个节点；`push_interval/pull_interval` 提到 300s 可上百节点**——纯中枢形态免费档非常宽裕。

---

## 9. 目录结构

```
hakimi/
├── wrangler.toml           # Workers 配置：D1 绑定、静态资源
├── migrations/             # D1 SQL 迁移
├── src/
│   ├── index.ts            # Hono 路由入口（API + 静态资源）
│   ├── routes/
│   │   ├── admin/          # 管理 API
│   │   ├── sub/            # 订阅输出（UA 识别 + 11 种客户端适配器）
│   │   └── serverapi/      # 后端 API 兼容层
│   │       ├── uniproxy/   #   UniProxy 族（config/user 实装，上报弃收）
│   │       └── tidalab/    #   Tidalab 族（trojan/ss）
│   ├── services/           # buildNodeConfig / getAvailableUsers / getServer(code|id)
│   ├── render/             # 订阅渲染器（照抄 app/Protocols 的字段映射）
│   └── db/                 # D1 访问封装
├── web/                    # React 前端（构建产物由 Workers Static Assets 托管）
└── PLAN.md
```

---

## 10. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P1 · 中枢可用** | 节点/凭据 CRUD、订阅输出（clashmeta + general）、二维码、登录、通信密钥；经 Cloudflare 连 GitHub 自动部署上线 | 订阅丢进 Clash 能连（节点先手工起服务也行） |
| **P2 · 后端闭环** | UniProxy + Tidalab 两族端点、认证（token/node_id/code）、ETag/304、上报弃收 | XrayR(NewV2board) 或 V2bX 跑通全流程；改面板配置 → 后端下一轮拉取生效 |

P2 之后即为完整可用形态。以后想加监控/流量统计随时能加（上报端点已预留）。

---

## 11. 安全与风险

- **server_token 是全局通信密钥**（拼在 query 里）：泄露 = 任何人可拉节点配置与凭据。必须 HTTPS（CF 天然提供）+ 可轮换；可加 Cloudflare WAF/IP 白名单再挡一层
- **订阅 token 泄露**：只读、可轮换，泄露 ≠ 面板失守
- **兼容性细节风险**：一切以本地 Xboard 源码为准（`ServerService.php` / `UniProxyController.php` / `Tidalab*Controller.php` / `Middleware/Server*.php` / `app/Protocols/`），以真实后端集成测试收口（§7 矩阵）；XrayR 各版本、soga 各版本对端点族的实现有差异，接入时逐个实测
- **Workers 无任意出站 TCP**：无所谓——纯中枢不需要探测节点
- **平台绑定与逃生**：数据在 D1，`wrangler d1 export` 导出 SQL；架构是标准 HTTP + SQL，迁回 VPS 半天可完成
- **面板不可达时**：后端缓存最后配置继续服务

---

## 12. 待定项

1. 兼容优先级：先 UniProxy（XrayR NewV2board / V2bX）还是先 Tidalab（tidalab-trojan/ss）？→ 推荐先 UniProxy，覆盖面最大
2. 要不要补 Deepbwork 族（现行 Xboard 已删除，仅当 soga 老版本确实请求时才做）
3. 首期客户端：ClashMeta / sing-box / Shadowrocket，决定 P1 订阅格式优先级
4. 域名：是否已有托管在 Cloudflare 的域名（没有也能先用 `*.workers.dev`）
