# Hakimi · 单人节点中枢

托管在 **Cloudflare Workers + D1** 的节点管理面板——服务器成本 **$0**（免费档即可跑 30+ 节点），没有面板服务器要维护。

它只做三件事：

1. **管理节点配置** —— vless / vmess / trojan / shadowsocks / hysteria2 / tuic，含 Reality、XTLS-Vision、WS / gRPC / H2 传输层
2. **给节点后端拉取** —— soga / XrayR / V2bX / hysteria-v2board 等现成后端通过 **Xboard 兼容 API** 拉配置运行，填 `apiHost + api_key + nodeID` 即对接
3. **给客户端订阅** —— `/s/{token}` 输出 Clash / sing-box / 通用 URI，按 UA 自动识别格式，导入 Clash、sing-box、Shadowrocket 等直接使用

设计与完整契约见 [`PLAN.md`](./PLAN.md)。

---

## 快速开始（部署）

**唯一部署方式：Cloudflare 连接 GitHub 仓库自动部署**（Workers Builds）。
项目零构建（前端是静态文件）、零应用级密钥（密码/密钥都存在 D1 里）——
仓库里的 `npm run deploy:ci` 会在构建中自动完成
「查找/创建 D1 → 写入 database_id → 建表 → 部署」，本地不需要装任何环境。

1. 打开 [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) → **Create application** → **Import a repository** → 授权 GitHub 并选中本仓库
2. **Worker 名字必须填 `hakimi`**
   （要与 `wrangler.toml` 的 `name` 一致，否则构建直接失败）
3. **Deploy command 填 `npm run deploy:ci`**
   （不要用默认的 `npx wrangler deploy`，否则 `database_id` 占位符会让部署失败）
4. **给构建换一个带 D1 权限的 API token**（见下方详解，一次性设置）
5. **Save and Deploy** → 完成。之后每次 `git push` 自动部署

#### 第 4 步详解：为什么要换 API token？

Cloudflare 执行你的构建时，构建过程自己也要「登录」你的账号才能建资源、传 Worker，
这个凭证就是 API token。默认情况下 Cloudflare 会**自动生成**一个，但它的权限是写死的：

> Workers Scripts（编辑）、Workers KV（编辑）、Workers R2（编辑）、Workers Routes（编辑）

**里面没有 D1** —— 而 `deploy:ci` 第一步就是建 D1 库和表，撞上默认 token 会报权限错误。
所以要自己建一个带 D1 权限的 token 给构建用（一次性，约 3 分钟）：

1. 打开 [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Custom Token**
2. Permissions 添加两条：
   - `Account` / `Workers Scripts` / `Edit`
   - `Account` / `D1` / `Edit`
3. Account Resources → `Include` → 你的账户 → **Continue to summary → Create Token** → **立刻复制**（只显示一次）
4. 回到 Workers & Pages → `hakimi` → **Settings → Builds** → **API token** → 选中你刚创建的 token → 保存

> 这个 token 是给 Cloudflare **构建环境**用的账号凭证，与面板里的「通信密钥」
>（server_token，给节点后端用的）完全是两回事。随时可在 API Tokens 页吊销或改权限。

> 没有自己的域名也能用 `https://hakimi.<你的子域>.workers.dev`；
> 有 Cloudflare zone 的话在 Workers 设置里绑自定义域即可。

---

## 首次使用

1. 打开面板 → **初始化**，设置管理密码（通信密钥同时自动生成）
2. **节点**页 → 新建节点：类型、地址、端口、协议参数（有按类型的预设，改几个值就行）
   - 节点的 `Code` 可以填一个好记的别名（如 `hk01`），后端 `NodeID` 填它或数字 id 都行
3. **用户凭据**页 → 新建凭据（UUID 自动生成）—— 一份凭据 = 一个 UUID，trojan/SS 密码由它派生，
   建议按订阅/设备各建一份，丢失单独作废
4. **订阅**页 → 新建订阅（绑定凭据，可按类型/标签过滤）→ 复制订阅链接
5. 把订阅链接导入 Clash / sing-box / Shadowrocket 等客户端（也可以 `?flag=` 强制指定格式）
6. 把**设置**页的通信密钥填进节点后端的 `ApiKey`（见下节）

---

## 订阅链接

```
GET /s/{token}
GET /s/{token}?types=vless|trojan            # 只出这些协议
GET /s/{token}?filter=香港|IEPL              # 按名称/标签关键词过滤
GET /s/{token}?flag=clash|sing-box|shadowrocket|general   # 强制输出格式
```

默认按客户端 UA 自动识别：Clash 系 → Clash YAML，sing-box → JSON，Shadowrocket/Surge 等 → URI 列表，未识别 → base64。
订阅链接可随时在面板**轮换**（旧链接立即失效）。

---

## 节点后端对接

面板**设置**页的「通信密钥」即后端配置里的 `ApiKey`，`NodeID` 填节点的 `id` 或 `code`：

```yaml
# XrayR config.yml（PanelType: NewV2board = UniProxy 族）
Nodes:
  - PanelType: "NewV2board"
    ApiConfig:
      ApiHost: "https://panel.example.com"
      ApiKey: "面板设置页的通信密钥"
      NodeID: 1                      # 填 id 或 code
      NodeType: "V2ray"              # VLESS 加 EnableVless: true
```

```ini
# soga.conf（节选）
panel_type = xboard                  # 或 v2board，视 soga 版本实现的端点族而定
api_host = https://panel.example.com
api_key  = 通信密钥
node_id  = 1
```

```yaml
# hysteria-v2board（hy2 后端，节选）
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
| `GET /api/v2/server/{config,user}` | 同上（v2 认证，`node_id` 支持 code 别名） |
| `GET /api/v1/server/TrojanTidalab/{config,user}` | 实装：trojan-go 风格配置 / trojan_user 凭据 |
| `GET /api/v1/server/ShadowsocksTidalab/user` | 实装：`{data:[{id,port,cipher,secret}]}` |
| `POST .../push\|submit\|alive\|status\|report` | 兼容收单（不落库），返回各端点要求的成功体 |
| `GET\|POST /api/v2/server/handshake` | `{"websocket":{"enabled":false}}` |
| `GET .../alivelist` | `{"alive":{}}` |

> 现行 Xboard 已移除 Deepbwork 族端点，本面板同样不提供；
> XrayR 请用 `NewV2board` 模式（`V2board` 模式连 Xboard 也连不上）。

---

## 开发

```bash
npm run dev            # 本地开发（wrangler dev）
npm run typecheck      # TypeScript 检查
npm run migrate:local  # 本地 D1 建表
npm run deploy:ci      # 部署全流程（Cloudflare 构建运行的就是它）：D1 准备 + 迁移 + 部署
```

```
├── wrangler.toml            # Workers 配置（D1 绑定、静态资源）
├── migrations/              # D1 SQL 迁移
├── scripts/prepare-d1.mjs   # Cloudflare 构建用：自动创建/复用 D1、写 database_id、建表
├── src/
│   ├── routes/              # admin（管理 API）/ serverapi（Xboard 兼容层）/ sub（订阅）
│   ├── services/            # buildNodeConfig / 密码派生（照抄 Xboard 语义）
│   ├── render/              # Clash / sing-box / URI 渲染器 + UA 识别
│   └── db.ts · util.ts      # D1 访问 / PBKDF2 / ETag
└── web/                     # 管理面板（零构建静态 SPA）
```

---

## 范围与取舍

**不做**：监控、流量统计、测速、在线 IP、设备限制（见 PLAN.md §2）。
上报端点保留是为了后端不报错；以后想加统计，往 `push` 处理里落库即可。

已知取舍：

- SS2022 密码派生用 SHA-256 替代 Xboard 的 MD5（WebCrypto 无 MD5）——
  config 下发的 `server_key` 与订阅密码两端都由本面板生成，保持一致即可互通
- `handshake` 不提供 WS 长连接通道（`websocket.enabled=false`）
- 订阅二维码暂未实现，直接复制链接即可导入

---

## 故障排查

**构建/部署失败**
| 现象 | 原因 |
|---|---|
| 构建立刻失败，日志提示 name 不匹配 | Worker 名字没填 `hakimi`（必须与 `wrangler.toml` 的 `name` 一致） |
| 报 `database_id` 相关错误 | Deploy command 用了默认值——改成 `npm run deploy:ci` |
| 报 403 / 权限错误（建库、建表时） | 构建的 API token 没有 D1 权限——按「第 4 步详解」换成自建 token |
| 部署成功但面板 500 | 数据库表没建——看构建日志里 `prepare-d1` 的迁移步骤是否执行 |

**节点后端连不上面板**
1. 后端日志报 `Invalid token` → 通信密钥没对上（设置页重新复制；轮换过的话后端要同步改）
2. 报 `Server does not exist` → `NodeID` 填错（可以填节点 `code`）
3. 报 404 on Deepbwork → 后端用的 `PanelType: V2board` 老模式，换成 `NewV2board`
4. 拉到配置但客户端连不上 → 检查节点的 host/端口/证书（面板只管下发参数，证书在机器上）

**订阅导入失败**
- 客户端报配置解析错误 → 用 `?flag=` 指定格式再试（如 `?flag=clash`、`?flag=sing-box`）
- 导入成功但没有节点 → 检查订阅的类型/标签过滤条件，以及节点是否勾选「订阅中显示」
