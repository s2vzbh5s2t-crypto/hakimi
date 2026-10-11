-- 去掉节点的「订阅中显示 / 启用」开关：不要的节点直接删除
ALTER TABLE servers DROP COLUMN show;
ALTER TABLE servers DROP COLUMN enabled;
