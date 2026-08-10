# ScopeProof v1.0 研究者指南

## 当前服务

- GitHub 仓库：`song-tuo/scopeproof-ai-washing-study-zh`
- 正式网页：`https://song-tuo.github.io/scopeproof-ai-washing-study-zh/`
- Supabase 项目：`scopeproof-ai-washing-study-zh`
- Supabase 项目编号：`mrrgljrezsoepwflbato`
- 刺激版本：`study12-zh-cn-v1.0`
- H3 答案键版本：`h3-set-v1.0`
- 回响任务编号：`202608102142`
- 回响返回地址：`https://www.huixiangdata.com/transferPage?url=https%3A%2F%2Fwww.huixiangdata.com%2Fquestionnaire%2Fapi%2Fv1%2Fanswer%2Fthird%2Fcallback%2Fsubmit%2F202608102142`

数据库密码保存在本机钥匙串，服务名称为 `scopeproof-ai-washing-study-zh-db`。网页只包含公开 publishable key，不包含数据库密码或 secret/service-role key。

## 招募前

1. 确认机构要求的伦理审批或豁免范围。
2. 运行全部测试：

```bash
npm test
npm run test:ui
npm run test:cloud
npm run test:production
```

3. 等待 GitHub Pages 部署成功，并用手机流量打开正式网页。
4. 使用 `TEST-D1` 完成一场正式网页测试，在 Supabase 中确认有 12 条 response。生产测试会在浏览器内拦截回响网址，不会向回响提交测试完成状态。
5. 回响任务直接使用正式网页基础网址，目标仍为 **96 名有效完成者**。参与者进入后填写回响用户编号，数据库按当前 v1.0 会话数分配到人数较少的一组。若需要预先固定分组，也可以从回响导出用户编号并生成平衡专属链接：

```bash
python3 tools/generate_links.py --ids-file private/huixiang_user_ids.csv
```

6. 不要把 `private/`、答案键、service-role key 或导出的原始数据提交到 GitHub。

## 回响匹配与完成确认

- 基础网址不需要任何参数；参与者首先填写回响用户编号，网页不显示或询问实验组别。
- 数据库使用事务锁，在创建会话时把无条件链接分配到当前人数较少的一组；人数相同时先分到普通版，下一人分到分项版。
- 预先生成的专属链接仍可在 `participant` 和 `condition` 参数中固定编号与组别。
- 用户编号只在第一步由参与者填写一次，进入说明页后不再显示；网页不会要求参与者复制或填写完成码。
- 正式题目前必须答对电水壶练习题；答错时页面解释“缺少资料”和“资料反驳宣传”的区别，并要求重新选择。
- 只有第 12 条回答得到 Supabase 的完成确认后，网页才会自动返回回响数据。
- 自动跳转失败时，参与者可点击“立即返回回响数据”。该按钮使用同一个固定回调地址，不附加完成码。
- `preview=1` 不写数据库，也不会跳转或显示回响返回按钮。
- Supabase 仍生成六位完成码作为内部完整性信号，不对参与者公开，也不用于回响匹配。

## 软启动与题量

正式设计保留 12 题，每位参与者提供 48 个 H3 槽位判断。先完成 **12–16 人软启动**，两组人数相等；只检查技术故障、缺失数据、总时长和阅读行为，不查看组间效果。

- 目标中位总时长不超过 20 分钟；超过 25 分钟须暂停招募并检查流程。
- 同时报告每题中位 `response_ms` 和 `evidence_open_count` 随题序的变化。
- H3 balanced accuracy 的前后 1/3 差异只作疲劳描述，不用小样本的 10 个百分点差异单独触发删题。
- 若软启动后不改参与者可见内容或交互，这些场次可计入 96 名有效样本；若修改，则必须再次升版，旧版本不与正式数据合并。
- 若确实需要缩减到 8 题，必须保持 truth × decidability 四格和 claim type 平衡，并作为新版本重新软启动。

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

- `stimulus_set = 'study12-zh-cn-v1.0'`
- `status = 'complete'`
- `current_position = 12`
- 恰好 12 条 response
- 两个 touched 字段都为 true

## 导出 H3 数据

在 Supabase SQL Editor 运行下面的查询，然后下载 CSV。不要在公开仓库保存导出文件。

```sql
select
  s.participant_id,
  s.condition,
  s.stimulus_set,
  s.status as session_status,
  r.item_id,
  r.position,
  r.response_status,
  r.truth_probability,
  r.confidence,
  r.action,
  r.h3_selected_ids,
  r.h3_option_order,
  r.h3_slot_states,
  r.h3_answer_key_version,
  r.h3_explicit_none,
  r.priority_eligible_ids,
  r.priority_selected_id,
  r.priority_option_order,
  r.response_ms
from public.scopeproof_sessions s
join public.scopeproof_responses r using (session_id)
where s.stimulus_set = 'study12-zh-cn-v1.0'
  and s.status = 'complete'
  and s.participant_id !~ '^(TEST|REVIEW|PROBE)'
order by s.participant_id, r.position;
```

把下载文件保存为 `private/responses_v10.csv`，然后运行：

```bash
python3 tools/prepare_h3_analysis.py private/responses_v10.csv
```

脚本默认排除 `TEST`、`REVIEW`、`PROBE` 前缀，并要求每位参与者恰好有 12 题。H3 的正式模型、次要指标和探索性分析见 `H3_MEASUREMENT_V10_ZH.md`。

## 版本规则

任何会改变参与者所见文字、答案选项、资料内容或交互方式的修改，都必须同时提升：

1. `data/stimuli.js` 的 `STIMULUS_SET`
2. `config.js` 的 `stimulusSet`
3. Supabase 迁移中的版本约束
4. 本地存储 key 所使用的版本
5. 研究者指南中冻结的回响任务号

不同版本的数据不得直接合并。
