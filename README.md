# Hakimi

自己用的代理节点管理面板，跑在 Cloudflare Workers 上，不占服务器。节点配置、后端下发、客户端订阅，一个面板管完。

## 这是干什么的

手上机器多了以后，节点配置东一份西一份很乱，客户端订阅要手动改，后端（soga、XrayR 这些）又各自要配置。这个面板就是把它们收拢到一处：所有节点配置存在这里，后端来拉，客户端也来拉。

```
                    ┌─────────────────────────────┐
                    │          Hakimi              │
                    │   Cloudflare Workers + D1    │
                    └──────┬──────────────┬────────┘
           订阅链接          │              │  后端 API
                            │              │
            ┌───────────────┴──┐    ┌──────┴──────────────────┐
            │     你的客户端     │    │   VPS / 家里机器 × N      │
            │  Clash / sing-box │    │   soga / XrayR / V2bX    │
            └──────────────────┘    └─────────────────────────┘
```

后端 API 直接兼容 Xboard，所以 soga、XrayR 这些现成后端填个 ApiHost、ApiKey、NodeID 就能用，不用改任何代码。

客户端订阅一条链接搞定，面板会看客户端的 UA 自动选格式（Clash 给 YAML，sing-box 给 JSON，其他给 URI），不用手动指定。

监控、流量统计、测速这些都没做。这是个纯中枢，配置对了、能跑就行。

## 用法

先部署：

1. Fork 本仓库
2. Cloudflare 控制台 [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) → Create application → Import a repository，选你 fork 的仓库
3. Worker 名字填 `hakimi`，不然后面构建会报错
4. Deploy command 填 `npm run deploy:ci`，默认那个不行
5. Settings → Builds → API token 换成自建的（步骤在下面）
6. Save and Deploy

之后每次 git push 就自动部署。访问 `https://hakimi.<你的子域>.workers.dev`，第一次进去设个管理密码，通信密钥会自动生成。

建节点：节点页 → 新建节点。填名称、地址、端口，选协议类型后下面会出对应的表单，传输协议、TLS 模式（无/TLS/Reality）、SS 插件这些都是下拉选的，不用自己拼配置。Code 可以填个好记的别名，后端的 NodeID 填它或数字 id 都行。不要的节点直接删掉，没搞什么「停用」开关。

建凭据：用户凭据页 → 新建凭据。UUID 自动生成，trojan 和 SS 的密码都从它派生。建议每台设备或每个订阅单独建一份，丢了一份不影响别的。

建订阅：订阅页 → 新建订阅，绑一份凭据，复制链接丢进客户端就行：

| 客户端 | 在哪填 |
|---|---|
| Clash 系（Clash Verge Rev / FlClash） | 订阅管理 → 新建 → 粘贴 URL |
| sing-box 系（SFI / NekoBox） | 新建 Profile → Type 选 Remote |
| Shadowrocket | 「+」→ 类型选 Subscribe |
| v2rayN | 订阅分组 → 添加订阅 → 更新订阅 |

订阅 URL 后面能拼参数做筛选：

```
/s/{token}?types=vless,trojan     只出这些协议
/s/{token}?filter=香港            名称或标签匹配关键词
/s/{token}?flag=clash             强制指定输出格式
```

Clash 的下发配置（端口、策略组、分流规则那些）在 设置 → mihomo 下发模板 里改，是个普通的 YAML。节点和策略组会自动填进去，组里写 `/正则/` 可以只放匹配的节点。

接后端。在节点机器上装好后端，配置里指到面板，以 XrayR 为例：

```yaml
Nodes:
  - PanelType: "NewV2board"
    ApiConfig:
      ApiHost: "https://hakimi.xxx.workers.dev"
      ApiKey: "面板设置页的通信密钥"
      NodeID: 1
      NodeType: "V2ray"          # VLESS 加 EnableVless: true
```

soga 的话大概长这样：

```ini
panel_type = xboard
api_host = https://hakimi.xxx.workers.dev
api_key  = 通信密钥
node_id  = 1
```

hysteria-v2board 的话：

```yaml
v2board:
  apiHost: https://hakimi.xxx.workers.dev
  apiKey: 通信密钥
  nodeID: 1
```

后端会自己定时来拉配置，面板上改完节点下一轮就生效。后端上报的流量、在线状态这些接口都有、能收，但不存，免得后端报错。

## API Token 怎么建

部署的时候构建脚本要在你的 Cloudflare 账号里建 D1、传 Worker，需要一个带 D1 权限的 API token。Cloudflare 默认给构建用的那个没 D1 权限，所以得自己建一个，一次性的事：

1. 打开 [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create Token → 找 Custom Token → Get started（别用 "Edit Cloudflare Workers" 那个模板，它缺 D1）
3. Permissions 加两条：
   - `Account` / `Workers Scripts` / `Edit`
   - `Account` / `D1` / `Edit`
4. Account Resources 选 Include → 你的账户，Zone 不用管
5. Continue to summary → Create Token → 把 token 复制下来，只显示这一次
6. 回到 Workers & Pages → hakimi → Settings → Builds → API token，选中刚建的，保存

token 找不回来了就删掉重建一个，重新挂上。构建报 403 一般是权限没加对，去 API Tokens 页核对下是不是 Edit 而不是 Read。

## 架构

整体就是 Cloudflare Workers 一个入口，对外开三类接口，对内一套数据。

```
GitHub 仓库 push
   └─ Cloudflare 构建
        ├─ scripts/prepare-d1.mjs   找/建 D1，跑迁移
        ├─ vite build               前端打包
        └─ wrangler deploy          发布
```

运行时：

```
请求 → Worker (Hono)
  ├─ /api/admin/*          管理接口，session cookie 鉴权
  ├─ /api/v1|v2/server/*    后端拉配置，token + node_id 鉴权
  ├─ /s/{token}             订阅输出，token 即凭证
  └─ 其余 → 静态资源 → React SPA
```

代码在 src/ 下分三层：routes 管 HTTP 和鉴权，services 是领域逻辑（节点配置的拼装、密码派生，照 Xboard 的语义来），render 是订阅渲染（Clash / sing-box / URI 三种输出）。前端在 web/，React 19 + shadcn/ui。

有一条设计原则值得说一下：节点的协议参数统一存在 `protocol_settings` 这个 JSON 里，它是唯一的存储格式。给后端的 config 和给客户端的订阅是两套独立的序列化，互不影响——加协议字段只用改存储语义，两边各自适配。

数据就五张表：servers（节点）、users（凭据，核心是一个 uuid，其他密码都从它派生）、subscriptions（订阅）、sessions（管理会话）、settings（通信密钥、订阅路径、mihomo 模板这些）。

后端怎么拿到配置：面板改了就写库，后端定时来 GET config 和 user，带 ETag 省流量。客户端怎么拿到订阅：请求 /s/token，识别 UA 后按对应格式渲染。后端上报的流量、在线状态接口收一下就丢，不做统计。

三条底线：所有接口契约照抄 Xboard，现成后端不用改；不搞常驻进程，后端 pull 模式，面板挂了线路照跑；管理密码、通信密钥、订阅 token 三套凭证互不相通，漏一个不至于全完。
