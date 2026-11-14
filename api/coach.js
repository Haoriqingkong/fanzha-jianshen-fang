"use strict";

function buildFallback(question, scenarioTitle, score, risk, history) {
  var q = String(question || "").toLowerCase();
  var last = Array.isArray(history) && history.length ? history[history.length - 1] : null;
  var tail = last && last.choice ? " 你最后选了“" + String(last.choice).slice(0, 80) + "”。" : "";
  if (q.indexOf("转账") >= 0 || q.indexOf("转钱") >= 0 || q.indexOf("付钱") >= 0) {
    return "先停止转账。保留聊天记录、转账凭证和对方账号，立刻拨 96110 或 110。不要按对方要求做“资金验证”“解冻账户”。" + tail;
  }
  if (q.indexOf("屏幕") >= 0 || q.indexOf("共享") >= 0) {
    return "不要开屏幕共享。共享后对方能看到你的验证码、银行 App 和余额。直接说“我不会操作”，挂断，然后拨 96110 核实。";
  }
  if (q.indexOf("爸妈") >= 0 || q.indexOf("父母") >= 0 || q.indexOf("家人") >= 0) {
    return "给爸妈一个简单动作：任何免费体检、专家诊断、要银行卡的，先给你打电话。把这次报告发给他们，一起重练一遍。";
  }
  if (q.indexOf("公检法") >= 0 || q.indexOf("警察") >= 0 || q.indexOf("安全账户") >= 0) {
    return "公检法不会电话办案，没有“安全账户”，也不会让你转账或共享屏幕。挂断后拨 110，或去最近的派出所当面核实。";
  }
  if (q.indexOf("保健品") >= 0 || q.indexOf("体检") >= 0) {
    return "先问三件事：医院名称、执业医师、产品批号。答不上来就走。任何“当场诊断 + 当场付款”的免费体检，都按推销处理。";
  }
  return "先挂断，不转账，不共享屏幕，不提供验证码，然后拨 96110 或 110 核实。这次你练的是《" +
    String(scenarioTitle || "防骗剧本") + "》，得分 " + score + "（" + String(risk || "待评估") + "）。" + tail;
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  var body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { body = null; }
  }
  if (!body || typeof body !== "object") {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "bad_request" }));
    return;
  }
  var question = String(body.question || "").trim().slice(0, 120);
  if (!question) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "question_required" }));
    return;
  }
  var scenarioTitle = String(body.scenarioTitle || "").slice(0, 80);
  var score = Math.max(0, Math.min(100, Number(body.score) || 0));
  var risk = String(body.risk || "").slice(0, 40);
  var history = Array.isArray(body.history) ? body.history.slice(0, 6).map(function (item) {
    return {
      round: Number(item.round) || 0,
      tactic: String(item.tactic || "").slice(0, 40),
      choice: String(item.choice || "").slice(0, 100),
      delta: Number(item.delta) || 0
    };
  }) : [];

  var apiKey = process.env.AI_API_KEY || "";
  if (!apiKey) {
    res.statusCode = 200;
    res.end(JSON.stringify({ answer: buildFallback(question, scenarioTitle, score, risk, history), source: "fallback" }));
    return;
  }

  var base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  var endpoint = base.indexOf("/chat/completions") >= 0 ? base : base + "/chat/completions";
  var model = process.env.AI_MODEL || "gpt-4o-mini";
  var system = [
    "你是「反诈健身房」的复盘教练，只回答与防骗、诈骗识别、止损、求助有关的问题。",
    "规则：",
    "1. 不索要、不重复用户的真实姓名、电话、身份证、银行卡、验证码。",
    "2. 不提供诈骗操作细节，不教任何规避监管的方法。",
    "3. 先给一句结论，再给 1—3 个可执行动作。",
    "4. 中文，尽量控制在 120 字以内。",
    "5. 不确定时，明确建议拨打 96110 或 110 核实。",
    "6. 不承诺追回损失，不提供法律意见。"
  ].join("\n");
  var recent = history.map(function (item) {
    return "第" + item.round + "轮/" + item.tactic + "/" + item.choice + "/" + item.delta;
  }).join("；");
  var user = "剧本：" + scenarioTitle + "\n得分：" + score + "\n风险：" + risk + "\n最近选择：" + (recent || "无") + "\n问题：" + question;

  try {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 12000);
    var response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.4,
        max_tokens: 260,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error("upstream_" + response.status);
    var data = await response.json();
    var answer = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!answer) throw new Error("empty_answer");
    res.statusCode = 200;
    res.end(JSON.stringify({ answer: String(answer).trim().slice(0, 800), source: "ai" }));
  } catch (error) {
    res.statusCode = 200;
    res.end(JSON.stringify({ answer: buildFallback(question, scenarioTitle, score, risk, history), source: "fallback" }));
  }
};