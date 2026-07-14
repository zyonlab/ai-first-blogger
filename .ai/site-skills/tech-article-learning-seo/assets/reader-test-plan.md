# Target reader test plan and report

> 不得生成虚构参与者、反馈、完成率或访谈语句。没有真实测试时，将状态保持为 `not_run` 或 `self_check_only`。

## 测试契约

```yaml
article: ""
article_version: ""
reader_level: "absolute_beginner | beginner_engineer | intermediate | expert"
reader_profile: ""
test_status: "not_run | self_check_only | pilot_run | target_reader_passed | needs_revision"
test_date: ""
facilitator: ""
participant_count: 0
recruitment_notes: ""
conflicts_or_incentives: ""
```

## 预设验收标准

在测试前填写，按文章目标定制：

```yaml
acceptance:
  required_recall_points: []
  maximum_critical_misconceptions: 0
  transfer_task_success: ""
  action_task_success: ""
  maximum_unexplained_core_terms: 0
  time_target: ""
```

## 测试任务

| ID | 任务 | 验证什么 | 不提供的提示 | 通过条件 |
|---|---|---|---|---|
| T1 | 60 秒复述全文核心路径 | 是否形成全貌 | 不看原文 |  |
| T2 | 用自己的例子解释核心机制 | 是否能脱离原句 | 不给术语列表 |  |
| T3 | 回答一个未在正文直接出现的迁移问题 | 是否理解因果关系 | 不指出答案所在章节 |  |
| T4 | 判断常见误解并解释理由 | 是否修复错误模型 | 只给情景 |  |
| T5 | 完成一个操作、验证或决策任务 | 是否能行动 | 仅提供文章本身 |  |

## 逐参与者观察

| 参与者匿名 ID | 背景是否匹配 | 完成时间 | 需要提示 | 关键误解 | 卡住位置 | 任务结果 | 自信度 | 备注 |
|---|---|---:|---|---|---|---|---:|---|
|  |  |  |  |  |  |  |  |  |

不要收集不必要的个人信息。需要引用原话时，取得适当同意并去标识化。

## 误解矩阵

| 预期误解 | 测试题 | 出现人数 | 原文诱因 | 修复动作 |
|---|---|---:|---|---|
|  |  |  |  |  |

## 结果汇总

```yaml
results:
  recall_passed: 0
  transfer_passed: 0
  action_passed: 0
  critical_misconceptions: []
  unexplained_terms: []
  common_stop_points: []
  acceptance_met: false
```

## 修改记录

| 问题 | 严重度 | 修改位置 | 修改方式 | 复测结果 |
|---|---|---|---|---|
|  |  |  |  |  |

## 最终声明

```yaml
final_status: "not_run | self_check_only | pilot_run | target_reader_passed | needs_revision"
validated_scope: ""
not_validated: []
report_owner: ""
```

对外只描述实际完成的测试范围。例如：“由 3 名符合画像的后端初学者完成小规模试读，均能复述主流程；迁移题仍有 1 人混淆训练与推理。”不要写成“所有小白都能看懂”。
