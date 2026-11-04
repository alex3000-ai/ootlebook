// /router: pay an ootleRouter per use from this browser. The page talks only to the router you name; your API key and
// voucher key stay in this browser's storage and never reach Ootlebook. Vouchers are signed here (router-keys.js is
// ootleRouter's ootle/pay/keys.mjs, bundled by scripts/build-router-keys.mjs).

import { keygen, publicKeyOf, signVoucher } from "/router-keys.js";

const KEY = "or_settings";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));
const tari = (µt) => `${(Number(µt) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} TARI`;

export default function routerView(app, { esc, pageHead }) {
  const s = load();
  const field = (id, label, value = "", type = "text", hint = "") =>
    `<label class="rf"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value)}" autocomplete="off" spellcheck="false">${hint ? `<small class="muted">${hint}</small>` : ""}</label>`;
  app.innerHTML = pageHead("Router", `Pay an <a href="https://github.com/alex3000-ai/ootleRouter">ootleRouter</a> per use in TARI: escrow once in a payment lane, then each task carries a voucher this page signs for what you've used. Your keys stay in this browser; Ootlebook never sees them.`) + `
  <section class="card rcard">
    <h2>1. Connect</h2>
    ${field("r-base", "Router API address", s.base ?? "http://localhost:3000/api/harness")}
    ${field("r-key", "Your API key (from the router's operator)", s.apiKey ?? "", "password")}
    <button class="btn btn-sm" id="r-connect">Connect</button>
    <div id="r-info" class="rout"></div>
  </section>
  <section class="card rcard">
    <h2>2. Your lane</h2>
    <p class="muted tiny">Your voucher key signs what you allow the router to claim. It can't move funds by itself.</p>
    <div id="r-vk"></div>
    ${field("r-lane", "Lane number", s.lane ?? "", "number")}
    ${field("r-limit", "Escrowed in it (µT)", s.limit ?? "", "number", "The page never signs a voucher above this.")}
    <button class="btn btn-sm" id="r-save">Save and check</button>
    <div id="r-lane-out" class="rout"></div>
  </section>
  <section class="card rcard">
    <h2>3. Run a task</h2>
    ${field("r-harness", "Harness", s.harness ?? "", "text", "A harness id the router runs")}
    ${field("r-model", "Model", s.model ?? "")}
    <label class="rf"><span>Task</span><textarea id="r-input" rows="4">${esc(s.input ?? "Reply with exactly: it works.")}</textarea></label>
    <button class="btn btn-sm" id="r-run">Pay and run</button>
    <div id="r-run-out" class="rout"></div>
  </section>`;

  const $ = (id) => document.getElementById(id);
  const val = (id) => $(id).value.trim();
  const show = (id, html) => ($(id).innerHTML = html);
  const fail = (id, e) => show(id, `<p class="bad">${esc(e.message ?? e)}</p>`);
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
      show("r-vk", `<button class="btn btn-sm btn-ghost" id="r-mk">Make a voucher key</button>`);
      $("r-mk").onclick = () => { save({ ...load(), voucherSecret: keygen().secretKey }); showKey(); };
      return;
    }
    const pub = publicKeyOf(st.voucherSecret);
    const cmd = info ? `ootlerouter-lanes open --account <your walletd account> ${info.provider_key} <µT> ${pub} --live` : "";
    show("r-vk", `<p class="tiny">Voucher public key: <code>${pub}</code></p>` + (cmd
      ? `<p class="tiny">Open a lane from your wallet (<a href="https://github.com/alex3000-ai/ootleRouter/tree/main/ootle">the CLI</a>), then enter its number below:</p><pre class="rcmd"><code>${esc(cmd)}</code></pre><button class="copy btn btn-sm btn-ghost" data-copy="${esc(cmd)}">Copy</button>`
      : `<p class="muted tiny">Connect first to see the command that opens a lane.</p>`));
  }

  async function connect() {
    save({ ...load(), base: val("r-base"), apiKey: val("r-key") });
    try {
      info = await call("/v1/ootle");
      const prices = Object.entries(info.prices).map(([k, v]) => `<li><code>${esc(k)}</code>: ${v} µT</li>`).join("");
      show("r-info", `<p class="tiny">Lanes component <code>${esc(info.component)}</code><br>Pays provider <code>${esc(info.provider_key)}</code><br>
        A running task holds ${tari(info.reserve_microtari)} until it's charged.</p><ul class="tiny">${prices}</ul>`);
    } catch (e) { info = null; fail("r-info", e); }
    showKey();
  }

  async function laneStatus() {
    const st = await call(`/v1/ootle/lanes/${Number(val("r-lane"))}`);
    show("r-lane-out", `<p class="tiny">Vouchers so far: ${tari(st.voucher_cum)} · charged: ${tari(st.charged)} · held by running tasks: ${tari(st.held)} · left: <b>${tari(Number(val("r-limit")) - st.charged - st.held)}</b></p>`);
    return st;
  }

  $("r-connect").onclick = connect;
  $("r-save").onclick = async () => {
    save({ ...load(), lane: val("r-lane"), limit: val("r-limit") });
    try { await laneStatus(); } catch (e) { fail("r-lane-out", e); }
  };
  $("r-run").onclick = async () => {
    const st0 = load();
    save({ ...st0, harness: val("r-harness"), model: val("r-model"), input: $("r-input").value });
    const btn = $("r-run");
    btn.disabled = true;
    show("r-run-out", `<p class="muted tiny">Running…</p>`);
    try {
      if (!info) await connect();
      if (!info) throw new Error("Connect to the router first.");
      if (!st0.voucherSecret || val("r-lane") === "") throw new Error("Make a voucher key and enter your lane first.");
      const lane = Number(val("r-lane")), limit = Number(val("r-limit"));
      // Sign only what this task can need: what's charged and held already, plus the reserve it will hold.
      const st = await laneStatus();
      const cum = Math.max(st.voucher_cum, st.charged + st.held + info.reserve_microtari);
      if (cum > limit) throw new Error(`This task needs a voucher for ${tari(cum)} in all, above the ${tari(limit)} in your lane. Fund the lane and raise the number above.`);
      const voucher = signVoucher(st0.voucherSecret, info.component, lane, cum);
      const r = await call("/v1/responses", {
        method: "POST",
        headers: { "x-ootle-voucher": JSON.stringify(voucher) },
        body: JSON.stringify({ input: $("r-input").value, model: val("r-model") || undefined, metadata: { harness_id: val("r-harness") }, stream: false }),
      });
      const text = r.output_text ?? (r.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n");
      const after = await laneStatus();
      show("r-run-out", `<p class="tiny">${esc(r.status)} · cost ${tari(after.charged - st.charged)}</p>` +
        (r.error ? `<p class="bad">${esc(r.error.message)}</p>` : "") + `<pre class="rcmd">${esc(text || "(no text)")}</pre>`);
    } catch (e) { fail("r-run-out", e); }
    btn.disabled = false;
  };

  showKey();
  if (s.base && s.apiKey) connect();
}
