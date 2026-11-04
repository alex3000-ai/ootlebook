// /router: pay an ootleRouter per use from this browser, in a page styled after the router's own console (router.css).
// The page talks only to the router you name; your API key and voucher key stay in this browser's storage and never
// reach Ootlebook. Vouchers are signed here (router-keys.js is ootleRouter's ootle/pay/keys.mjs, bundled by
// scripts/build-router-keys.mjs).

import { keygen, publicKeyOf, signVoucher } from "/router-keys.js";

const KEY = "or_settings";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (patch) => localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch }));
const tari = (µt) => `${(Number(µt) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} TARI`;
const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  start: icon('<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>'),
  tasks: icon('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
  theme: icon('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'),
  home: icon('<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>'),
};

let cssLoaded = false;
const ran = [];   // this visit's tasks; not stored

export default function routerView(app, { esc }) {
  if (!cssLoaded) {
    document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="/router.css">`);
    cssLoaded = true;
  }
  document.body.classList.add("or-mode");
  document.title = "Router · Ootlebook";
  const s = load();
  const field = (id, label, value = "", type = "text", hint = "") =>
    `<label class="or-field"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value)}" autocomplete="off" spellcheck="false">${hint ? `<small>${hint}</small>` : ""}</label>`;

  app.innerHTML = `<div class="or">
    <nav class="or-rail" aria-label="Router">
      <a class="or-logo" href="/" title="Ootlebook"><img src="/logo.svg" alt="Ootlebook" width="28" height="28"></a>
      <button class="or-rail-btn on" data-view="start">${ICONS.start}Start</button>
      <button class="or-rail-btn" data-view="tasks">${ICONS.tasks}Tasks</button>
      <div class="or-rail-end">
        <button class="or-rail-btn" id="or-theme" title="Light or dark">${ICONS.theme}Theme</button>
        <a class="or-rail-btn" href="/">${ICONS.home}Ootlebook</a>
      </div>
    </nav>
    <div class="or-scroll"><div class="or-sg">
      <section data-pane="start">
        <p class="or-eye">Pay per use · TARI on Ootle</p>
        <h1 class="or-h1"><label for="r-input">What should the agent do?</label></h1>
        <div class="or-bar">
          <textarea id="r-input" rows="1" placeholder="e.g. Read the attached CSV and summarise the three largest changes.">${esc(s.input ?? "")}</textarea>
          <button class="or-btn primary" id="r-run">Pay and run</button>
        </div>
        <div class="or-sub">
          <label>Harness <input id="r-harness" value="${esc(s.harness ?? "")}" placeholder="opencode" spellcheck="false"></label>
          <label>Model <input id="r-model" value="${esc(s.model ?? "")}" placeholder="the router's model id" spellcheck="false"></label>
          <span id="r-bal"></span>
        </div>
        <div id="r-run-out"></div>
        <div class="or-tiles">
          <div class="or-tile">
            <span class="or-tile-n" id="n1">1</span>
            <h2>Connect to a router</h2>
            <p>Its address and the API key its operator gave you. Both stay in this browser.</p>
            <p class="or-note">No public router is listed yet: run your own with <a href="https://github.com/alex3000-ai/ootleRouter">ootleRouter</a>, and allow this page with <code>OOTLE_CORS_ORIGINS=https://ootlebook.com</code>.</p>
            ${field("r-base", "Router API address", s.base ?? "http://localhost:3000/api/harness")}
            ${field("r-key", "API key", s.apiKey ?? "", "password")}
            <div><button class="or-btn small line" id="r-connect">Connect</button></div>
            <div id="r-info"></div>
          </div>
          <div class="or-tile">
            <span class="or-tile-n" id="n2">2</span>
            <h2>Open a payment lane</h2>
            <p>Escrow TARI once from your wallet. Each task then carries a voucher this page signs for what you've used; the router claims what it charged and you get the rest back when you close.</p>
            <div id="r-vk"></div>
            <div class="or-row">${field("r-lane", "Lane number", s.lane ?? "", "number")}${field("r-limit", "Escrowed (µT)", s.limit ?? "", "number")}</div>
            <div><button class="or-btn small line" id="r-save">Check lane</button></div>
            <div id="r-lane-out"></div>
          </div>
          <div class="or-tile">
            <span class="or-tile-n" id="n3">3</span>
            <h2>Prices</h2>
            <p>What the router charges, in µT. A running task holds a small reserve until it's charged its real cost.</p>
            <div id="r-prices"><span class="or-note">Connect to see prices.</span></div>
          </div>
        </div>
      </section>
      <section data-pane="tasks" hidden>
        <p class="or-eye">This visit</p>
        <h1 class="or-h1">Tasks</h1>
        <div class="or-list" id="r-history"></div>
      </section>
    </div></div>
  </div>`;

  const $ = (id) => document.getElementById(id);
  const val = (id) => $(id).value.trim();
  const show = (id, html) => ($(id).innerHTML = html);
  const fail = (id, e) => show(id, `<p class="or-bad">${esc(e.message ?? e)}</p>`);
  const step = (n, done) => $(`n${n}`).classList.toggle("done", done);
  let info = null;

  async function call(path, init = {}) {
    const res = await fetch(`${val("r-base").replace(/\/+$/, "")}${path}`, {
      ...init, headers: { authorization: `Bearer ${val("r-key")}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error?.message ?? body.detail ?? `HTTP ${res.status}`), { body });
    return body;
  }

  function showKey() {
    const st = load();
    if (!st.voucherSecret) {
      show("r-vk", `<div><button class="or-btn small" id="r-mk">Make a voucher key</button></div>`);
      $("r-mk").onclick = () => { save({ voucherSecret: keygen().secretKey }); showKey(); };
      return;
    }
    const pub = publicKeyOf(st.voucherSecret);
    const cmd = `ootlerouter-lanes open --account <your walletd account> ${info?.provider_key ?? "<router's provider key>"} <µT> ${pub} --live`;
    show("r-vk", `<pre class="or-cmd">${esc(cmd)}</pre><div><button class="or-btn small line copy" data-copy="${esc(cmd)}">Copy</button>
      <a class="or-note" href="https://github.com/alex3000-ai/ootleRouter/tree/main/ootle">the CLI</a></div>`);
  }

  async function connect() {
    save({ base: val("r-base"), apiKey: val("r-key") });
    try {
      info = await call("/v1/ootle");
      show("r-info", `<dl class="or-kv"><dt>Network</dt><dd>${esc(info.network ?? "")}</dd><dt>Lanes</dt><dd class="mono">${esc(info.component.slice(0, 22))}…</dd><dt>Pays</dt><dd class="mono">${esc(info.provider_key.slice(0, 16))}…</dd></dl>`);
      show("r-prices", `<dl class="or-kv">${Object.entries(info.prices).map(([k, v]) => `<dt class="mono">${esc(k)}</dt><dd>${v} µT</dd>`).join("")}
        <dt>reserve</dt><dd>${tari(info.reserve_microtari)}</dd></dl>`);
      step(1, true); step(3, true);
    } catch (e) { info = null; step(1, false); fail("r-info", e); }
    showKey();
  }

  async function laneStatus() {
    const st = await call(`/v1/ootle/lanes/${Number(val("r-lane"))}`);
    const left = Number(val("r-limit")) - st.charged - st.held;
    show("r-lane-out", `<dl class="or-kv"><dt>Charged</dt><dd>${tari(st.charged)}</dd><dt>Held</dt><dd>${tari(st.held)}</dd><dt>Vouchers</dt><dd>${tari(st.voucher_cum)}</dd><dt>Left</dt><dd><b>${tari(left)}</b></dd></dl>`);
    show("r-bal", `<span class="or-chip acc">Lane ${Number(val("r-lane"))} · ${tari(left)} left</span>`);
    step(2, true);
    return st;
  }

  function renderHistory() {
    show("r-history", ran.length ? ran.map((t) => `<div class="or-item"><b>${esc(t.input.slice(0, 120))}</b>
      <span class="or-chip ${t.ok ? "ok" : "bad"}">${esc(t.status)} · ${tari(t.cost)}</span><p>${esc(t.text.slice(0, 600))}</p></div>`).join("")
      : `<div class="or-empty">Tasks you run on this page appear here.</div>`);
  }

  document.querySelectorAll(".or-rail-btn[data-view]").forEach((b) => (b.onclick = () => {
    document.querySelectorAll(".or-rail-btn[data-view]").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.view));
    if (b.dataset.view === "tasks") renderHistory();
  }));
  $("or-theme").onclick = () => document.getElementById("theme-toggle")?.click();
  // Browsers without CSS field-sizing grow the task box by script.
  const grow = () => { const t = $("r-input"); if (!CSS.supports("field-sizing", "content")) { t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 240)}px`; } };
  $("r-input").addEventListener("input", grow);
  addEventListener("resize", grow);
  grow();
  $("r-connect").onclick = connect;
  $("r-save").onclick = async () => {
    save({ lane: val("r-lane"), limit: val("r-limit") });
    try { await laneStatus(); } catch (e) { step(2, false); fail("r-lane-out", e); }
  };
  $("r-run").onclick = async () => {
    const st0 = load(), input = $("r-input").value;
    save({ harness: val("r-harness"), model: val("r-model"), input });
    const btn = $("r-run");
    btn.disabled = true;
    show("r-run-out", `<div class="or-result"><div class="or-result-head"><span class="or-chip">Running…</span></div></div>`);
    try {
      if (!info) await connect();
      if (!info) throw new Error("Connect to the router first (step 1).");
      if (!st0.voucherSecret || val("r-lane") === "") throw new Error("Make a voucher key and enter your lane first (step 2).");
      if (!input.trim()) throw new Error("Say what the agent should do.");
      const lane = Number(val("r-lane")), limit = Number(val("r-limit"));
      // Sign only what this task can need: what's charged and held already, plus the reserve it will hold.
      const st = await laneStatus();
      const cum = Math.max(st.voucher_cum, st.charged + st.held + info.reserve_microtari);
      if (cum > limit) throw new Error(`This task needs a voucher for ${tari(cum)} in all, above the ${tari(limit)} in your lane. Fund the lane and raise "Escrowed".`);
      const voucher = signVoucher(st0.voucherSecret, info.component, lane, cum, info.network);
      const r = await call("/v1/responses", {
        method: "POST",
        headers: { "x-ootle-voucher": JSON.stringify(voucher) },
        body: JSON.stringify({ input, model: val("r-model") || undefined, metadata: { harness_id: val("r-harness") }, stream: false }),
      });
      const text = r.output_text ?? (r.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n");
      const after = await laneStatus();
      const cost = after.charged - st.charged, ok = r.status === "completed";
      ran.unshift({ input, status: r.status, cost, ok, text: text || r.error?.message || "" });
      show("r-run-out", `<div class="or-result"><div class="or-result-head"><span class="or-chip ${ok ? "ok" : "bad"}">${esc(r.status)}</span>
        <span>cost ${tari(cost)}</span>${r.usage ? `<span>${r.usage.input_tokens ?? 0} in · ${r.usage.output_tokens ?? 0} out tokens</span>` : ""}</div>
        ${r.error ? `<p class="or-bad">${esc(r.error.message)}</p>` : ""}<pre>${esc(text || "(no text)")}</pre></div>`);
    } catch (e) {
      show("r-run-out", `<div class="or-result"><div class="or-result-head"><span class="or-chip bad">Not run</span></div><p class="or-bad">${esc(e.message ?? e)}</p></div>`);
    }
    btn.disabled = false;
  };

  showKey();
  if (s.base && s.apiKey) connect().then(() => (s.lane !== undefined && s.lane !== "" ? laneStatus().catch(() => {}) : null));
}
