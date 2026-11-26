-- 只保留 id：去掉节点的字符串别名 code 和排序字段 sort
-- code 带 UNIQUE 约束，SQLite 的 DROP COLUMN 拒绝删这种列，
-- 故按官方 12-step 流程重建表（servers 无外键引用，可直接 DROP + RENAME）
CREATE TABLE servers_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,                     -- vless|vmess|trojan|shadowsocks|hysteria|tuic
  group_ids         TEXT NOT NULL DEFAULT '[]',
  tags              TEXT NOT NULL DEFAULT '[]',
  host              TEXT NOT NULL DEFAULT '',
  port              TEXT NOT NULL DEFAULT '',          -- 客户端连接端口，支持 "1000-2000" 动态范围
  server_port       INTEGER NOT NULL DEFAULT 0,        -- 服务端监听端口
  protocol_settings TEXT NOT NULL DEFAULT '{}',        -- JSON，结构照抄 Xboard protocol_settings
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

INSERT INTO servers_new (id, name, type, group_ids, tags, host, port, server_port,
                         protocol_settings, created_at, updated_at)
  SELECT id, name, type, group_ids, tags, host, port, server_port,
         protocol_settings, created_at, updated_at
  FROM servers;

DROP TABLE servers;
ALTER TABLE servers_new RENAME TO servers;
