/* Nova — assistente pessoal (versão independente, Gemini grátis) */
(function () {
"use strict";
const $ = s => document.querySelector(s);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const KEY = "nova-v1";
const DEF = {
  tasks: [], memory: [], chat: [], brief: null,
  settings: { name: "Nova", user: "Luís Fernando", city: "", speak: true, loop: false, voice: "", rate: 1.05, engine: "gemini", character: "natural", ttsVoice: "Puck", ttsStyle: "", ttsModel: "gemini-3.8-flash-tts",
              apiKey: "", model: "gemini-flash-latest", notif: false, wake: false }
};
let S = load();
let weather = null, news = [], newsAt = null;

/* ---------- armazenamento local ---------- */
function merge(d) {
  const o = structuredClone(DEF);
  if (d && typeof d === "object") {
    for (const k of ["tasks", "memory", "chat"]) if (Array.isArray(d[k])) o[k] = d[k];
    if (d.brief) o.brief = d.brief;
    o.settings = { ...o.settings, ...(d.settings || {}) };
  }
  return o;
}
function load() { try { return merge(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { return structuredClone(DEF); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Não consegui salvar neste navegador.", true); } }

/* ---------- utilidades ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function md(t) {
  const lines = esc(t).split("\n"); let out = "", inList = false;
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, "$1<em>$2</em>")
    .replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  for (const l of lines) {
    const m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)/);
    if (m) { if (!inList) { out += "<ul>"; inList = true; } out += "<li>" + inline(m[1]) + "</li>"; continue; }
    if (inList) { out += "</ul>"; inList = false; }
    if (!l.trim()) continue;
    const h = l.match(/^#{1,4}\s+(.*)/);
    out += "<p>" + (h ? "<strong>" + inline(h[1]) + "</strong>" : inline(l)) + "</p>";
  }
  if (inList) out += "</ul>";
  return out;
}
const plain = t => t.replace(/```[\s\S]*?```/g, "").replace(/[*_`#>]/g, "").replace(/https?:\/\/\S+/g, "").replace(/\n{2,}/g, ". ").replace(/\n/g, ", ");
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmtDT = iso => {
  const d = new Date(iso); if (isNaN(d)) return "";
  const t = new Date(), tm = new Date(t); tm.setDate(t.getDate() + 1);
  const hh = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === t.toDateString()) return "hoje " + hh;
  if (d.toDateString() === tm.toDateString()) return "amanhã " + hh;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " " + hh;
};
const isToday = iso => { const d = new Date(iso); return !isNaN(d) && d.toDateString() === new Date().toDateString(); };
const isLate = t => !t.done && t.when && new Date(t.when) < new Date() && !isToday(t.when);
let toastT;
function toast(msg, warn, undo) {
  const el = $("#toast"); el.className = "toast" + (warn ? " warn" : ""); el.innerHTML = "";
  const s = document.createElement("span"); s.textContent = msg; el.append(s);
  if (undo) { const b = document.createElement("button"); b.textContent = "Desfazer"; b.onclick = () => { undo(); el.hidden = true; }; el.append(b); }
  el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, undo ? 6000 : 4500);
}
function setMode(m, label) { $("#app").dataset.mode = m; $("#stateTxt").textContent = label || ({ idle: S.settings.wake ? "Diga \"" + S.settings.name + "\"" : "Pronta", thinking: "Pensando", speaking: "Falando", listening: "Ouvindo" }[m]); }

/* ---------- clima (Open-Meteo, grátis, sem chave) ---------- */
const WMO = { 0: "Céu limpo", 1: "Predomínio de sol", 2: "Parcialmente nublado", 3: "Nublado", 45: "Neblina", 48: "Neblina", 51: "Garoa fraca", 53: "Garoa", 55: "Garoa forte", 61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte", 66: "Chuva congelante", 67: "Chuva congelante", 71: "Neve fraca", 73: "Neve", 75: "Neve forte", 80: "Pancadas fracas", 81: "Pancadas de chuva", 82: "Pancadas fortes", 95: "Trovoadas", 96: "Trovoadas com granizo", 99: "Trovoadas com granizo" };
async function loadWeather() {
  const city = (S.settings.city || "").trim(); if (!city) { $("#wx").hidden = true; weather = null; return; }
  try {
    const g = await (await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=" + encodeURIComponent(city))).json();
    const p = g.results && g.results[0]; if (!p) { toast("Não achei a cidade \"" + city + "\" para o clima.", true); return; }
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=2`;
    const w = await (await fetch(u)).json();
    weather = {
      cidade: p.name + (p.admin1 ? ", " + p.admin1 : ""),
      agora: Math.round(w.current.temperature_2m), sensacao: Math.round(w.current.apparent_temperature),
      umidade: w.current.relative_humidity_2m, condicao: WMO[w.current.weather_code] || "—",
      hoje: { max: Math.round(w.daily.temperature_2m_max[0]), min: Math.round(w.daily.temperature_2m_min[0]), chuva: w.daily.precipitation_probability_max[0] },
      amanha: { max: Math.round(w.daily.temperature_2m_max[1]), min: Math.round(w.daily.temperature_2m_min[1]), chuva: w.daily.precipitation_probability_max[1], condicao: WMO[w.daily.weather_code[1]] || "—" },
      fonte: "Open-Meteo"
    };
    $("#wxTemp").textContent = weather.agora + "°";
    $("#wxDesc").textContent = weather.condicao + " · " + weather.cidade;
    $("#wxMore").textContent = `Máx ${weather.hoje.max}° · mín ${weather.hoje.min}° · chuva ${weather.hoje.chuva ?? 0}%`;
    $("#wx").hidden = false;
  } catch (e) { $("#wx").hidden = true; }
}

/* ---------- notícias (news.json gerado pelo GitHub Actions a partir de RSS reais) ---------- */
async function loadNews() {
  const L = $("#newsList");
  try {
    const r = await fetch("news.json?t=" + Math.floor(Date.now() / 600000), { cache: "no-store" });
    const d = await r.json();
    news = Array.isArray(d.itens) ? d.itens : []; newsAt = d.atualizado || null;
  } catch (e) { news = []; }
  L.innerHTML = "";
  if (!news.length) { L.innerHTML = '<li class="empty">Sem notícias ainda. Elas chegam após a primeira atualização automática.</li>'; $("#newsTag").textContent = ""; return; }
  $("#newsTag").textContent = newsAt ? "atualizado " + fmtDT(newsAt) : "";
  news.slice(0, 8).forEach(n => {
    const li = document.createElement("li");
    const a = document.createElement("a"); a.href = /^https?:\/\//.test(n.link) ? n.link : "#"; a.target = "_blank"; a.rel = "noopener"; a.textContent = n.titulo;
    const s = document.createElement("small"); s.textContent = n.fonte + (n.data ? " · " + fmtDT(n.data) : "");
    li.append(a, s); L.append(li);
  });
}

/* ---------- render ---------- */
function render() { renderTop(); renderBrief(); renderTasks(); renderMem(); renderChat(); }
function renderTop() {
  $("#brandName").textContent = S.settings.name || "Nova"; document.title = S.settings.name || "Nova";
  $("#voiceBtn").innerHTML = S.settings.speak
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6"/></svg>';
  $("#voiceBtn").setAttribute("aria-pressed", S.settings.speak);
  $("#wakeBtn").classList.toggle("on", !!S.settings.wake); $("#wakeBtn").setAttribute("aria-pressed", !!S.settings.wake);
  $("#netTag").textContent = navigator.onLine ? "" : "sem internet";
}
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
function renderBrief() {
  $("#greet").textContent = greeting() + ", " + (S.settings.user || "").split(" ")[0];
  $("#today").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const open = S.tasks.filter(t => !t.done);
  $("#stToday").textContent = open.filter(t => t.when && isToday(t.when)).length;
  const late = open.filter(isLate).length; $("#stLate").textContent = late; $("#stLateBox").classList.toggle("alert", late > 0);
  $("#stOpen").textContent = open.length;
  $("#briefText").textContent = S.brief && S.brief.date === new Date().toDateString() ? S.brief.text : "";
}
function taskRow(t) {
  const r = document.createElement("div"); r.className = "task" + (t.done ? " done" : "");
  const c = document.createElement("button"); c.className = "chk"; c.setAttribute("aria-label", t.done ? "Reabrir" : "Concluir");
  c.onclick = () => { t.done = !t.done; t.doneAt = t.done ? new Date().toISOString() : null; save(); render(); };
  const b = document.createElement("div"); b.className = "tbody";
  const ti = document.createElement("div"); ti.className = "ttitle"; ti.textContent = t.title; b.append(ti);
  if (t.when) { const m = document.createElement("div"); m.className = "tmeta" + (isLate(t) ? " late" : ""); m.textContent = fmtDT(t.when); b.append(m); }
  if (t.notes) { const m = document.createElement("div"); m.className = "tmeta"; m.textContent = t.notes; b.append(m); }
  const d = document.createElement("button"); d.className = "del"; d.setAttribute("aria-label", "Apagar tarefa"); d.textContent = "✕";
  d.onclick = () => { const i = S.tasks.indexOf(t); S.tasks.splice(i, 1); save(); render(); toast("Tarefa apagada", false, () => { S.tasks.splice(i, 0, t); save(); render(); }); };
  r.append(c, b, d); return r;
}
function renderTasks() {
  const L = $("#taskList"); L.innerHTML = "";
  const open = S.tasks.filter(t => !t.done), done = S.tasks.filter(t => t.done);
  $("#taskCount").textContent = open.length ? open.length + " abertas" : "";
  if (!S.tasks.length) { L.innerHTML = '<p class="empty">Nenhuma tarefa ainda. Digite acima ou diga "me lembre de ligar pro cliente amanhã às 10h".</p>'; return; }
  const by = (a, b) => (a.when || "9") > (b.when || "9") ? 1 : -1;
  const groups = [["Atrasadas", open.filter(isLate), "late"], ["Hoje", open.filter(t => t.when && isToday(t.when))],
    ["Próximas", open.filter(t => t.when && !isToday(t.when) && !isLate(t))], ["Sem data", open.filter(t => !t.when)]];
  for (const [n, arr, cls] of groups) {
    if (!arr.length) continue;
    const h = document.createElement("div"); h.className = "group-title" + (cls ? " " + cls : ""); h.textContent = n; L.append(h);
    arr.sort(by).forEach(t => L.append(taskRow(t)));
  }
  if (done.length) {
    const det = document.createElement("details"); const s = document.createElement("summary"); s.textContent = "Concluídas (" + done.length + ")"; det.append(s);
    done.slice(-30).reverse().forEach(t => det.append(taskRow(t)));
    const clr = document.createElement("button"); clr.className = "btn ghost"; clr.style.marginTop = "8px"; clr.textContent = "Limpar concluídas";
    clr.onclick = () => { const old = S.tasks.slice(); S.tasks = S.tasks.filter(t => !t.done); save(); render(); toast("Concluídas removidas", false, () => { S.tasks = old; save(); render(); }); };
    det.append(clr); L.append(det);
  }
}
function renderMem() {
  const L = $("#memList"); L.innerHTML = ""; $("#memCount").textContent = S.memory.length ? S.memory.length + " itens" : "";
  if (!S.memory.length) { L.innerHTML = '<p class="empty">Nada salvo ainda. Ex.: "Prefiro reuniões depois das 14h".</p>'; return; }
  S.memory.forEach((m, i) => {
    const r = document.createElement("div"); r.className = "mem"; const s = document.createElement("span"); s.textContent = m.text;
    const d = document.createElement("button"); d.className = "del"; d.setAttribute("aria-label", "Esquecer"); d.textContent = "✕";
    d.onclick = () => { S.memory.splice(i, 1); save(); render(); toast("Memória apagada", false, () => { S.memory.splice(i, 0, m); save(); render(); }); };
    r.append(s, d); L.append(r);
  });
}
function bubble(role, text) { const d = document.createElement("div"); d.className = "msg " + role; if (role === "bot") d.innerHTML = md(text); else d.textContent = text; return d; }
function addActions(el, text) {
  const a = document.createElement("div"); a.className = "act";
  const sp = document.createElement("button"); sp.textContent = "▶ ouvir"; sp.onclick = () => speak(text, true);
  const cp = document.createElement("button"); cp.textContent = "copiar";
  cp.onclick = () => navigator.clipboard.writeText(text).then(() => toast("Copiado")).catch(() => toast("Não consegui copiar", true));
  a.append(sp, cp); el.append(a);
}
function renderChat() {
  if (busy) return; const M = $("#msgs"); M.innerHTML = "";
  if (!S.chat.length) M.append(bubble("bot", `Oi, ${(S.settings.user || "").split(" ")[0]}! Sou a ${S.settings.name}. Posso organizar tarefas, criar lembretes, guardar o que for importante, dar o clima e as notícias do dia e te ajudar a escrever posts, roteiros e legendas. Toque no microfone ou digite.`));
  S.chat.forEach(m => { const b = bubble(m.role === "user" ? "user" : "bot", m.content); if (m.role !== "user") addActions(b, m.content); M.append(b); });
  M.scrollTop = M.scrollHeight;
}

/* ---------- voz: fala ---------- */
let voices = [];
// Nota de qualidade: vozes neurais (Edge "Natural", Google) soam humanas; as antigas do sistema soam robóticas
function voiceScore(v) {
  const lang = (v.lang || "").replace("_", "-").toLowerCase(); let s = 0;
  if (lang === "pt-br") s += 50; else if (lang.startsWith("pt")) s += 10;
  if (/natural|neural|online|enhanced|premium|aprimorad/i.test(v.name)) s += 30;
  if (/google/i.test(v.name)) s += 20;
  if (/francisca|thalita|antonio|luciana|felipe/i.test(v.name)) s += 5;
  if (/maria|daniel|helena/i.test(v.name) && !/natural|online/i.test(v.name)) s -= 5; // vozes antigas do Windows
  if (!v.localService) s += 2;
  return s;
}
function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  voices = speechSynthesis.getVoices().filter(v => /^pt/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
  const sel = $("#sVoice");
  sel.innerHTML = '<option value="">Automática (a mais natural em português)</option>' +
    voices.map((v, i) => `<option value="${esc(v.name)}">${esc(v.name.replace(/^Microsoft\s+/, "").replace(/\s*-\s*Portuguese \(Brazil\)/i, ""))} · ${esc(v.lang)}${i === 0 ? " · recomendada" : ""}</option>`).join("");
  sel.value = voices.some(v => v.name === S.settings.voice) ? S.settings.voice : "";
}
function pickVoice() {
  if (!voices.length) loadVoices(); // a lista de vozes chega depois do carregamento em alguns navegadores
  return voices.find(x => x.name === S.settings.voice) || voices[0] || null;
}
let warnedVoice = false;
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
let speaking = false;

/* ---------- voz IA (Gemini TTS, grátis com a mesma chave) ---------- */
// Personagens originais. Nenhum imita pessoa ou personagem real.
const CHARACTERS = {
  natural:   { nome: "Nova (natural)",            voz: "Aoede",   estilo: "natural, simpática e calorosa, como uma amiga conversando" },
  desenho:   { nome: "Narrador de desenho clássico", voz: "Fenrir", estilo: "como o narrador empolgado de um desenho animado clássico dos anos 80: teatral, exagerado, cheio de energia e bom humor" },
  heroi:     { nome: "Herói de desenho",           voz: "Alnilam", estilo: "como um herói confiante de desenho animado antigo: voz firme, épica e corajosa, sempre otimista" },
  vilao:     { nome: "Vilão trapalhão",            voz: "Algenib", estilo: "como um vilão trapalhão de desenho animado: rouco, dramático e engraçado, que se acha muito esperto" },
  robo:      { nome: "Robô retrô",                 voz: "Iapetus", estilo: "como um robozinho simpático de desenho dos anos 60: cadenciado, preciso e levemente metálico, mas gentil" },
  vovo:      { nome: "Vovó contadora de histórias", voz: "Sulafat", estilo: "como uma avó carinhosa contando história antes de dormir: calma, acolhedora e sorridente" },
  radio:     { nome: "Locutor de rádio",           voz: "Charon",  estilo: "como um locutor de rádio FM: grave, confiante e envolvente" },
  custom:    { nome: "Personalizado",              voz: "Puck",    estilo: "" }
};
const GEMINI_VOICES = { Zephyr: "Brilhante", Puck: "Animada", Charon: "Informativa", Kore: "Firme", Fenrir: "Empolgada", Leda: "Jovem", Orus: "Firme", Aoede: "Leve", Callirrhoe: "Tranquila", Autonoe: "Brilhante", Enceladus: "Sussurrada", Iapetus: "Clara", Umbriel: "Tranquila", Algieba: "Suave", Despina: "Suave", Erinome: "Clara", Algenib: "Rouca", Rasalgethi: "Informativa", Laomedeia: "Animada", Achernar: "Macia", Alnilam: "Firme", Schedar: "Equilibrada", Gacrux: "Madura", Pulcherrima: "Direta", Achird: "Amigável", Zubenelgenubi: "Casual", Vindemiatrix: "Gentil", Sadachbia: "Viva", Sadaltager: "Experiente", Sulafat: "Calorosa" };
let currentAudio = null, ttsCtl = null;
function stopSpeech() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (ttsCtl) { ttsCtl.abort(); ttsCtl = null; }
  if (currentAudio) { currentAudio.onended = null; currentAudio.pause(); URL.revokeObjectURL(currentAudio.src); currentAudio = null; }
  if (speaking) { speaking = false; setMode("idle"); }
}
function charConf() {
  const c = CHARACTERS[S.settings.character] || CHARACTERS.natural;
  const voz = S.settings.character === "custom" ? (S.settings.ttsVoice || c.voz) : c.voz;
  const estilo = S.settings.character === "custom" ? (S.settings.ttsStyle || "natural e simpática") : c.estilo;
  return { voz, estilo: estilo + ". Fale em português do Brasil, com sotaque brasileiro natural." };
}
function findAudio(o) { // procura o áudio em base64 na resposta, seja qual for o formato
  if (!o || typeof o !== "object") return null;
  if (typeof o.data === "string" && o.data.length > 200 && (o.type === "audio" || /audio/.test(o.mime_type || o.mimeType || ""))) return { data: o.data, mime: o.mime_type || o.mimeType || "" };
  if (o.inlineData && typeof o.inlineData.data === "string") return { data: o.inlineData.data, mime: o.inlineData.mimeType || "" };
  for (const v of Object.values(o)) { const r = findAudio(v); if (r) return r; }
  return null;
}
function toWav(bytes, rate) {
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return new Blob([bytes], { type: "audio/wav" }); // já é WAV
  const h = new DataView(new ArrayBuffer(44)); const w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); h.setUint32(4, 36 + bytes.length, true); w(8, "WAVE"); w(12, "fmt "); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, "data"); h.setUint32(40, bytes.length, true);
  return new Blob([h.buffer, bytes], { type: "audio/wav" });
}
let ttsCooldown = 0;
async function geminiSpeak(text) {
  const key = (S.settings.apiKey || "").trim(); if (!key || !navigator.onLine || Date.now() < ttsCooldown) return false;
  const { voz, estilo } = charConf();
  ttsCtl = new AbortController(); const signal = ttsCtl.signal;
  for (const model of [S.settings.ttsModel || "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]) {
    let r;
    try {
      r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", { method: "POST", signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ model, input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: estilo }] }] }],
          response_format: { type: "audio" }, generation_config: { speech_config: [{ voice: voz }] } }) });
    } catch (e) { return e.name === "AbortError" ? "cancelled" : false; }
    if (!r.ok) { if (r.status === 429) ttsCooldown = Date.now() + 60000; continue; }
    const a = findAudio(await r.json()); if (!a) continue;
    const bin = atob(a.data); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const rate = +((a.mime.match(/rate=(\d+)/) || [])[1]) || 24000;
    if (signal.aborted) return "cancelled";
    setMode("speaking");
    return new Promise(res => {
      const au = new Audio(URL.createObjectURL(toWav(bytes, rate))); currentAudio = au;
      au.onended = () => { URL.revokeObjectURL(au.src); currentAudio = null; res(true); };
      au.onerror = () => { currentAudio = null; res(false); };
      au.play().catch(() => { currentAudio = null; res(false); });
    });
  }
  return false;
}
async function speak(text, force) {
  if (!S.settings.speak && !force) { afterSpeak(); return; }
  stopSpeech(); pauseWake();
  if (S.settings.engine !== "browser" && S.settings.apiKey) {
    let t = plain(text).trim(); if (t.length > 1200) t = t.slice(0, 1200).replace(/[^.!?]*$/, "") || t.slice(0, 1200);
    speaking = true; setMode("thinking", "Preparando a voz");
    const ok = await geminiSpeak(t.replace(/^\s*(lembrete:)/i, "$1 "));
    if (ok === "cancelled") return;
    if (ok) { speaking = false; setMode("idle"); afterSpeak(); return; }
    speaking = false; // voz IA indisponível agora: usa a do navegador
  }
  browserSpeak(text);
}
function browserSpeak(text) {
  if (!("speechSynthesis" in window)) { afterSpeak(); return; }
  speechSynthesis.cancel();
  const chunks = plain(text).match(/[^.!?;:]+[.!?;:]*\s*/g) || []; const parts = []; let cur = "";
  for (const c of chunks) { if ((cur + c).length > 200) { if (cur) parts.push(cur); cur = c; } else cur += c; }
  if (cur.trim()) parts.push(cur);
  if (!parts.length) { afterSpeak(); return; }
  const v = pickVoice();
  if (!v) {
    if (!warnedVoice) { warnedVoice = true; toast("Este navegador não tem voz em português. Use o Microsoft Edge (vozes naturais) ou o Chrome.", true); }
    afterSpeak(); return; // melhor ficar em silêncio do que falar português com sotaque inglês
  }
  speaking = true; setMode("speaking");
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p); u.voice = v; u.lang = v.lang; u.rate = +S.settings.rate || 1; u.pitch = 1;
    if (i === parts.length - 1) { u.onend = () => { speaking = false; setMode("idle"); afterSpeak(); }; u.onerror = () => { speaking = false; setMode("idle"); afterSpeak(); }; }
    speechSynthesis.speak(u);
  });
}
function afterSpeak() {
  if (S.settings.wake) { resumeWake(); return; }
  if (S.settings.loop && SR && !busy) setTimeout(listen, 350);
}

/* ---------- voz: escuta (Web Speech API) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
function micError(e) {
  if (e === "not-allowed" || e === "service-not-allowed") toast("Permita o microfone para este site nas configurações do navegador.", true);
  else if (e === "audio-capture") toast("Nenhum microfone encontrado.", true);
  else if (e === "network") toast("O reconhecimento de voz precisa de internet.", true);
}
function listen() {
  if (!SR) { toast("Este navegador não reconhece fala. Use o Chrome ou o ditado do teclado.", true); $("#input").focus(); return; }
  if (listening) { rec && rec.stop(); return; }
  stopSpeech();
  pauseWake();
  rec = new SR(); rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = false; let finalT = "";
  rec.onstart = () => { listening = true; $("#micBtn").classList.add("on"); setMode("listening"); };
  rec.onresult = e => { let t = ""; for (const r of e.results) { t += r[0].transcript; if (r.isFinal) finalT = t; } $("#input").value = t; grow(); };
  rec.onerror = e => micError(e.error);
  rec.onend = () => {
    listening = false; $("#micBtn").classList.remove("on"); if ($("#app").dataset.mode === "listening") setMode("idle");
    const t = ($("#input").value || "").trim(); if (finalT && t) send(t); else resumeWake();
  };
  try { rec.start(); } catch (e) { toast("Não consegui abrir o microfone.", true); }
}

/* ---------- palavra de ativação ---------- */
let wakeRec = null, wakeOn = false, awaiting = false, wakeTimer = null;
function startWake() {
  if (!SR) { toast("A palavra de ativação precisa do Chrome ou Edge.", true); S.settings.wake = false; save(); renderTop(); return; }
  if (wakeOn || busy || speaking || listening) return;
  wakeRec = new SR(); wakeRec.lang = "pt-BR"; wakeRec.continuous = true; wakeRec.interimResults = false;
  const word = norm(S.settings.name || "Nova");
  wakeRec.onresult = e => {
    const r = e.results[e.results.length - 1]; if (!r.isFinal) return;
    const said = r[0].transcript.trim(); const n = norm(said);
    if (awaiting) { awaiting = false; clearTimeout(wakeTimer); if (said) { stopWake(); send(said); } return; }
    const i = n.indexOf(word);
    if (i >= 0) {
      const rest = said.slice(i + word.length).replace(/^[\s,.!?]+/, "");
      if (rest.length > 3) { stopWake(); send(rest); }
      else { awaiting = true; setMode("listening"); beep(); clearTimeout(wakeTimer); wakeTimer = setTimeout(() => { awaiting = false; setMode("idle"); }, 8000); }
    }
  };
  wakeRec.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { micError(e.error); S.settings.wake = false; save(); renderTop(); } };
  wakeRec.onend = () => { wakeOn = false; if (S.settings.wake && !busy && !speaking && !listening) setTimeout(startWake, 400); };
  try { wakeRec.start(); wakeOn = true; setMode("idle"); } catch (e) { wakeOn = false; }
}
function stopWake() { if (wakeRec) { const r = wakeRec; wakeRec = null; r.onend = () => { wakeOn = false; }; try { r.abort(); } catch (e) {} } wakeOn = false; }
function pauseWake() { if (wakeOn) stopWake(); }
function resumeWake() { if (S.settings.wake) setTimeout(startWake, 300); }
let actx;
function beep() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(.08, actx.currentTime); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + .18);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + .2); } catch (e) {}
}

/* ---------- IA: Gemini API ---------- */
function context() {
  const now = new Date();
  const tasks = S.tasks.filter(t => !t.done).slice(0, 60).map(t => ({ id: t.id, titulo: t.title, quando: t.when || null, notas: t.notes || undefined }));
  const done = S.tasks.filter(t => t.done).slice(-10).map(t => ({ id: t.id, titulo: t.title }));
  const mem = S.memory.map(m => ({ id: m.id, fato: m.text }));
  const pad = n => String(n).padStart(2, "0");
  return `Você é ${S.settings.name}, assistente pessoal de ${S.settings.user}. Fale em português do Brasil, com tom próximo e natural.
Agora: ${now.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}. Hoje em ISO: ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.
Tarefas abertas: ${JSON.stringify(tasks)}
Concluídas recentes: ${JSON.stringify(done)}
Memórias sobre o usuário: ${JSON.stringify(mem)}
Clima (dados reais do Open-Meteo): ${weather ? JSON.stringify(weather) : "indisponível"}
Notícias (manchetes reais de feeds RSS${newsAt ? ", atualizadas em " + newsAt : ""}): ${news.length ? JSON.stringify(news.slice(0, 15).map(n => ({ titulo: n.titulo, fonte: n.fonte, link: n.link }))) : "indisponíveis"}
Regras:
- Respostas curtas e diretas, porque costumam ser lidas em voz alta. Texto longo só para conteúdo pedido (roteiro, post, legenda, e-mail).
- Nunca invente notícias, números, cotações, clima ou fatos. Use só os dados acima. Se pedirem algo atual que não está aqui, diga que não tem esse dado. Ao citar notícia, diga a fonte.
- Use as ferramentas para criar, concluir ou apagar tarefas e para salvar ou apagar memórias quando o usuário pedir. Lembrete com horário: 'quando' em ISO local (AAAA-MM-DDTHH:MM). Depois de usar uma ferramenta, confirme em uma frase.
- Ao criar conteúdo para publicar, escreva já otimizado para SEO da plataforma de destino (palavras-chave naturais, título forte, hashtags quando for rede social), em linguagem humana.
- Não use tabelas. Use listas curtas só quando ajudarem.`;
}
const TOOLS = [
  { name: "criar_tarefa", description: "Cria uma tarefa ou lembrete.", parameters: { type: "object", properties: { titulo: { type: "string" }, quando: { type: "string", description: "Data e hora local AAAA-MM-DDTHH:MM, opcional" }, notas: { type: "string" } }, required: ["titulo"] },
    run(i) { const t = { id: uid(), title: String(i.titulo || "").slice(0, 200), when: i.quando && !isNaN(new Date(i.quando)) ? String(i.quando).slice(0, 16) : null, notes: i.notas ? String(i.notas).slice(0, 300) : "", done: false, created: new Date().toISOString() };
      if (!t.title) throw new Error("título vazio"); S.tasks.push(t); save(); render(); return { ok: true, id: t.id }; } },
  { name: "concluir_tarefa", description: "Marca uma tarefa como concluída pelo id.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run(i) { const t = S.tasks.find(x => x.id === String(i.id)); if (!t) throw new Error("tarefa não encontrada"); t.done = true; t.doneAt = new Date().toISOString(); save(); render(); return { ok: true }; } },
  { name: "apagar_tarefa", description: "Apaga uma tarefa pelo id. Use só se o usuário pedir para apagar ou cancelar.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run(i) { const k = S.tasks.findIndex(x => x.id === String(i.id)); if (k < 0) throw new Error("tarefa não encontrada"); const [t] = S.tasks.splice(k, 1); save(); render(); toast("Tarefa apagada: " + t.title, false, () => { S.tasks.splice(k, 0, t); save(); render(); }); return { ok: true }; } },
  { name: "salvar_memoria", description: "Guarda um fato duradouro sobre o usuário quando ele pedir para lembrar algo.", parameters: { type: "object", properties: { fato: { type: "string" } }, required: ["fato"] },
    run(i) { const f = String(i.fato || "").trim().slice(0, 300); if (!f) throw new Error("vazio"); S.memory.push({ id: uid(), text: f, created: new Date().toISOString() }); if (S.memory.length > 200) S.memory.shift(); save(); render(); return { ok: true }; } },
  { name: "apagar_memoria", description: "Apaga uma memória pelo id quando o usuário pedir para esquecer.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run(i) { const k = S.memory.findIndex(x => x.id === String(i.id)); if (k < 0) throw new Error("não encontrada"); const [m] = S.memory.splice(k, 1); save(); render(); toast("Memória apagada", false, () => { S.memory.splice(k, 0, m); save(); render(); }); return { ok: true }; } }
];
const FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-2.5-flash-lite"];
class AIError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
async function gemini(contents, { system, tools, signal }) {
  const key = (S.settings.apiKey || "").trim();
  if (!key) throw new AIError("Configure a chave do Gemini nos ajustes.", "nokey");
  if (!navigator.onLine) throw new AIError("Sem internet no momento.", "offline");
  const main = (S.settings.model || "gemini-flash-latest").trim();
  const body = { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.7 } };
  if (tools) body.tools = [{ functionDeclarations: TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters })) }];
  // Servidor sobrecarregado (500/503): tenta de novo e depois cai para modelos reserva
  const plan = [main, main, ...FALLBACK_MODELS.filter(m => m !== main)];
  let r, model;
  for (let i = 0; i < plan.length; i++) {
    model = plan[i];
    if (i > 0) { setMode("thinking", i === 1 ? "Tentando de novo" : "Usando modelo reserva"); await new Promise(res => setTimeout(res, i === 1 ? 1500 : 500)); }
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal });
    } catch (e) { if (e.name === "AbortError") throw new AIError("", "cancelled"); throw new AIError("Falha de conexão com o Gemini.", "net"); }
    if (r.ok) break;
    const busy = r.status === 503 || r.status === 500;
    if (r.status === 429) { while (i + 1 < plan.length && plan[i + 1] === model) i++; continue; } // limite do modelo: pula para outro
    if (busy || (r.status === 404 && i >= 2)) continue;
    break;
  }
  if (!r.ok) {
    if (r.status === 503 || r.status === 500) throw new AIError("Os servidores do Gemini estão sobrecarregados agora. Tente de novo em alguns minutos.", "busy");
    let msg = ""; try { msg = (await r.json()).error.message || ""; } catch (e) {}
    if (r.status === 429) throw new AIError("Limite gratuito do Gemini atingido. Espere um minuto ou tente amanhã.", "rate");
    if (r.status === 400 && /API key/i.test(msg)) throw new AIError("Chave do Gemini inválida. Confira nos ajustes.", "key");
    if (r.status === 403) throw new AIError("Chave sem permissão para o Gemini. Gere outra no AI Studio.", "key");
    if (r.status === 404) throw new AIError("Modelo \"" + model + "\" não encontrado. Volte para gemini-flash-latest nos ajustes.", "model");
    throw new AIError("O Gemini respondeu com erro (" + r.status + "). " + msg.slice(0, 120), "http");
  }
  const d = await r.json();
  const cand = d.candidates && d.candidates[0];
  if (!cand || !cand.content) throw new AIError(d.promptFeedback && d.promptFeedback.blockReason ? "O Gemini recusou esse pedido." : "Resposta vazia do Gemini.", "empty");
  return cand.content;
}
async function ask(history, signal) {
  const contents = history.map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
  const system = context();
  for (let round = 0; round < 5; round++) {
    const content = await gemini(contents, { system, tools: true, signal });
    const parts = content.parts || [];
    const calls = parts.filter(p => p.functionCall);
    if (!calls.length) return parts.filter(p => p.text && !p.thought).map(p => p.text).join("").trim();
    contents.push(content);
    const responses = calls.map(p => {
      const tool = TOOLS.find(t => t.name === p.functionCall.name); let result;
      try { result = tool ? tool.run(p.functionCall.args || {}) : { erro: "ferramenta desconhecida" }; } catch (e) { result = { erro: e.message }; }
      return { functionResponse: { name: p.functionCall.name, response: { result } } };
    });
    contents.push({ role: "user", parts: responses });
  }
  return "Feito.";
}

let busy = false, ctl = null;
async function send(text) {
  text = (text || "").trim(); if (!text || busy) return;
  if (!S.settings.apiKey) { openSetup(); return; }
  stopSpeech();
  pauseWake();
  busy = true; $("#input").value = ""; grow(); setSendStop(true);
  S.chat.push({ role: "user", content: text.slice(0, 4000) });
  const M = $("#msgs"); if (S.chat.length === 1) M.innerHTML = "";
  M.append(bubble("user", text));
  const live = bubble("bot", "…"); M.append(live); M.scrollTop = M.scrollHeight; setMode("thinking");
  ctl = new AbortController();
  let answer = "";
  try { answer = await ask(S.chat.slice(-14), ctl.signal); }
  catch (e) {
    if (e.code !== "cancelled") { live.className = "msg note"; live.textContent = e.message || "Algo deu errado."; }
    else live.remove();
  }
  busy = false; setSendStop(false); setMode("idle");
  if (answer) {
    S.chat.push({ role: "assistant", content: answer.slice(0, 8000) }); if (S.chat.length > 40) S.chat = S.chat.slice(-40); save();
    live.innerHTML = md(answer); addActions(live, answer); M.scrollTop = M.scrollHeight; speak(answer);
  } else { S.chat.pop(); save(); resumeWake(); }
}
function setSendStop(on) {
  const b = $("#sendBtn"); b.classList.toggle("stop", on); b.setAttribute("aria-label", on ? "Parar" : "Enviar");
  b.innerHTML = on ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z"/></svg>';
}
async function briefing() {
  if (!S.settings.apiKey) { openSetup(); return; }
  const btn = $("#briefBtn"); btn.disabled = true; $("#briefText").textContent = "Preparando…"; setMode("thinking");
  try {
    const p = `Monte o briefing falado de ${greeting().toLowerCase()} para ${S.settings.user.split(" ")[0]}. Em até 130 palavras: cumprimento, clima de hoje (se houver), compromissos e lembretes de hoje com horário, tarefas atrasadas, as 3 notícias mais relevantes citando a fonte (se houver) e uma sugestão de prioridade. Texto corrido, sem listas e sem markdown.`;
    const content = await gemini([{ role: "user", parts: [{ text: p }] }], { system: context() });
    const text = (content.parts || []).filter(x => x.text && !x.thought).map(x => x.text).join("").trim();
    S.brief = { date: new Date().toDateString(), text }; save(); renderBrief(); speak(text, true);
  } catch (e) { $("#briefText").textContent = e.message || "Não consegui gerar o briefing agora."; setMode("idle"); }
  finally { btn.disabled = false; if ($("#app").dataset.mode === "thinking") setMode("idle"); }
}

/* ---------- lembretes ---------- */
async function notify(title) {
  if (!S.settings.notif || !("Notification" in window) || Notification.permission !== "granted") return;
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) reg.showNotification(S.settings.name + ": lembrete", { body: title, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: title });
    else new Notification(S.settings.name + ": lembrete", { body: title }); } catch (e) {}
}
function checkDue() {
  const now = Date.now(); let changed = false;
  for (const t of S.tasks) {
    if (t.done || !t.when || t.alerted) continue;
    const w = new Date(t.when).getTime();
    if (w <= now) { t.alerted = true; changed = true; if (now - w < 6 * 3600e3) { toast("Lembrete: " + t.title, true); notify(t.title); speak("Lembrete: " + t.title, true); } }
  }
  if (changed) { save(); renderTasks(); renderBrief(); }
}

/* ---------- exportar / importar ---------- */
function exportData() {
  const data = { ...S, settings: { ...S.settings, apiKey: "" }, exportado: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "nova-backup-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast("Backup salvo. Abra a Nova no outro aparelho e use Importar.");
}
function importData(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = merge(JSON.parse(fr.result));
      const key = S.settings.apiKey; const old = S;
      const ids = new Set(S.tasks.map(t => t.id)); d.tasks.forEach(t => { if (!ids.has(t.id)) S.tasks.push(t); });
      const mids = new Set(S.memory.map(m => m.id)); d.memory.forEach(m => { if (!mids.has(m.id)) S.memory.push(m); });
      S.settings = { ...d.settings, apiKey: key || d.settings.apiKey };
      save(); render(); loadWeather(); toast("Dados importados e combinados.", false, () => { S = old; save(); render(); });
    } catch (e) { toast("Arquivo inválido. Use um backup exportado pela Nova.", true); }
  };
  fr.readAsText(file);
}

/* ---------- eventos ---------- */
const CHIPS = [["Meu dia", "O que tenho para hoje e o que devo priorizar?"], ["Clima", "Como está o tempo hoje e amanhã?"], ["Notícias", "Quais as principais notícias de agora?"],
  ["Criar lembrete", "Me lembre de "], ["Ideias de post", "Me dê 5 ideias de post para Instagram sobre "], ["Roteiro curto", "Escreva um roteiro de vídeo curto de 45 segundos sobre "],
  ["Legenda", "Escreva uma legenda com hashtags para "], ["Revisar texto", "Revise este texto e deixe mais claro:\n"]];
CHIPS.forEach(([l, p]) => {
  const c = document.createElement("button"); c.className = "chip"; c.type = "button"; c.textContent = l;
  c.onclick = () => { if (/[\s:]$/.test(p)) { $("#input").value = p; grow(); $("#input").focus(); } else send(p); };
  $("#chips").append(c);
});
function grow() { const t = $("#input"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; }
$("#input").addEventListener("input", grow);
$("#input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(max-width:860px)").matches) { e.preventDefault(); send($("#input").value); } });
$("#form").addEventListener("submit", e => { e.preventDefault(); if (busy) { ctl && ctl.abort(); return; } send($("#input").value); });
$("#micBtn").onclick = listen;
$("#briefBtn").onclick = briefing;
$("#voiceBtn").onclick = () => { S.settings.speak = !S.settings.speak; if (!S.settings.speak) stopSpeech(); save(); renderTop(); toast(S.settings.speak ? "Voz ligada" : "Voz desligada"); };
$("#wakeBtn").onclick = () => {
  S.settings.wake = !S.settings.wake; save(); renderTop();
  if (S.settings.wake) { startWake(); toast(`Escutando. Diga "${S.settings.name}" e o pedido.`); } else { stopWake(); awaiting = false; setMode("idle"); toast("Escuta desligada"); }
};
$("#taskWhen").addEventListener("change", e => e.target.classList.toggle("has", !!e.target.value));
$("#taskForm").addEventListener("submit", e => {
  e.preventDefault(); const v = $("#taskIn").value.trim(); if (!v) return; const w = $("#taskWhen").value;
  S.tasks.push({ id: uid(), title: v.slice(0, 200), when: w || null, notes: "", done: false, created: new Date().toISOString() });
  $("#taskIn").value = ""; $("#taskWhen").value = ""; $("#taskWhen").classList.remove("has"); save(); render();
});
$("#memForm").addEventListener("submit", e => { e.preventDefault(); const v = $("#memIn").value.trim(); if (!v) return; S.memory.push({ id: uid(), text: v.slice(0, 300), created: new Date().toISOString() }); $("#memIn").value = ""; save(); render(); });
document.querySelectorAll(".nav button").forEach(b => b.onclick = () => setView(b.dataset.v));
function setView(v) { document.body.dataset.view = v; document.querySelectorAll(".nav button").forEach(b => b.setAttribute("aria-current", b.dataset.v === v)); try { localStorage.setItem("nova-view", v); } catch (e) {} }


/* ---------- ajustes de voz ---------- */
$("#sChar").innerHTML = Object.entries(CHARACTERS).map(([k, c]) => `<option value="${k}">${esc(c.nome)}</option>`).join("");
$("#sTtsVoice").innerHTML = Object.entries(GEMINI_VOICES).map(([k, d]) => `<option value="${k}">${k} · ${d}</option>`).join("");
function syncVoiceUI() {
  const ai = $("#sEngine").value !== "browser";
  $("#aiVoiceBox").hidden = !ai; $("#browserVoiceBox").hidden = ai;
  $("#customBox").hidden = $("#sChar").value !== "custom";
}
$("#sEngine").addEventListener("change", syncVoiceUI); $("#sChar").addEventListener("change", syncVoiceUI);
$("#sampleBtn").onclick = async () => {
  const keep = { ...S.settings };
  Object.assign(S.settings, { engine: $("#sEngine").value, character: $("#sChar").value, ttsVoice: $("#sTtsVoice").value, ttsStyle: $("#sTtsStyle").value, voice: $("#sVoice").value, rate: +$("#sRate").value || 1, apiKey: $("#sKey").value.trim() || keep.apiKey });
  const b = $("#sampleBtn"); b.disabled = true; b.textContent = "Gerando…";
  await speak(`Oi, ${(S.settings.user || "").split(" ")[0]}! Esta é a minha voz. O que vamos fazer hoje?`, true);
  S.settings = keep; b.disabled = false; b.textContent = "▶ Ouvir amostra";
};
function openSetup() { $("#keyIn").value = S.settings.apiKey || ""; $("#cityIn").value = S.settings.city || ""; $("#setup").hidden = false; }
$("#setupSave").onclick = () => {
  const k = $("#keyIn").value.trim(); if (!k) { toast("Cole a chave do Gemini para continuar.", true); return; }
  S.settings.apiKey = k; S.settings.city = $("#cityIn").value.trim(); save(); $("#setup").hidden = true; loadWeather(); toast("Tudo pronto. Pode falar comigo.");
};
$("#setupSkip").onclick = () => { $("#setup").hidden = true; try { localStorage.setItem("nova-setup-skip", "1"); } catch (e) {} };

$("#setBtn").onclick = () => {
  const s = S.settings; $("#sName").value = s.name; $("#sUser").value = s.user; $("#sCity").value = s.city; $("#sSpeak").checked = s.speak; $("#sLoop").checked = s.loop;
  $("#sVoice").value = s.voice || ""; $("#sRate").value = s.rate; $("#sEngine").value = s.engine; $("#sChar").value = s.character;
  $("#sTtsVoice").value = s.ttsVoice; $("#sTtsStyle").value = s.ttsStyle; syncVoiceUI(); $("#sKey").value = s.apiKey; $("#sModel").value = s.model; $("#sNotif").checked = s.notif; $("#sheet").hidden = false;
};
async function closeSet() {
  const s = S.settings, oldCity = s.city, oldName = s.name;
  s.name = $("#sName").value.trim() || "Nova"; s.user = $("#sUser").value.trim() || "você"; s.city = $("#sCity").value.trim();
  s.speak = $("#sSpeak").checked; s.loop = $("#sLoop").checked; s.voice = $("#sVoice").value; s.rate = +$("#sRate").value || 1;
  s.engine = $("#sEngine").value; s.character = $("#sChar").value; s.ttsVoice = $("#sTtsVoice").value; s.ttsStyle = $("#sTtsStyle").value.trim().slice(0, 300);
  s.apiKey = $("#sKey").value.trim(); s.model = $("#sModel").value.trim() || "gemini-flash-latest";
  const wantNotif = $("#sNotif").checked;
  if (wantNotif && "Notification" in window && Notification.permission !== "granted") { const p = await Notification.requestPermission(); s.notif = p === "granted"; if (!s.notif) toast("Notificações bloqueadas pelo navegador.", true); }
  else s.notif = wantNotif && "Notification" in window;
  $("#sheet").hidden = true; save(); render();
  if (s.city !== oldCity) loadWeather();
  if (s.name !== oldName && s.wake) { stopWake(); startWake(); }
}
$("#closeSet").onclick = closeSet; $("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSet(); });
$("#clearChat").onclick = () => { const old = S.chat; S.chat = []; save(); renderChat(); toast("Conversa limpa", false, () => { S.chat = old; save(); renderChat(); }); };
$("#exportBtn").onclick = exportData;
$("#importIn").addEventListener("change", e => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ""; });
window.addEventListener("online", () => { renderTop(); loadWeather(); loadNews(); });
window.addEventListener("offline", renderTop);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderBrief(); checkDue(); } });

function tick() { const d = new Date(); $("#clk").textContent = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); $("#clkd").textContent = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
setInterval(tick, 15000); tick();
setInterval(checkDue, 30000);
setInterval(() => { loadWeather(); loadNews(); }, 30 * 60000);

/* ---------- início ---------- */
let v = "chat"; try { v = localStorage.getItem("nova-view") || "chat"; } catch (e) {}
setView(v); render(); loadWeather(); loadNews(); checkDue();
let skipped = false; try { skipped = localStorage.getItem("nova-setup-skip") === "1"; } catch (e) {}
if (!S.settings.apiKey && !skipped) openSetup();
if (S.settings.wake) setTimeout(startWake, 800);
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
