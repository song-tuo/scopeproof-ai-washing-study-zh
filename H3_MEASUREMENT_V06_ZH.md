# ScopeProof v0.6：H3 测量与分析规则

## 研究问题

H3 检验 ScopeProof 是否帮助参与者识别一条人工智能产品宣传的证据边界。这里的“尚未得到支持”包含两种情况：

1. 本页资料还不足以支持该要点；
2. 本页资料与该要点不一致。

`missing` 与 `contradicted` 在 H3 中都编码为 `non_covered`。这不是把反证说成缺证，而是检验该宣传要点是否已得到当前资料的支持。

## 参与者任务

每题的第 5 组问题分为两步：

1. **正式 H3：** 多选所有尚未得到本页资料支持的要点。若四项都已得到支持，必须主动选择“这四个要点都已得到本页资料支持”。
2. **探索性问题：** 若第一步选了一项或多项，再从这些项中选择最想优先核查的一项。该题没有标准答案，不计算正确率。

四个槽位使用稳定 ID：`capability`、`object`、`condition`、`metric_scope`。每题的显示顺序由参与编号和题号确定性打乱，并保存为 `h3_option_order`。

## 主要结果

每位参与者产生 `12 × 4 = 48` 个槽位级二元判断：

- `actual_noncovered`：该槽位实际为 `non_covered`；
- `selected_as_noncovered`：参与者是否选中该槽位。

主要模型为槽位级混合效应 logistic 回归：

```text
selected_as_noncovered ~ actual_noncovered * condition
                       + slot_type
                       + verdict_type
                       + trial_order
                       + (1 | participant_id)
                       + (1 | item_id)
```

主要检验项是 `actual_noncovered × condition`。正向交互表示 ScopeProof 提高了参与者区分“已支持”和“未支持”槽位的能力。`slot_type` 用于控制四类槽位的基础出现率差异，尤其是 `metric_scope` 较常处于未支持状态这一已知不平衡。

作为位置效应敏感性检查，可在模型中加入 `option_position`，但不因该检查结果更换主要模型。

## 次要结果

- **Exact-set accuracy：** 所选集合与标准 `non_covered` 集合完全相同。
- **Sensitivity：** 实际未支持的槽位中，被参与者选出的比例。
- **Specificity：** 实际已支持的槽位中，未被参与者误选的比例。
- **Balanced accuracy：** sensitivity 与 specificity 的平均值。某题只有单一类别时，该题不单独计算 balanced accuracy；参与者汇总值仍可计算。

不能只报告 exact-set accuracy，因为多选或漏选一项会使整题归零。也不能只报告总体槽位正确率，因为“全部勾选”和“全部不勾选”会掩盖不同类型的错误。

## 探索性结果

优先核查题只报告：

- 各槽位被优先选择的比例；
- 两种条件是否改变优先核查分布；
- 参与者是否偏好 `metric_scope`；
- 优先选择与最终判断、信心和购买行动的关系。

该题不设唯一正确答案，不参与 H3 accuracy，也不用于排除参与者。

## 数据与版本规则

- 刺激版本：`study12-zh-cn-v0.6`
- H3 答案键版本：`h3-set-v0.6`
- 标准槽位状态由 Supabase RPC 按 `item_id` 写入，不接受客户端自报答案键。
- 客户端和服务器都记录所选集合、选项顺序、优先题候选集合与优先题顺序。
- v0.5 的单选 `counterfactual` 数据不得与 v0.6 H3 合并。

运行分析准备：

```bash
python3 tools/prepare_h3_analysis.py private/responses_v06.csv
```

输出包括 `h3_slot_level.csv`、`h3_item_level.csv`、`h3_priority_exploratory.csv` 和 `h3_participant_summary.csv`。
