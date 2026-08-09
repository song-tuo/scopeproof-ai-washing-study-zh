# ScopeProof v0.5 研究者指南

## 当前服务

- GitHub 仓库：`song-tuo/scopeproof-ai-washing-study-zh`
- 正式网页：`https://song-tuo.github.io/scopeproof-ai-washing-study-zh/`
- Supabase 项目：`scopeproof-ai-washing-study-zh`
- Supabase 项目编号：`mrrgljrezsoepwflbato`
- 刺激版本：`study12-zh-cn-v0.5`

数据库密码保存在本机钥匙串，服务名称为 `scopeproof-ai-washing-study-zh-db`。网页只包含公开 publishable key，不包含数据库密码或 secret/service-role key。

## 招募前

1. 确认机构要求的伦理审批或豁免范围。
2. 运行全部测试：

```bash
npm test
npm run test:ui
npm run test:cloud
```

3. 等待 GitHub Pages 部署成功，并用手机流量打开正式网页。
4. 使用 `TEST-D1` 完成一场正式网页测试，在 Supabase 中确认有 12 条 response。
5. 生成 64 条平衡链接：

```bash
python3 tools/generate_links.py
```

6. 不要把 `private/`、答案键、service-role key 或导出的原始数据提交到 GitHub。

## 数据检查

在 Supabase SQL Editor 运行：

```sql
select
  s.participant_id,
  s.condition,
  s.stimulus_set,
  s.status,
  s.current_position,
  count(r.item_id) as response_count,
  min(s.created_at) as started_at,
  max(s.completed_at) as completed_at
from public.scopeproof_sessions s
left join public.scopeproof_responses r using (session_id)
group by s.session_id
order by started_at desc;
```

正式分析排除编号以 `TEST`、`REVIEW` 或 `PROBE` 开头的场次，并且只保留：

- `stimulus_set = 'study12-zh-cn-v0.5'`
- `status = 'complete'`
- `current_position = 12`
- 恰好 12 条 response
- 两个 touched 字段都为 true

## 版本规则

任何会改变参与者所见文字、答案选项、资料内容或交互方式的修改，都必须同时提升：

1. `data/stimuli.js` 的 `STIMULUS_SET`
2. `config.js` 的 `stimulusSet`
3. Supabase 迁移中的版本约束
4. 本地存储 key 所使用的版本

不同版本的数据不得直接合并。
