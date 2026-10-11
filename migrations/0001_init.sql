-- 节点管理面板（单人版）初始化
-- 对齐 Xboard 的字段语义，见 PLAN.md §5

CREATE TABLE IF NOT EXISTS servers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT UNIQUE,                       -- 字符串别名，后端 NodeID 可填 code 或 id
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,                     -- vless|vmess|trojan|shadowsocks|hysteria|tuic
  group_ids         TEXT NOT NULL DEFAULT '[]',
  tags              TEXT NOT NULL DEFAULT '[]',
  show              INTEGER NOT NULL DEFAULT 1,
  sort              INTEGER NOT NULL DEFAULT 0,
  host              TEXT NOT NULL DEFAULT '',
  port              TEXT NOT NULL DEFAULT '',          -- 客户端连接端口，支持 "1000-2000" 动态范围
  server_port       INTEGER NOT NULL DEFAULT 0,        -- 服务端监听端口
  protocol_settings TEXT NOT NULL DEFAULT '{}',        -- JSON，结构照抄 Xboard protocol_settings
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,                     -- 备注/标识
  uuid       TEXT NOT NULL,                            -- 唯一凭据，其他协议密码由它派生
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL,
  filter_json TEXT NOT NULL DEFAULT '{}',              -- {"types":[],"keywords":[],"server_ids":[]}
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
