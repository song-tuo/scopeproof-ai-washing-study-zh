# ScopeProof 人工智能产品宣传资料判断实验

这是 ScopeProof 的全新中文在线实验项目。参与者看到 12 条虚构的人工智能产品宣传，并根据页面公开提供的资料作答。

## 项目特点

- **自然中文：** 参与者界面不使用 `coverage`、`counterfactual`、`claim slot` 等研究术语。
- **老年友好：** 正文 18px、主要按钮至少 56px、清晰焦点、滑杆未操作时不能提交。
- **电脑与手机：** 桌面端并排显示资料和问题；手机端按阅读顺序单列显示。
- **两种实验条件：** 普通资料版与 ScopeProof 分项资料版。
- **集合式 H3：** 参与者多选所有尚未得到资料支持的宣传要点，再做一个不计对错的优先核查选择。
- **安全存储：** GitHub Pages 只负责网页；Supabase 通过带会话令牌的 RPC 收集数据，参与者不能直接读取数据表。
- **隐藏研究标签：** 网页源码不包含声明真假或正确购买行动；H3 标准状态由服务器按题号再次生成并保存。

页面风格参考 [Acme HTML Style](https://github.com/kaiychen9/acme-html-style/blob/main/README_zh.md)：象牙白底、陶土色强调、衬线标题、1.5px 边框和白色内容面板。为了照顾老年参与者，本项目把原规范的紧凑控件进一步放大。

## 本地预览

```bash
npm install
npm run serve
```

打开：

```text
http://127.0.0.1:4173/?preview=1&condition=scopeproof&participant=TEST-S
```

`preview=1` 不写入 Supabase，只用于研究者检查。

## 验证

```bash
npm test
npm run test:ui
npm run test:cloud
npm run test:production
```

- `npm test`：检查 12 条刺激、语言、隐藏答案、响应式样式和数据库权限。
- `npm run test:ui`：用 Chrome 检查桌面普通版、桌面分项版和 390px 手机版。
- `npm run test:cloud`：使用公开 publishable key 完成 12 题云端测试，并确认匿名用户不能直接读表。
- `npm run test:production`：从正式 GitHub Pages 完成 12 题并取得云端完成编号。

## 目录

```text
.
├── index.html                 参与者页面
├── styles.css                ACME 风格与响应式样式
├── app.js                    答题、恢复和云端保存逻辑
├── data/stimuli.js           不含隐藏答案的公开刺激
├── supabase/                 数据表、RLS 和 RPC 迁移
├── tools/generate_links.py   生成平衡参与者链接
├── tools/prepare_h3_analysis.py 生成槽位级 H3 分析表
├── tests/                    静态、浏览器和云端测试
└── private/                  本地答案键，已被 Git 忽略
```

正式招募、数据导出和版本冻结步骤见 `RESEARCHER_GUIDE_ZH.md`；H3 的模型与计分口径见 `H3_MEASUREMENT_V07_ZH.md`。
