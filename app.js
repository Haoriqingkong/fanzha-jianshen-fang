(function () {
  "use strict";

  var SCENARIOS = Array.isArray(window.SCENARIOS) ? window.SCENARIOS : [];
  var RISK_CIRC = 339.292;
  var KEY_COMPLETED = "fg_completed";
  var KEY_CHECKLIST = "fg_checklist";
  var state = {
    scenario: null,
    node: "",
    score: 0,
    history: [],
    flags: [],
    busy: false,
    finished: false,
    sessionId: "",
    lastReport: null,
    coachBusy: false,
    renderToken: 0
  };
  var el = {};
  var toastTimer = null;
  var screenNames = ["home", "game", "report"];

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    var map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) { return map[ch]; });
  }

  function cache() {
    var ids = [
      "start-btn", "home-stats", "scenario-cards", "back-btn",
      "persona-avatar", "persona-name", "round-label", "progress-bar",
      "chat", "choices", "report-scenario", "ring-fg", "score-num",
      "risk-label", "report-summary", "report-rounds", "tactics",
      "key-choices", "advice", "checklist", "coach-chips", "coach-input",
      "coach-send", "coach-answer", "share-btn", "restart-btn", "home-btn",
      "report-home-btn", "toast"
    ];
    ids.forEach(function (id) { el[id] = $(id); });
  }

  function showScreen(name) {
    screenNames.forEach(function (key) {
      var screen = $("screen-" + key);
      if (screen) screen.classList.toggle("active", key === name);
    });
    if (name === "home") {
      renderHomeStats();
      window.scrollTo(0, 0);
    }
  }

  function goHome() {
    state.renderToken += 1;
    state.busy = false;
    state.coachBusy = false;
    showScreen("home");
  }

  function getScenario(id) {
    for (var i = 0; i < SCENARIOS.length; i++) {
      if (SCENARIOS[i].id === id) return SCENARIOS[i];
    }
    return null;
  }

  function renderHomeStats() {
    if (!el["home-stats"]) return;
    var first = SCENARIOS[0];
    var total = SCENARIOS.length;
    var rounds = first && first.totalRounds ? first.totalRounds : 6;
    var done = readCompleted();
    el["home-stats"].innerHTML =
      "<li><strong>" + total + "</strong><span>个真实剧本</span></li>" +
      "<li><strong>" + rounds + "</strong><span>轮对话</span></li>" +
      "<li><strong>" + (done.count || 0) + "</strong><span>次本机完成</span></li>";
  }

  function renderScenarioCards() {
    if (!el["scenario-cards"]) return;
    el["scenario-cards"].innerHTML = "";
    if (!SCENARIOS.length) {
      el["scenario-cards"].innerHTML = '<p class="fine">剧本加载失败，请刷新页面。</p>';
      return;
    }
    SCENARIOS.forEach(function (s) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "scenario-card";
      card.setAttribute("data-scenario", s.id);
      card.innerHTML =
        '<span class="scenario-icon" aria-hidden="true">' + esc(s.icon || "🎯") + "</span>" +
        '<span class="scenario-body">' +
          '<span class="scenario-title">' + esc(s.title) + "</span>" +
          '<span class="scenario-sub">' + esc(s.subtitle || s.persona || "") + "</span>" +
          '<span class="scenario-meta">' +
            "<span>" + esc(s.tag || "防骗") + "</span>" +
            "<span>" + esc(s.duration || "约 3 分钟") + "</span>" +
            "<span>" + esc(s.difficulty || "入门") + "</span>" +
          "</span>" +
        "</span>" +
        '<span class="scenario-arrow" aria-hidden="true">→</span>';
      card.addEventListener("click", function () { startScenario(s.id); });
      el["scenario-cards"].appendChild(card);
    });
  }

  function startScenario(id) {
    var s = getScenario(id);
    if (!s) {
      toast("剧本数据未加载，请刷新页面");
      return;
    }
    state.scenario = s;
    state.node = s.start || "n1";
    state.score = 0;
    state.history = [];
    state.flags = [];
    state.busy = false;
    state.finished = false;
    state.lastReport = null;
    state.coachBusy = false;
    state.renderToken += 1;
    if (el["chat"]) el["chat"].innerHTML = "";
    if (el["choices"]) el["choices"].innerHTML = "";
    if (el["coach-answer"]) el["coach-answer"].textContent = "";
    if (el["coach-input"]) el["coach-input"].value = "";
    showScreen("game");
    window.scrollTo(0, 0);
    track("start", { scenarioId: s.id });
    renderNode();
  }

  function renderNode() {
    var s = state.scenario;
    if (!s) return;
    var node = s.nodes && s.nodes[state.node];
    if (!node) { finish(); return; }
    var total = s.totalRounds || 6;
    var roundNo = Math.min(state.history.length + 1, total);
    if (el["persona-avatar"]) el["persona-avatar"].textContent = s.avatar || "🎭";
    if (el["persona-name"]) el["persona-name"].textContent = s.persona || s.title;
    if (el["round-label"]) el["round-label"].textContent = "第 " + roundNo + " / " + total + " 轮";
    if (el["progress-bar"]) el["progress-bar"].style.width = Math.round(((roundNo - 1) / total) * 100) + "%";
    if (el["chat"]) el["chat"].innerHTML = "";
    if (el["choices"]) el["choices"].innerHTML = "";

    state.renderToken += 1;
    var token = state.renderToken;
    state.busy = true;
    var bubbles = Array.isArray(node.bot) ? node.bot.slice() : [node.bot || ""];
    var index = 0;

    function nextBubble() {
      if (token !== state.renderToken) return;
      if (index >= bubbles.length) {
        state.busy = false;
        renderChoices(node);
        return;
      }
      addBubble("bot", bubbles[index]);
      index += 1;
      window.setTimeout(nextBubble, 420);
    }
    window.setTimeout(nextBubble, 160);
  }

  function addBubble(kind, text) {
    if (!el["chat"] || !text) return;
    var bubble = document.createElement("div");
    bubble.className = "bubble " + kind;
    bubble.textContent = String(text);
    el["chat"].appendChild(bubble);
    el["chat"].scrollTop = el["chat"].scrollHeight;
  }

  function renderChoices(node) {
    if (!el["choices"]) return;
    el["choices"].innerHTML = "";
    var list = Array.isArray(node.choices) ? node.choices : [];
    list.forEach(function (choice, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.innerHTML = '<span class="choice-key">' + String.fromCharCode(65 + index) + "</span>" + esc(choice.text);
      button.addEventListener("click", function () { choose(choice); });
      el["choices"].appendChild(button);
    });
  }

  function choose(choice) {
    if (state.busy || state.finished || !state.scenario) return;
    state.busy = true;
    addBubble("user", choice.text);
    var delta = Number(choice.delta) || 0;
    state.score += delta;
    var s = state.scenario;
    var node = s.nodes[state.node];
    state.history.push({
      round: state.history.length + 1,
      node: state.node,
      roundTitle: node ? node.roundTitle : "",
      tactic: node ? node.tactic : "",
      text: choice.text,
      delta: delta,
      flag: choice.flag || "",
      better: choice.better || "",
      why: choice.why || ""
    });
    if (choice.flag) state.flags.push(choice.flag);
    track("round", { scenarioId: s.id, round: state.history.length, score: state.score });
    if (el["choices"]) {
      var buttons = el["choices"].querySelectorAll("button");
      for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    }
    var token = state.renderToken;
    window.setTimeout(function () {
      if (token !== state.renderToken) return;
      if (!choice.next || choice.next === "end" || !s.nodes[choice.next]) {
        finish();
        return;
      }
      state.node = choice.next;
      state.busy = false;
      renderNode();
    }, 520);
  }

  function finish() {
    if (state.finished || !state.scenario) return;
    state.finished = true;
    state.busy = true;
    var s = state.scenario;
    var score = Math.max(0, Math.min(100, Math.round(state.score)));
    state.score = score;
    var risk = riskInfo(score);
    state.lastReport = { score: score, risk: risk, history: state.history.slice() };
    renderReport(s, score, risk);
    saveCompleted(score, s.id);
    track("complete", { scenarioId: s.id, score: score, rounds: state.history.length });
    showScreen("report");
    var scroller = document.querySelector(".report-scroll");
    if (scroller) scroller.scrollTop = 0;
    var ring = el["ring-fg"];
    if (ring) {
      ring.style.strokeDashoffset = String(RISK_CIRC);
      window.setTimeout(function () {
        ring.style.strokeDashoffset = String(RISK_CIRC * (1 - score / 100));
      }, 80);
    }
  }

  function riskInfo(score) {
    if (score >= 90) return { label: "反诈王者", text: "你几乎没有给骗子留下可乘之机。把这次的关键判断固定成习惯。" };
    if (score >= 75) return { label: "防骗达人", text: "大多数环节你都很稳，只有个别话术让你犹豫。把犹豫的那一步重看一遍，下次就能更快挂断。" };
    if (score >= 55) return { label: "及格，但会犹豫", text: "你能识别常见套路，但在权威、恐惧或利益面前，还是会慢半拍。先记住：任何让你马上转账、马上保密、马上共享屏幕的，都先停 10 秒。" };
    if (score >= 35) return { label: "容易被带节奏", text: "这次你踩中了几个高风险点。骗子不是靠高明，是靠节奏；把“先核实、先问家人、先挂断”练成条件反射。" };
    return { label: "高危：需要重练", text: "这次比较危险：你在关键节点上跟着对方的节奏走了。建议重新练一遍，并把这 5 条清单保存下来。" };
  }

  function fmtDelta(delta) {
    if (delta > 0) return "+" + delta;
    if (delta === 0) return "±0";
    return String(delta);
  }

  function buildSummary(s, score, risk, history) {
    var best = null;
    var worst = null;
    history.forEach(function (item) {
      if (!best || item.delta > best.delta) best = item;
      if (!worst || item.delta < worst.delta) worst = item;
    });
    var extra = "";
    if (worst && worst.delta < 0) {
      extra = " 最危险的一步是第 " + worst.round + " 轮「" + worst.roundTitle + "」：你选了“" + worst.text + "”。";
    } else if (best) {
      extra = " 最稳的一步是第 " + best.round + " 轮「" + best.roundTitle + "」：你选了“" + best.text + "”。";
    }
    return risk.text + " 你这次得到 " + score + " 分，完成 " + history.length + " 轮。" + extra;
  }

  function renderReport(s, score, risk) {
    if (el["report-scenario"]) el["report-scenario"].textContent = s.title + (s.subtitle ? " · " + s.subtitle : "");
    if (el["score-num"]) el["score-num"].textContent = String(score);
    if (el["risk-label"]) el["risk-label"].textContent = risk.label;
    if (el["report-summary"]) el["report-summary"].textContent = buildSummary(s, score, risk, state.history);

    if (el["report-rounds"]) {
      el["report-rounds"].innerHTML = state.history.map(function (item) {
        var cls = item.delta < 0 ? "neg" : (item.delta > 0 ? "pos" : "zero");
        return '<div class="round-pill"><strong>第 ' + item.round + " 轮</strong><span>" +
          esc(item.roundTitle) + '</span><br><em class="' + cls + '">' + fmtDelta(item.delta) + "</em></div>";
      }).join("");
    }

    var seen = {};
    var tactics = [];
    state.history.forEach(function (item) {
      if (item.tactic && !seen[item.tactic]) {
        seen[item.tactic] = true;
        tactics.push(item.tactic);
      }
    });
    if (!tactics.length && Array.isArray(s.tactics)) tactics = s.tactics.slice();
    if (el["tactics"]) {
      el["tactics"].innerHTML = tactics.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("");
    }

    if (el["key-choices"]) {
      var keyed = state.history.slice().sort(function (a, b) { return a.delta - b.delta; }).slice(0, 3);
      el["key-choices"].innerHTML = keyed.map(function (item) {
        var better = item.better ? '<p class="key-better">更稳的做法：' + esc(item.better) + "</p>" : "";
        var why = item.why ? '<p class="key-why">' + esc(item.why) + "</p>" : "";
        return '<div class="key-item"><div class="key-head"><span>第 ' + item.round + " 轮 · " +
          esc(item.tactic) + '</span><span class="key-delta">' + fmtDelta(item.delta) + "</span></div>" +
          '<p class="key-choice">你选了：' + esc(item.text) + "</p>" + better + why + "</div>";
      }).join("");
    }

    if (el["advice"]) {
      el["advice"].innerHTML = (s.advice || []).map(function (text) {
        return "<li>" + esc(text) + "</li>";
      }).join("");
    }

    if (el["checklist"]) {
      el["checklist"].innerHTML = (s.advice || []).map(function (text, index) {
        var checked = isChecked(s.id, index);
        return '<label class="check' + (checked ? " done" : "") + '"><input type="checkbox" data-index="' +
          index + '"' + (checked ? " checked" : "") + "><span>" + esc(text) + "</span></label>";
      }).join("");
    }

    if (el["coach-chips"]) {
      el["coach-chips"].innerHTML = "";
      (s.coachPresets || ["我该怎么说？"]).forEach(function (question) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = question;
        chip.addEventListener("click", function () {
          if (el["coach-input"]) el["coach-input"].value = question;
          sendCoach();
        });
        el["coach-chips"].appendChild(chip);
      });
    }
    if (el["coach-answer"]) el["coach-answer"].textContent = "";
    if (el["coach-send"]) el["coach-send"].disabled = false;
    state.coachBusy = false;
  }

  function sendCoach() {
    if (!state.scenario || !state.lastReport) {
      toast("先完成一轮训练，再来问教练");
      return;
    }
    var input = el["coach-input"];
    var question = input ? String(input.value || "").trim() : "";
    if (!question) {
      if (input) input.focus();
      return;
    }
    if (question.length > 120) question = question.slice(0, 120);
    if (state.coachBusy) return;
    state.coachBusy = true;
    if (input) input.value = "";
    var answerEl = el["coach-answer"];
    var sendBtn = el["coach-send"];
    if (answerEl) answerEl.textContent = "教练正在想…";
    if (sendBtn) sendBtn.disabled = true;

    var payload = {
      question: question,
      scenarioId: state.scenario.id,
      scenarioTitle: state.scenario.title,
      score: state.lastReport.score,
      risk: state.lastReport.risk.label,
      history: state.history.map(function (item) {
        return { round: item.round, tactic: item.tactic, choice: item.text, delta: item.delta };
      })
    };
    track("ask", { scenarioId: state.scenario.id, questionLength: question.length });

    var settled = false;
    var timer = window.setTimeout(function () {
      if (!settled) fail();
    }, 15000);
    function done(answer) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      state.coachBusy = false;
      if (answerEl) answerEl.textContent = answer;
      if (sendBtn) sendBtn.disabled = false;
    }
    function fail() {
      done(fallbackAnswer(question));
    }
    try {
      fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error("http " + res.status);
        return res.json();
      }).then(function (data) {
        if (data && data.answer) done(String(data.answer));
        else fail();
      }).catch(fail);
    } catch (error) {
      fail();
    }
  }

  function fallbackAnswer(question) {
    var q = String(question || "").toLowerCase();
    var s = state.scenario;
    var firstAdvice = s && s.advice && s.advice[0] ? s.advice[0] : "先挂断，再拨 96110 核实。";
    if (q.indexOf("转账") >= 0 || q.indexOf("转钱") >= 0 || q.indexOf("付钱") >= 0) {
      return "先停止转账。保留聊天记录、转账凭证和对方账号，立刻拨 96110 或 110。不要按对方要求做“资金验证”“解冻账户”。\n\n可以这样做：1）挂断；2）打 110 说明情况；3）告诉家人。";
    }
    if (q.indexOf("屏幕") >= 0 || q.indexOf("共享") >= 0) {
      return "不要开屏幕共享。共享后对方能看到你的验证码、银行 App 和余额。直接说“我不会操作”，挂断，然后拨 96110 核实。";
    }
    if (q.indexOf("爸妈") >= 0 || q.indexOf("父母") >= 0 || q.indexOf("家人") >= 0) {
      return "别跟爸妈讲大道理，给他们一个动作：任何免费体检、专家诊断、要银行卡的，先给你打电话。可以把这次报告发给他们，一起重练一遍。";
    }
    if (q.indexOf("公检法") >= 0 || q.indexOf("警察") >= 0 || q.indexOf("安全账户") >= 0) {
      return "公检法不会电话办案，没有“安全账户”，也不会让你转账或共享屏幕。挂断后拨 110，或去最近的派出所当面核实。";
    }
    if (q.indexOf("保健品") >= 0 || q.indexOf("体检") >= 0) {
      return "先问三件事：医院名称、执业医师、产品批号。答不上来就走。任何“当场诊断 + 当场付款”的免费体检，都按推销处理。";
    }
    return "先把对方的节奏打断：挂断，不转账，不共享屏幕，不提供验证码。然后拨 96110 或 110 核实。\n\n这次报告里最关键的一条是：" + firstAdvice;
  }

  function shareReport() {
    if (!state.lastReport || !state.scenario) {
      toast("先完成一次训练");
      return;
    }
    var s = state.scenario;
    var score = state.lastReport.score;
    var text = "我在「反诈健身房」练了《" + s.title + "》，拿到 " + score + " 分（" + state.lastReport.risk.label + "）。3 分钟、6 轮对话，测测你会不会挂断骗子。";
    var url = location.href.split("#")[0];
    if (navigator.share) {
      navigator.share({ title: "反诈健身房", text: text, url: url }).then(function () {
        track("share", { scenarioId: s.id, score: score });
      }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + " " + url).then(function () {
        toast("分享文案已复制");
        track("share", { scenarioId: s.id, score: score });
      }).catch(function () {
        toast("复制失败，请手动复制地址栏链接");
      });
      return;
    }
    toast("请手动复制地址栏链接分享");
  }

  function track(event, payload) {
    try {
      var body = {
        event: event,
        sessionId: state.sessionId,
        ts: Date.now()
      };
      if (payload) {
        Object.keys(payload).forEach(function (key) { body[key] = payload[key]; });
      }
      var json = JSON.stringify(body);
      if (navigator.sendBeacon) {
        var blob = new Blob([json], { type: "application/json" });
        navigator.sendBeacon("/api/event", blob);
        return;
      }
      fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive: true
      }).catch(function () {});
    } catch (error) {}
  }

  function getSessionId() {
    try {
      var id = sessionStorage.getItem("fg_session");
      if (!id) {
        id = "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem("fg_session", id);
      }
      return id;
    } catch (error) {
      return "s_" + Date.now().toString(36);
    }
  }

  function readCompleted() {
    try {
      var raw = localStorage.getItem(KEY_COMPLETED);
      if (!raw) return { count: 0, lastScore: null, lastAt: 0 };
      var obj = JSON.parse(raw);
      if (typeof obj === "number") return { count: obj, lastScore: null, lastAt: 0 };
      if (!obj || typeof obj !== "object") return { count: 0, lastScore: null, lastAt: 0 };
      return {
        count: Number(obj.count) || 0,
        lastScore: obj.lastScore == null ? null : Number(obj.lastScore),
        lastAt: Number(obj.lastAt) || 0
      };
    } catch (error) {
      return { count: 0, lastScore: null, lastAt: 0 };
    }
  }

  function saveCompleted(score, scenarioId) {
    try {
      var current = readCompleted();
      localStorage.setItem(KEY_COMPLETED, JSON.stringify({
        count: current.count + 1,
        lastScore: score,
        lastAt: Date.now(),
        lastScenario: scenarioId
      }));
    } catch (error) {}
  }

  function readChecklist() {
    try {
      var raw = localStorage.getItem(KEY_CHECKLIST);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
      return obj;
    } catch (error) {
      return {};
    }
  }

  function isChecked(scenarioId, index) {
    var all = readChecklist();
    var list = all[scenarioId];
    return Array.isArray(list) && list.indexOf(index) >= 0;
  }

  function saveChecklist(scenarioId, index, checked) {
    try {
      var all = readChecklist();
      var list = Array.isArray(all[scenarioId]) ? all[scenarioId].slice() : [];
      var pos = list.indexOf(index);
      if (checked && pos < 0) list.push(index);
      if (!checked && pos >= 0) list.splice(pos, 1);
      all[scenarioId] = list;
      localStorage.setItem(KEY_CHECKLIST, JSON.stringify(all));
    } catch (error) {}
  }

  function toast(message) {
    if (!el["toast"]) return;
    el["toast"].textContent = message;
    el["toast"].classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      el["toast"].classList.remove("show");
    }, 2200);
  }

  function bind() {
    if (el["start-btn"]) {
      el["start-btn"].addEventListener("click", function () {
        startScenario(SCENARIOS[0] ? SCENARIOS[0].id : null);
      });
    }
    if (el["back-btn"]) el["back-btn"].addEventListener("click", goHome);
    if (el["report-home-btn"]) el["report-home-btn"].addEventListener("click", goHome);
    if (el["home-btn"]) el["home-btn"].addEventListener("click", goHome);
    if (el["restart-btn"]) {
      el["restart-btn"].addEventListener("click", function () {
        if (state.scenario) startScenario(state.scenario.id);
      });
    }
    if (el["share-btn"]) el["share-btn"].addEventListener("click", shareReport);
    if (el["coach-send"]) el["coach-send"].addEventListener("click", sendCoach);
    if (el["coach-input"]) {
      el["coach-input"].addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          sendCoach();
        }
      });
    }
    if (el["checklist"]) {
      el["checklist"].addEventListener("change", function (event) {
        var input = event.target;
        if (!input || input.type !== "checkbox" || !state.scenario) return;
        var index = Number(input.getAttribute("data-index"));
        var label = input.closest ? input.closest(".check") : input.parentNode;
        if (label) label.classList.toggle("done", input.checked);
        saveChecklist(state.scenario.id, index, input.checked);
      });
    }
  }

  function init() {
    cache();
    state.sessionId = getSessionId();
    renderHomeStats();
    renderScenarioCards();
    bind();
    showScreen("home");
    if (!SCENARIOS.length && el["start-btn"]) el["start-btn"].disabled = true;
  }

  window.FG = {
    start: startScenario,
    getState: function () { return state; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();