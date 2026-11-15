type ChatMessage = { role: "system" | "user"; content: string };

const CORS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

function fallback(question: string, scenarioTitle: string, score: number, risk: string, history: any[]) {
  const q = String(question || "").toLowerCase();
  const last = Array.isArray(history) && history.length ? history[history.length - 1] : null;
  const tail = last && last.choice ? " 你最后选了“" + String(last.choice).slice(0, 80) + "”。" : "";
  if (q.includes("转账") || q.includes("转钱") || q.includes("付钱") || q.includes("汇款")) {
    return "先停止转账。保留聊天记录、转账凭证和对方账号，立刻拨 96110 或 110。不要按对方要求做“资金验证”“解冻账户”。" + tail;
  }
  if (q.includes("屏幕") || q.includes("共享")) {
    return "不要开屏幕共享。共享后对方能看到你的验证码、银行 App 和余额。直接说“我不会操作”，挂断，然后拨 96110 核实。";
  }
  if (q.includes("爸妈") || q.includes("父母") || q.includes("家人") || q.includes("老人")) {
    return "给爸妈一个简单动作：任何免费体检、专家诊断、要银行卡的，先给你打电话。把这次报告发给他们，一起重练一遍。";
  }
  if (q.includes("公检法") || q.includes("警察") || q.includes("安全账户") || q.includes("洗钱")) {
    return "公检法不会电话办案，没有“安全账户”，也不会让你转账或共享屏幕。挂断后拨 110，或去最近的派出所当面核实。";
  }
  if (q.includes("刷单") || q.includes("兼职") || q.includes("返利")) {
    return "所有“先垫付、后返利”的刷单都是诈骗。不要继续做任务，不要补单，保存聊天和转账记录，拨 96110 报警。";
  }
  if (q.includes("客服") || q.includes("快递") || q.includes("退款") || q.includes("理赔")) {
    return "不要点对方发的链接，不要加私人微信/QQ，不要共享屏幕。挂断后从官方 App 或官方客服电话核实订单，退款不需要你先交保证金。";
  }
  if (q.includes("贷款") || q.includes("校园贷") || q.includes("征信")) {
    return "先交会员费、解冻费、保证金的贷款都是诈骗。不要转账，不要提供验证码，保留证据后拨 96110 或 110。";
  }
  if (q.includes("网恋") || q.includes("恋爱") || q.includes("投资") || q.includes("博彩")) {
    return "网恋对象带你投资、买币、博彩，基本都是“杀猪盘”。不要追加投入，立刻停止转账，保存聊天和平台信息，拨 110 报警。";
  }
  if (q.includes("保健品") || q.includes("体检")) {
    return "先问三件事：医院名称、执业医师、产品批号。答不上来就走。任何“当场诊断 + 当场付款”的免费体检，都按推销处理。";
  }
  return "先挂断，不转账，不共享屏幕，不提供验证码，然后拨 96110 或 110 核实。这次你练的是《" +
    String(scenarioTitle || "防骗剧本") + "》，得分 " + score + "（" + String(risk || "待评估") + "）。" + tail;
}

async function callModel(endpoint: string, key: string, model: string, messages: ChatMessage[], timeoutMs: number) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, detail: text.slice(0, 240) };
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = null; }
    let answer = data?.choices?.[0]?.message?.content;
    if (Array.isArray(answer)) answer = answer.map((part: any) => part?.text || "").join("");
    if (!answer) return { ok: false, status: 502, detail: "empty_answer" };
    return { ok: true, answer: String(answer).trim().slice(0, 1600) };
  } catch (error: any) {
    return { ok: false, status: 0, detail: String(error?.message || error).slice(0, 200) };
  }
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: CORS });

  let body: any = null;
  try { body = await req.json(); } catch { body = null; }
  if (!body || typeof body !== "object") return Response.json({ error: "bad_request" }, { status: 400, headers: CORS });

  const question = String(body.question || "").trim().slice(0, 300);
  if (!question) return Response.json({ error: "question_required" }, { status: 400, headers: CORS });
  const scenarioTitle = String(body.scenarioTitle || "").slice(0, 80);
  const score = Math.max(0, Math.min(100, Number(body.score) || 0));
  const risk = String(body.risk || "").slice(0, 40);
  const history = Array.isArray(body.history) ? body.history.slice(0, 6).map((item: any) => ({
    round: Number(item.round) || 0,
    tactic: String(item.tactic || "").slice(0, 40),
    choice: String(item.choice || "").slice(0, 100),
    delta: Number(item.delta) || 0
  })) : [];

  const fallbackAnswer = fallback(question, scenarioTitle, score, risk, history);
  const base = String(process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.OPENAI_API_KEY || "");
  if (!base || !key) {
    return Response.json({ answer: fallbackAnswer, source: "fallback", reason: "gateway_not_configured" }, { headers: CORS });
  }
  const endpoint = base.includes("/chat/completions") ? base : base + "/chat/completions";
  const system = [
    "你是「反诈健身房」的 AI 教练，面向中国高校学生和家庭。你可以回答：",
    "1. 各类电信网络诈骗（刷单、冒充客服、公检法、杀猪盘、校园贷、游戏交易、机票退改签、AI 换脸等）的识别、止损、取证、报警；",
    "2. 本次剧本里的话术、心理操控和选择复盘；",
    "3. 怎么跟家人沟通、帮老人设置防护；",
    "4. 一般的安全上网与隐私保护。",
    "规则：",
    "- 不索要、不重复用户的真实姓名、电话、身份证、银行卡、验证码、住址。",
    "- 不教诈骗，不提供规避监管、攻击他人或洗钱的方法。",
    "- 先给一句结论，再给 1—3 个可执行动作；中文，200 字以内。",
    "- 不确定时，明确建议拨打 96110 或 110 核实。",
    "- 不承诺追回损失，不提供法律意见；不闲聊与安全无关的话题。"
  ].join("\n");
  const recent = history.map((item: any) => "第" + item.round + "轮/" + item.tactic + "/" + item.choice + "/" + item.delta).join("；");
  const user = "剧本：" + scenarioTitle + "\n得分：" + score + "\n风险：" + risk + "\n最近选择：" + (recent || "无") + "\n问题：" + question;
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user }
  ];

  const models: string[] = [];
  const push = (m: string) => { if (m && !models.includes(m)) models.push(m); };
  push(String(process.env.AI_MODEL || ""));
  ["gpt-4.1-mini", "gpt-4o-mini", "gpt-5-mini"].forEach(push);

  const deadline = Date.now() + 11000;
  let lastStatus = 0;
  let lastDetail = "";
  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < 1200) break;
    const result = await callModel(endpoint, key, model, messages, Math.min(remaining, 6500));
    if (result.ok) {
      return Response.json({ answer: result.answer, source: "ai", model }, { headers: CORS });
    }
    lastStatus = result.status || 0;
    lastDetail = result.detail || "";
    console.error("coach upstream", model, lastStatus, lastDetail);
  }
  return Response.json({ answer: fallbackAnswer, source: "fallback", reason: "upstream_failed" }, { headers: CORS });
};

export const config = { path: "/api/coach" };
