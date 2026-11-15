const CORS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

async function post(url: string, payload: any) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000)
    });
  } catch (error: any) {
    console.error("event forward failed", String(error?.message || error));
  }
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: CORS });

  let body: any = null;
  try { body = await req.json(); } catch { body = null; }
  if (!body || typeof body !== "object") return Response.json({ error: "bad_request" }, { status: 400, headers: CORS });

  const allowed = ["event", "sessionId", "ts", "scenarioId", "score", "round", "rounds", "source", "questionLength"];
  const data: any = {};
  for (const key of allowed) if (body[key] != null) data[key] = body[key];
  data.event = String(data.event || "unknown").slice(0, 32);
  if (!["start", "round", "complete", "share", "ask"].includes(data.event)) {
    return new Response(null, { status: 204, headers: CORS });
  }
  data.sessionId = String(data.sessionId || "").slice(0, 64);
  data.ts = Number(data.ts) || Date.now();
  if (data.scenarioId) data.scenarioId = String(data.scenarioId).slice(0, 40);
  if (data.score != null) data.score = Math.max(0, Math.min(100, Number(data.score) || 0));
  if (data.questionLength != null) data.questionLength = Math.max(0, Math.min(300, Number(data.questionLength) || 0));

  let stamp = "";
  try { stamp = new Date(data.ts).toISOString(); } catch { stamp = String(data.ts); }
  const text = [
    "【反诈健身房】" + data.event,
    "场景：" + (data.scenarioId || "-"),
    "分数：" + (data.score == null ? "-" : data.score),
    "轮次：" + (data.rounds || data.round || "-"),
    "会话：" + data.sessionId,
    "时间：" + stamp
  ].join("\n");
  console.log("event", JSON.stringify(data));

  const feishu = process.env.FEISHU_WEBHOOK_URL || "";
  const generic = process.env.EVENT_WEBHOOK_URL || "";
  if (feishu) await post(feishu, { msg_type: "text", content: { text } });
  else if (generic) await post(generic, data);
  return new Response(null, { status: 204, headers: CORS });
};

export const config = { path: "/api/event" };
