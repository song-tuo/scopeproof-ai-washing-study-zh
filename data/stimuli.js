export const STIMULUS_SET = "study12-zh-cn-v0.9";

export const CLAIMS = [
  {
    id: "P-S-01",
    product: "票据助手",
    type: "performance",
    status: "supported",
    coverage: 1,
    claim: "票据助手可以从五种指定的发票模板中提取各项内容，准确率达到 97%。",
    slots: [
      { id: "capability", label: "它要做什么", value: "提取发票中的各项内容", state: "covered" },
      { id: "object", label: "用在什么内容上", value: "五种指定的发票模板", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "使用票据助手 4.2 版本，并采用相同的批量处理设置", state: "covered" },
      { id: "metric_scope", label: "数字与说法范围", value: "每个字段的准确率达到 97%", state: "covered" }
    ],
    evidence: [
      { id: "E1", source: "独立测试", kind: "与商家无关的机构", relation: "supports", text: "一家与商家无关的机构，用指定的五种发票模板测试了每个字段的提取准确率，结果是 97.2%。报告还列出了各类字段的错误，并说明测试样本是怎样选出来的。" },
      { id: "E2", source: "产品技术说明", kind: "商家文件", relation: "supports", text: "商家的技术说明列出了五种可以使用的发票模板，也写明了每种模板会提取哪些内容。" },
      { id: "E3", source: "系统运行记录", kind: "系统记录", relation: "supports", text: "运行记录写明，测试使用的是票据助手 4.2 版本，以及当时采用的批量处理设置。" }
    ],
    options: [
      { id: "capability", text: "它是否能提取发票中的各项内容" },
      { id: "object", text: "测试是否包括这五种发票模板" },
      { id: "condition", text: "测试是否使用 4.2 版本和相同的批量设置" },
      { id: "metric_scope", text: "每个字段的准确率是否达到 97%" }
    ]
  },
  {
    id: "P-S-04",
    product: "写作助手",
    type: "performance",
    status: "supported",
    coverage: 1,
    claim: "写作助手可以找出被动句。在说明文件列出的每一种英文商务文章中，准确率都达到 94%。",
    slots: [
      { id: "capability", label: "它要做什么", value: "找出文章里的被动句", state: "covered" },
      { id: "object", label: "用在什么内容上", value: "说明文件列出的每一种英文商务文章", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "使用接受测试的那个语法模型版本", state: "covered" },
      { id: "metric_scope", label: "数字与说法范围", value: "每一种文章的准确率都达到 94%", state: "covered" }
    ],
    evidence: [
      { id: "E1", source: "独立测试", kind: "与商家无关的机构", relation: "supports", text: "一家与商家无关的机构测试了说明文件列出的每一种英文商务文章。结果显示，每一种文章的被动句识别准确率都是 94%。报告公开了人工核对规则，也记录了有分歧的地方怎样处理。" },
      { id: "E2", source: "产品技术说明", kind: "商家文件", relation: "supports", text: "商家的技术说明逐一列出了所有接受测试的商务文章类型，也说明这些文章从哪里取得。" },
      { id: "E3", source: "系统运行记录", kind: "系统记录", relation: "supports", text: "测试记录写明了当时使用的具体语法模型版本。" }
    ],
    options: [
      { id: "capability", text: "它是否能找出被动句" },
      { id: "object", text: "测试是否包括说明文件列出的每一种文章" },
      { id: "condition", text: "测试是否使用同一个语法模型版本" },
      { id: "metric_scope", text: "每一种文章的准确率是否都达到 94%" }
    ]
  },
  {
    id: "A-S-01",
    product: "会议助手",
    type: "automation",
    status: "supported",
    coverage: 1,
    claim: "得到您的批准后，会议助手会自动创建您选中的后续任务。",
    slots: [
      { id: "capability", label: "它要做什么", value: "创建会议后的待办任务", state: "covered" },
      { id: "object", label: "用在什么内容上", value: "把您选中的任务发送到指定的办公软件", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "创建前先得到批准；发送失败时交给工作人员处理", state: "covered" },
      { id: "metric_scope", label: "数字与说法范围", value: "只创建已经获批并被选中的任务", state: "covered" }
    ],
    evidence: [
      { id: "E1", source: "产品技术说明", kind: "商家文件", relation: "supports", text: "商家的流程说明介绍了怎样把任务发送到指定的办公软件。说明还写明，每个任务在创建前都要先得到用户批准。" },
      { id: "E2", source: "系统运行记录", kind: "系统记录", relation: "supports", text: "一份检查记录显示，20 项获批任务已经创建。另有 6 项没有获批，只保留为草稿，没有发送到其他软件。记录还写明，发送失败时任务会交给哪个工作人员处理。" }
    ],
    options: [
      { id: "capability", text: "它是否会创建后续任务" },
      { id: "object", text: "它是否会把选中的任务发送到指定软件" },
      { id: "condition", text: "它是否会先等用户批准，并在失败时交给工作人员" },
      { id: "metric_scope", text: "它是否只创建已经获批并被选中的任务" }
    ]
  },
  {
    id: "P-R-01",
    product: "会议助手",
    type: "performance",
    status: "refuted",
    coverage: 0.75,
    claim: "会议助手生成的会议文字记录，比每一个主要竞争产品都更准确。",
    slots: [
      { id: "capability", label: "它要做什么", value: "生成准确的会议文字记录", state: "covered" },
      { id: "object", label: "用在什么内容上", value: "接受测试的会议录音", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "比较测试中列出的各个语音转文字版本", state: "covered" },
      { id: "metric_scope", label: "数字与说法范围", value: "比每一个主要竞争产品都更准确", state: "contradicted" }
    ],
    evidence: [
      { id: "E1", source: "独立测试", kind: "与商家无关的机构", relation: "contradicts", text: "一家与商家无关的机构比较了五个语音转文字系统，会议助手排在第三名。它的文字错误比两个竞争产品更多。测试也没有找到任何一种设置，能让它在这五个系统中排第一。" },
      { id: "E2", source: "产品技术说明", kind: "商家文件", relation: "supports", text: "商家的技术说明介绍了接受测试的会议录音，以及录音时的声音条件。" },
      { id: "E3", source: "系统运行记录", kind: "系统记录", relation: "supports", text: "系统运行记录写明了参加比较的各个语音转文字产品版本。" }
    ],
    options: [
      { id: "capability", text: "它生成的会议文字是否准确" },
      { id: "object", text: "测试是否使用同一批会议录音" },
      { id: "condition", text: "比较时是否使用这些产品的对应版本" },
      { id: "metric_scope", text: "它是否比每一个主要竞争产品都准确" }
    ]
  },
  {
    id: "A-R-02",
    product: "招聘助手",
    type: "automation",
    status: "refuted",
    coverage: 0.75,
    claim: "招聘助手给求职者排好名次后，从来不会有人查看这些排名。",
    slots: [
      { id: "capability", label: "它要做什么", value: "给求职者排名", state: "covered" },
      { id: "object", label: "用在什么内容上", value: "系统分批生成的求职者排名", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "质量检查人员每天都会查看", state: "covered" },
      { id: "metric_scope", label: "数字与说法范围", value: "任何时候都没有人查看", state: "contradicted" }
    ],
    evidence: [
      { id: "E1", source: "产品操作手册", kind: "商家文件", relation: "contradicts", text: "公开的操作手册规定，质量检查人员每天都要查看求职者排名。手册也写明了这些排名会放在哪个待检查清单里。" },
      { id: "E2", source: "系统运行记录", kind: "系统记录", relation: "supports", text: "系统记录显示，每一批求职者排名生成后，都留有分析人员打开并查看的记录。" }
    ],
    options: [
      { id: "capability", text: "它是否会给求职者排名" },
      { id: "object", text: "测试是否包括系统分批生成的排名" },
      { id: "condition", text: "质量检查人员是否每天查看这些排名" },
      { id: "metric_scope", text: "这些排名是否从来没有人查看" }
    ]
  },
  {
    id: "A-R-03",
    product: "写作助手",
    type: "automation",
    status: "refuted",
    coverage: 0.75,
    claim: "内容获批以后，写作助手会全自动发布，不需要编辑再次确认。",
    slots: [
      { id: "capability", label: "它要做什么", value: "发布已经获批的内容", state: "covered" },
      { id: "object", label: "用在什么内容上", value: "发布流程里已经获批的内容", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "发布前仍要由编辑确认", state: "covered" },
      { id: "metric_scope", label: "数字与说法范围", value: "获批后完全自动发布，不再需要人确认", state: "contradicted" }
    ],
    evidence: [
      { id: "E1", source: "产品宣传页", kind: "商家网页", relation: "supports", text: "商家的宣传页写道，内容获批以后，发布流程会完全自动进行。" },
      { id: "E2", source: "产品技术说明", kind: "商家文件", relation: "contradicts", text: "商家的技术说明要求，内容发布前必须由编辑再次确认。说明中还展示了编辑会看到的确认窗口。" },
      { id: "E3", source: "系统运行记录", kind: "系统记录", relation: "supports", text: "系统记录显示，每一次发布之前，都会先发生一次由编辑完成的确认。" }
    ],
    options: [
      { id: "capability", text: "它是否能发布已经获批的内容" },
      { id: "object", text: "测试是否包括发布流程里已经获批的内容" },
      { id: "condition", text: "每次发布前是否仍要由编辑确认" },
      { id: "metric_scope", text: "内容获批后是否完全自动发布" }
    ]
  },
  {
    id: "P-I-01",
    product: "写作助手",
    type: "performance",
    status: "insufficient",
    coverage: 0.25,
    claim: "写作助手可以让专业写作者的编辑时间减少一半。",
    slots: [
      { id: "capability", label: "它要做什么", value: "减少编辑所需时间", state: "missing" },
      { id: "object", label: "用在什么内容上", value: "专业写作者的编辑工作", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "写作者开始使用工具前后的具体工作条件", state: "missing" },
      { id: "metric_scope", label: "数字与说法范围", value: "编辑时间减少 50%", state: "missing" }
    ],
    evidence: [
      { id: "E1", source: "产品案例介绍", kind: "商家网页", relation: "relevant", text: "商家的案例介绍说，8 名志愿者使用这项工具以后，完成编辑工作的速度变快了。页面没有说明具体快了多少，也没有说明怎样计算。" },
      { id: "E2", source: "产品技术说明", kind: "商家文件", relation: "supports", text: "商家的技术说明写明，这项编辑工具面向专业写作者。" }
    ],
    options: [
      { id: "capability", text: "使用工具后，编辑时间是否减少" },
      { id: "object", text: "参加测试的人是否都是专业写作者" },
      { id: "condition", text: "使用工具前后，工作任务和条件是否相同" },
      { id: "metric_scope", text: "编辑时间是否减少了 50%" }
    ]
  },
  {
    id: "P-I-02",
    product: "票据助手",
    type: "performance",
    status: "insufficient",
    coverage: 0.5,
    claim: "票据助手从商务文件中提取内容的准确率达到 99%。",
    slots: [
      { id: "capability", label: "它要做什么", value: "从商务文件中正确提取内容", state: "missing" },
      { id: "object", label: "用在什么内容上", value: "商务文件", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "当前正式提供给用户的版本", state: "covered" },
      { id: "metric_scope", label: "数字与说法范围", value: "准确率达到 99%，并说明一共测试了多少项", state: "missing" }
    ],
    evidence: [
      { id: "E1", source: "数据页面截图", kind: "商家网页", relation: "relevant", text: "商家提供了一张带日期的数据页面截图，上面显示 99%。截图没有说明这个数字怎样计算，也没有写一共测试了多少份文件或多少项内容。" },
      { id: "E2", source: "产品技术说明", kind: "商家文件", relation: "supports", text: "商家的技术说明写道，票据助手可以从商务文件中提取内容。" },
      { id: "E3", source: "系统运行记录", kind: "系统记录", relation: "supports", text: "正式运行记录显示，截图反映的是当前提供给用户的版本。测量期间没有使用其他版本。" }
    ],
    options: [
      { id: "capability", text: "它是否能正确提取商务文件中的内容" },
      { id: "object", text: "测试是否使用各种常见的商务文件" },
      { id: "condition", text: "测试是否使用当前正式提供给用户的版本" },
      { id: "metric_scope", text: "准确率是否达到 99%，以及一共测试了多少项" }
    ]
  },
  {
    id: "A-I-01",
    product: "招聘助手",
    type: "automation",
    status: "insufficient",
    coverage: 0.5,
    claim: "招聘助手筛选普通申请时，不需要招聘人员查看。",
    slots: [
      { id: "capability", label: "它要做什么", value: "自动筛选申请", state: "covered" },
      { id: "object", label: "用在什么内容上", value: "被列为普通类别的申请", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "什么情况要由招聘人员查看，什么情况要交给人处理", state: "missing" },
      { id: "metric_scope", label: "数字与说法范围", value: "筛选普通申请时完全不由招聘人员查看", state: "missing" }
    ],
    evidence: [
      { id: "E1", source: "产品技术说明", kind: "商家文件", relation: "supports", text: "商家的技术说明介绍了怎样自动给申请评分，也列出了哪些申请会被归为普通类别。" },
      { id: "E2", source: "产品宣传页", kind: "商家网页", relation: "relevant", text: "商家的宣传页写道，处理普通申请时，系统会跳过招聘人员查看这一步。页面没有提供独立测试或系统记录。" }
    ],
    options: [
      { id: "capability", text: "它是否能自动筛选申请" },
      { id: "object", text: "测试是否包括被列为普通类别的申请" },
      { id: "condition", text: "是否有申请必须由招聘人员查看或接手" },
      { id: "metric_scope", text: "普通申请是否完全不由招聘人员查看" }
    ]
  },
  {
    id: "P-F-01",
    product: "票据助手",
    type: "performance",
    status: "insufficient",
    coverage: 0.25,
    claim: "票据助手不需要事先设置，就能处理任何文件版式。",
    slots: [
      { id: "capability", label: "它要做什么", value: "正确处理不同的文件版式", state: "missing" },
      { id: "object", label: "用在什么内容上", value: "产品说明中列出的文件格式", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "是否需要事先设置或调整", state: "missing" },
      { id: "metric_scope", label: "数字与说法范围", value: "无需设置，并且能处理任何版式", state: "missing" }
    ],
    evidence: [
      { id: "E1", source: "产品宣传页", kind: "商家网页", relation: "relevant", text: "商家的宣传页说，文件版式不会影响处理结果，并展示了两个处理例子。页面没有提供覆盖各种版式的独立测试。" },
      { id: "E2", source: "产品技术说明", kind: "商家文件", relation: "supports", text: "商家的技术说明列出了票据助手可以接收的文件格式。" }
    ],
    options: [
      { id: "capability", text: "它是否能正确处理不同版式" },
      { id: "object", text: "测试是否包括产品可以接收的各种文件格式" },
      { id: "condition", text: "处理前是否需要人工设置或调整" },
      { id: "metric_scope", text: "它是否无需设置就能处理任何版式" }
    ]
  },
  {
    id: "A-F-01",
    product: "会议助手",
    type: "automation",
    status: "insufficient",
    coverage: 0.25,
    claim: "会议助手安装好以后，完全不需要任何人监督。",
    slots: [
      { id: "capability", label: "它要做什么", value: "安装后能持续正常工作", state: "missing" },
      { id: "object", label: "用在什么内容上", value: "安装后的全部工作流程", state: "missing" },
      { id: "condition", label: "在什么情况下", value: "安装步骤和授予的使用权限", state: "covered" },
      { id: "metric_scope", label: "数字与说法范围", value: "运行时完全不需要人查看、接手或处理故障", state: "missing" }
    ],
    evidence: [
      { id: "E1", source: "产品安装指南", kind: "商家文件", relation: "supports", text: "商家的安装指南记录了安装步骤，也写明安装时要授予哪些使用权限。它没有说明安装完成后的日常运行情况。" },
      { id: "E2", source: "产品宣传页", kind: "商家网页", relation: "relevant", text: "商家的宣传页写道，会议助手安装好以后，不再需要人工监督。页面没有提供独立测试或运行记录。" }
    ],
    options: [
      { id: "capability", text: "安装后，它是否能持续正常工作" },
      { id: "object", text: "测试是否包括安装后的全部工作流程" },
      { id: "condition", text: "安装步骤和使用权限是否符合说明" },
      { id: "metric_scope", text: "运行时是否完全不需要人监督" }
    ]
  },
  {
    id: "A-F-02",
    product: "票据助手",
    type: "automation",
    status: "insufficient",
    coverage: 0.25,
    claim: "所有文件异常都由票据助手自动处理，不需要工作人员接手。",
    slots: [
      { id: "capability", label: "它要做什么", value: "发现并处理文件异常", state: "missing" },
      { id: "object", label: "用在什么内容上", value: "产品能够读入的文件类别", state: "covered" },
      { id: "condition", label: "在什么情况下", value: "自动处理失败后，怎样交给工作人员", state: "missing" },
      { id: "metric_scope", label: "数字与说法范围", value: "所有异常都自动处理，完全不需要人接手", state: "missing" }
    ],
    evidence: [
      { id: "E1", source: "产品宣传页", kind: "商家网页", relation: "relevant", text: "商家的宣传页写道，票据助手会用自动流程处理文件异常。页面没有说明哪些异常能自动处理，也没有提供运行记录。" },
      { id: "E2", source: "产品技术说明", kind: "商家文件", relation: "supports", text: "商家的技术说明列出了票据助手能够读入系统的文件类别。" }
    ],
    options: [
      { id: "capability", text: "它是否能发现并处理文件异常" },
      { id: "object", text: "测试是否包括产品能够读入的各类文件" },
      { id: "condition", text: "自动处理失败后，是否必须交给工作人员" },
      { id: "metric_scope", text: "所有异常是否都能自动处理" }
    ]
  }
];
