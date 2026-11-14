# 反诈健身房

一个 3 分钟、免登录的防骗练习 H5。三个真实骗局剧本，每个 6 轮对话；每轮做一次选择，结束后生成分数、风险等级、关键选择复盘、5 条随身清单，并可以追问 AI 教练。

参赛：AI 青年行 · 2026 高校好事计划（中国光华科技基金会主办）。

## 目录

    产品/
      index.html        首页 / 游戏 / 报告三屏
      styles.css        移动端样式
      scenarios.js      3 个剧本数据（可直接加剧本）
      app.js            流程、计分、报告、教练、埋点
      privacy.html      隐私说明
      favicon.svg
      vercel.json
      api/coach.js      AI 教练（OpenAI 兼容接口，带本地降级）
      api/event.js      匿名事件转发（飞书群机器人 / 自建 webhook）

## 本地预览

静态页面可以直接打开 index.html，或用任意静态服务器：

    cd 产品
    python -m http.server 8080

打开 http://localhost:8080 。此时 /api/coach 和 /api/event 不存在，教练会自动使用本地模板，事件静默失败，不影响训练。

如果要连 API 一起调试，在 产品 目录使用 Vercel CLI：

    cd 产品
    npx vercel dev

## 部署到 Vercel

1. 把整个仓库推到 GitHub。
2. 在 Vercel 新建项目，导入仓库。
3. Root Directory 选择 产品。
4. Framework Preset 选 Other；Build Command 留空；Output Directory 填 .。
5. 在 Settings → Environment Variables 配置下面的变量，然后 Deploy。
6. 部署完成后用无痕窗口打开 https://你的项目.vercel.app ，完整走一遍三个剧本。

### 环境变量

AI 教练（可选；不配也能用本地模板）：

    AI_API_KEY       模型服务密钥
    AI_BASE_URL      OpenAI 兼容地址，例如 https://api.openai.com/v1 或 https://api.deepseek.com/v1
    AI_MODEL         模型名，例如 gpt-4o-mini 或 deepseek-chat

事件统计（可选；不配则只接收 204，不存储）：

    FEISHU_WEBHOOK_URL   飞书群自定义机器人 webhook
    EVENT_WEBHOOK_URL    任意接收 JSON 的 webhook；与飞书二选一

## 接口

POST /api/coach

请求：

    {
      "question": "他让我开屏幕共享，我该怎么回？",
      "scenarioId": "health",
      "scenarioTitle": "免费体检的“专家”",
      "score": 65,
      "risk": "及格，但会犹豫",
      "history": [{ "round": 1, "tactic": "免费诱饵", "choice": "免费的啊？那我明天去看看。", "delta": 0 }]
    }

响应：

    { "answer": "……", "source": "ai" }

没有密钥、上游超时或报错时返回 source 为 fallback 的本地模板回答。

POST /api/event

请求字段：event、sessionId、ts、scenarioId、score、round、rounds、questionLength。接口只保留白名单字段，不接收问题正文，转发到飞书或自建 webhook 后返回 204。

## 加一个剧本

编辑 产品/scenarios.js，复制一个对象，至少保留：

    id, title, subtitle, tag, icon, avatar, persona,
    duration, difficulty, totalRounds, start, tactics,
    advice, coachPresets, nodes

每个 node 是一轮：

    n1: {
      roundTitle: "这一轮的名字",
      tactic: "骗子的招数",
      bot: ["骗子说的话"],
      choices: [
        { text: "你的选择", next: "n2", delta: -20, flag: "标签", better: "更稳的做法", why: "为什么" }
      ]
    }

最后一轮的 choices 把 next 设为 "end"。delta 为负表示高风险选择；报告会按 delta 升序挑出最该回看的三步。

## 数据与隐私

- 不收集姓名、手机号、身份证、银行卡、验证码。
- 本地只存 fg_completed（完成次数/分数/时间）和 fg_checklist（清单勾选）。
- 事件统计只发随机会话 ID、剧本 ID、分数、轮次、时间、提问字数，不含提问正文。
- AI 教练会把问题正文、剧本标题、分数、风险和最近选择发给模型服务；未配置密钥时不外发。
- 详见 privacy.html。

## 上线前检查

- 三个剧本都能从首页进入，六轮后出报告。
- 报告分数、风险等级、关键选择、清单、AI 教练都正常。
- 手机宽度 360—430px 下不横向滚动，选项可点。
- 无痕窗口打开不需要登录；Q8 链接可直接体验。
- 真实诈骗提示可见：96110 / 110。
- 如果配了 AI key，问一个预设问题确认返回 source 为 ai；没有 key 时确认走 fallback 不报错。
- 如果配了飞书 webhook，完成一次训练确认群里收到事件。

## 说明

这是参赛作品，不是官方反诈平台。所有对话均为模拟，不构成法律或投资建议；真实诈骗请拨 96110 或 110。
