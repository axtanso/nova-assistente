// VEGA · widget para iPhone (app Scriptable)
// Mostra seus compromissos de hoje (Calendário do iPhone) e as 3 notícias mais recentes do seu interesse.
// Tamanhos: pequeno, médio ou grande. Toque no widget para abrir a VEGA; toque numa notícia para abri-la.

// ======= AJUSTE AQUI =======
const VEGA_URL = "https://axtanso.github.io/vega-assistente/";
// Temas do seu interesse (sem acento ou com, tanto faz). A notícia com mais temas aparece primeiro.
const INTERESSES = [
  "tecnologia", "celular", "smartphone", "iphone", "samsung", "galaxy", "xiaomi", "poco", "motorola", "android", "apple",
  "google", "inteligencia artificial", "ia", "chatgpt", "gemini", "claude", "game", "games", "jogo", "jogos", "playstation",
  "xbox", "nintendo", "pc", "notebook", "processador", "chip", "lancamento", "antutu", "streaming", "netflix", "youtube"
];
// ===========================

const NEWS_URL = VEGA_URL + "news.json";
const C = { bg: "#020506", fg: "#e2f6ea", muted: "#8fb3a2", accent: "#c4f0d8", warm: "#ffc670", line: "#1d3a31" };
const family = config.widgetFamily || "large";
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "vega-news-cache.json");

const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const termos = INTERESSES.map(norm);
const fmtHora = d => { const f = new DateFormatter(); f.dateFormat = "HH:mm"; return f.string(d); };

async function carregarNoticias() {
  try {
    const req = new Request(NEWS_URL + "?t=" + Math.floor(Date.now() / 600000));
    req.timeoutInterval = 10;
    const d = await req.loadJSON();
    if (d && Array.isArray(d.itens)) { fm.writeString(cachePath, JSON.stringify(d)); return d.itens; }
  } catch (e) {}
  try { return JSON.parse(fm.readString(cachePath)).itens || []; } catch (e) { return []; } // sem internet: última lista salva
}

function pontuar(n) {
  const t = " " + norm(n.titulo).replace(/[^a-z0-9]+/g, " ") + " ";
  let acertos = 0;
  for (const k of termos) if (t.includes(" " + k + " ")) acertos++;
  const horas = n.data ? (Date.now() - new Date(n.data).getTime()) / 3600e3 : 48;
  return acertos * 10 + (n.categoria === "Tecnologia" ? 4 : 0) - Math.min(horas, 72) * 0.15 + (acertos ? 100 : 0);
}

async function carregarAgenda() {
  const agora = new Date(), itens = [];
  try {
    const evs = await CalendarEvent.today([]);
    for (const e of evs) if (e.endDate > agora) itens.push({ quando: e.isAllDay ? "dia todo" : fmtHora(e.startDate), titulo: e.title, ord: e.isAllDay ? 0 : e.startDate.getTime() });
  } catch (e) {}
  try {
    const rems = await Reminder.allDueToday();
    for (const r of rems) if (!r.isCompleted) itens.push({ quando: r.dueDate && r.dueDateIncludesTime ? fmtHora(r.dueDate) : "lembrete", titulo: r.title, ord: r.dueDate ? r.dueDate.getTime() : 1 });
  } catch (e) {}
  return itens.sort((a, b) => a.ord - b.ord);
}

function titulo(stack, txt) {
  const row = stack.addStack(); row.centerAlignContent();
  const dot = row.addText("■ "); dot.font = Font.boldSystemFont(8); dot.textColor = new Color(C.accent);
  const t = row.addText(txt); t.font = Font.semiboldMonospacedSystemFont(10); t.textColor = new Color(C.accent);
}

const [noticias, agenda] = await Promise.all([carregarNoticias(), carregarAgenda()]);
const top = noticias.map(n => ({ ...n, p: pontuar(n) })).sort((a, b) => b.p - a.p).slice(0, 3);

const w = new ListWidget();
w.backgroundColor = new Color(C.bg);
w.url = VEGA_URL;
w.setPadding(14, 14, 12, 14);
w.refreshAfterDate = new Date(Date.now() + 30 * 60000);

// cabeçalho
const head = w.addStack(); head.centerAlignContent();
const logo = head.addText("VEGA"); logo.font = Font.heavyMonospacedSystemFont(family === "small" ? 14 : 16); logo.textColor = new Color(C.accent);
head.addSpacer();
const df = new DateFormatter(); df.locale = "pt_BR"; df.dateFormat = family === "small" ? "dd/MM" : "EEE, d 'de' MMM";
const dt = head.addText(df.string(new Date())); dt.font = Font.mediumMonospacedSystemFont(10); dt.textColor = new Color(C.muted);
w.addSpacer(family === "small" ? 6 : 8);

const maxAgenda = { small: 1, medium: 2, large: 4 }[family] ?? 3;
const maxNews = { small: 1, medium: 2, large: 3 }[family] ?? 3;

// compromissos
titulo(w, "HOJE");
w.addSpacer(3);
if (!agenda.length) {
  const t = w.addText("Nenhum compromisso pela frente"); t.font = Font.systemFont(12); t.textColor = new Color(C.muted);
} else {
  for (const a of agenda.slice(0, maxAgenda)) {
    const row = w.addStack(); row.centerAlignContent(); row.spacing = 6;
    const h = row.addText(a.quando); h.font = Font.mediumMonospacedSystemFont(11); h.textColor = new Color(C.warm); h.lineLimit = 1;
    const t = row.addText(a.titulo); t.font = Font.systemFont(12); t.textColor = new Color(C.fg); t.lineLimit = 1;
    w.addSpacer(2);
  }
  if (agenda.length > maxAgenda) { const m = w.addText(`+${agenda.length - maxAgenda} hoje`); m.font = Font.systemFont(10); m.textColor = new Color(C.muted); }
}

// notícias
if (family !== "small" || !agenda.length) {
  w.addSpacer(family === "large" ? 10 : 6);
  titulo(w, "NOTÍCIAS PRA VOCÊ");
  w.addSpacer(3);
  if (!top.length) {
    const t = w.addText("Sem notícias agora"); t.font = Font.systemFont(12); t.textColor = new Color(C.muted);
  } else {
    for (const n of top.slice(0, maxNews)) {
      const s = w.addStack(); s.layoutVertically();
      if (/^https?:\/\//.test(n.link) && family !== "small") s.url = n.link;
      const t = s.addText(n.titulo); t.font = Font.mediumSystemFont(family === "large" ? 13 : 12); t.textColor = new Color(C.fg); t.lineLimit = family === "large" ? 2 : 1;
      const f = s.addText(n.fonte + (n.data ? " · " + fmtHora(new Date(n.data)) : "")); f.font = Font.mediumMonospacedSystemFont(9); f.textColor = new Color(C.muted);
      w.addSpacer(family === "large" ? 6 : 3);
    }
  }
}
w.addSpacer();

if (config.runsInWidget) Script.setWidget(w);
else await w.presentLarge();
Script.complete();
