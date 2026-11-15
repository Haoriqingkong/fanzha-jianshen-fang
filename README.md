# 反诈健身房

一个 3 分钟、免登录的防骗练习 H5。三个真实骗局剧本，每个 6 轮对话；每轮做一次选择，结束后生成分数、风险等级、关键选择复盘、5 条随身清单，并可以追问 AI 教练。

参赛：AI 青年行 · 2026 高校好事计划（中国光华科技基金会主办）。

## 在线体验

https://fanzha-jianshen-fang-2026.netlify.app/

Netlify 正式版：三个剧本、报告、清单、真 AI 教练、匿名事件都能用。AI 由 Netlify Functions 2.0 + AI Gateway 调用，默认 `gpt-4.1-mini`；网关失败时自动走本地模板。

备用静态版：https://haoriqingkong.github.io/fanzha-jianshen-fang/ （没有 `/api`，教练走本地模板，事件不记录）。

## 目录

    产品/
      index.html        首页 / 游戏 / 报告三屏
      styles.css        移动端样式
      scenarios.js      3 个剧本数据（可直接加剧本）
      app.js            流程、计分、报告、教练、埋点
      privacy.html      隐私说明
      favicon.svg
      netlify.toml      Netlify 静态发布 + Functions 配置
      netlify/functions/coach.mts   AI 教练（Functions 2.0 + AI Gateway）
      netlify/functions/event.mts   匿名事件（白名单字段）
      api/coach.js      Vercel 旧版，保留作海外备选
      api/event.js      Vercel 旧版，保留作海外备选
      vercel.json       Vercel 旧配置

## 本地预览

静态页面可以直接打开 index.html，或用任意静态服务器：

    cd 产品
    python -m http.server 8080

打开 http://localhost:8080 。此时 /api/coach 和 /api/event 不存在，教练会自动使用本地模板，事件静默失败，不影响训练。

如果要连 Functions 一起调试，安装 Netlify CLI 后：

    cd 产品
    netlify dev

需要先 `netlify login` 并 `netlify link` 到站点。AI Gateway 变量只在 Netlify 部署环境注入，本地没有时会走 fallback。

## 部署到 Netlify（当前线上方式）

当前线上用 CLI 部署：静态文件先集中到 `_deploy`，再和 `netlify/functions` 一起上传。

    cd 产品
    mkdir -p _deploy
    cp index.html app.js styles.css scenarios.js favicon.svg privacy.html _deploy/
    netlify deploy --prod --dir=_deploy --functions=netlify/functions --no-build

首次使用先 `netlify login`，在站点目录执行 `netlify link` 选择 `fanzha-jianshen-fang-2026`。部署后用无痕窗口打开站点根路径，完整走一遍三个剧本，并问 AI 教练一个剧本外的问题。

不要提交 `_deploy`、`.netlify`、截图等临时文件（`.gitignore` 已排除）。

### AI Gateway

`coach.mts` 读取 Netlify 自动注入的 `OPENAI_BASE_URL` 和 `OPENAI_API_KEY`，不需要手动配模型 key。可选 `AI_MODEL` 覆盖默认模型；模型顺序为 `AI_MODEL` → `gpt-4.1-mini` → `gpt-4o-mini` → `gpt-5-mini`，全部失败返回 `source:"fallback"`。

### 可选环境变量

    FEISHU_WEBHOOK_URL   飞书群自定义机器人 webhook
    EVENT_WEBHOOK_URL    任意接收 JSON 的 webhook；与飞书二选一

事件默认只写 Netlify Functions 日志，不接数据库。

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

网关未配置、上游超时或报错时返回 source 为 fallback 的本地模板回答。

POST /api/event

请求字段：event、sessionId、ts、scenarioId、score、round、rounds、questionLength。接口只保留白名单字段，不接收问题正文；写 Netlify Functions 日志，可选转发飞书或自建 webhook，始终返回 204。

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
- AI 教练会把问题正文、剧本标题、分数、风险和最近选择发给模型服务；网关不可用时不外发，走本地模板。
- 详见 privacy.html。

## 上线前检查

- 三个剧本都能从首页进入，六轮后出报告。
- 报告分数、风险等级、关键选择、清单、AI 教练都正常。
- 手机宽度 360—430px 下不横向滚动，选项可点。
- 无痕窗口打开不需要登录；Q8 链接可直接体验。
- 真实诈骗提示可见：96110 / 110。
- 问一个剧本外的问题（如“游戏账号被骗怎么办”），确认返回 source 为 ai；断网/网关失败时确认走 fallback 不报错。
- 如果配了飞书 webhook，完成一次训练确认群里收到事件；没配时确认 Functions 日志有 complete。

## 说明

这是参赛作品，不是官方反诈平台。所有对话均为模拟，不构成法律或投资建议；真实诈骗请拨 96110 或 110。
