"use strict";

async function post(url, payload) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 4000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  var body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { body = null; }
  }
  if (!body || typeof body !== "object") {
    res.statusCode = 400;
    res.end();
    return;
  }
  var allowed = ["event", "sessionId", "ts", "scenarioId", "score", "round", "rounds", "source", "questionLength"];
  var data = {};
  allowed.forEach(function (key) {
    if (body[key] != null) data[key] = body[key];
  });
  data.event = String(data.event || "unknown").slice(0, 32);
  if (["start", "round", "complete", "share", "ask"].indexOf(data.event) < 0) {
    res.statusCode = 204;
    res.end();
    return;
  }
  data.sessionId = String(data.sessionId || "").slice(0, 64);
  data.ts = Number(data.ts) || Date.now();
  if (data.scenarioId) data.scenarioId = String(data.scenarioId).slice(0, 40);
  if (data.score != null) data.score = Math.max(0, Math.min(100, Number(data.score) || 0));
  if (data.questionLength != null) data.questionLength = Math.max(0, Math.min(200, Number(data.questionLength) || 0));

  var stamp = "";
  try { stamp = new Date(data.ts).toISOString(); } catch (error) { stamp = String(data.ts); }
  var text = [
    "【反诈健身房】" + data.event,
    "场景：" + (data.scenarioId || "-"),
    "分数：" + (data.score == null ? "-" : data.score),
    "轮次：" + (data.rounds || data.round || "-"),
    "会话：" + data.sessionId,
    "时间：" + stamp
  ].join("\n");

  var feishu = process.env.FEISHU_WEBHOOK_URL || "";
  var generic = process.env.EVENT_WEBHOOK_URL || "";
  try {
    if (feishu) {
      await post(feishu, { msg_type: "text", content: { text: text } });
    } else if (generic) {
      await post(generic, data);
    }
  } catch (error) {}
  res.statusCode = 204;
  res.end();
};