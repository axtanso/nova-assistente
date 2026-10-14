/* VEGA · contas conectadas: Gmail, Google Agenda e Outlook (e-mail + calendário)
   Privacidade (modelo 2): para a IA vão só remetente, assunto, data e um trecho curto de cada e-mail.
   Os tokens de acesso ficam só neste aparelho. A VEGA não envia nem apaga e-mails. */
window.VegaContas = (function () {
  "use strict";
  const TK = "vega-tokens";
  const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const REDIRECT = location.origin + location.pathname;
  const TRECHO = 160; // máximo de caracteres de cada e-mail enviados para a IA

  let cfg = () => ({}); // configurações (definidas pelo app)
  let notify = () => {};
  const tok = (() => { try { return JSON.parse(localStorage.getItem(TK) || "{}"); } catch (e) { return {}; } })();
  const saveTok = () => { try { localStorage.setItem(TK, JSON.stringify(tok)); } catch (e) {} };
  const valid = t => t && t.access && t.exp > Date.now() + 60000;

  class ContaError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

  /* ---------------- Google (Gmail + Agenda) ---------------- */
  const G_SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events";
  let gisLoaded = null, gClient = null, gPending = null;
  function loadGis() {
    if (gisLoaded) return gisLoaded;
    gisLoaded = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = res; s.onerror = () => { gisLoaded = null; rej(new ContaError("Não consegui carregar o login do Google.", "load")); };
      document.head.append(s);
    });
    return gisLoaded;
  }
  async function googleAuth(prompt) {
    const id = (cfg().googleClientId || "").trim();
    if (!id) throw new ContaError("Falta o ID do cliente Google nos ajustes.", "config");
    await loadGis();
    if (!gClient || gClient._id !== id) {
      gClient = google.accounts.oauth2.initTokenClient({ client_id: id, scope: G_SCOPES, callback: r => {
        const p = gPending; gPending = null; if (!p) return;
        if (r.error) return p.rej(new ContaError("O Google não autorizou (" + r.error + ").", "denied"));
        tok.google = { access: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 }; saveTok(); p.res(tok.google);
      }, error_callback: e => { const p = gPending; gPending = null; if (p) p.rej(new ContaError(e && e.type === "popup_closed" ? "Janela do Google fechada." : "O login do Google foi bloqueado. Permita pop-ups para este site.", "popup")); } });
      gClient._id = id;
    }
    return new Promise((res, rej) => { gPending = { res, rej }; gClient.requestAccessToken({ prompt }); });
  }
  async function gToken() {
    if (valid(tok.google)) return tok.google.access;
    if (!tok.google) throw new ContaError("Google não conectado.", "off");
    throw new ContaError("A conexão com o Google expirou. Toque em qualquer lugar da VEGA ou em Ajustes → Reconectar Google.", "expired");
  }
  async function gFetch(url, opt = {}) {
    const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + await gToken() } });
    if (r.status === 401) { tok.google.exp = 0; saveTok(); throw new ContaError("A conexão com o Google expirou. Reconecte nos ajustes.", "expired"); }
    if (r.status === 403) throw new ContaError("O Google recusou o acesso. Confira se as APIs do Gmail e da Agenda estão ativadas no projeto.", "forbidden");
    if (!r.ok) throw new ContaError("Google respondeu com erro " + r.status + ".", "http");
    return r.status === 204 ? null : r.json();
  }
  const nomeRemetente = from => { const m = String(from || "").match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/); if (!m) return String(from || "").replace(/<.*>/, "").trim();
    const dom = m[2].split("@")[1] || ""; return (m[1] || m[2]).trim() + (dom ? " (" + dom + ")" : ""); };
  const curto = t => String(t || "").replace(/\s+/g, " ").trim().slice(0, TRECHO);
  async function gmailList(filtro, n) {
    const q = filtro || "is:unread category:primary newer_than:3d";
    const lst = await gFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=" + n + "&q=" + encodeURIComponent(q));
    const ids = (lst.messages || []).map(m => m.id);
    const msgs = await Promise.all(ids.map(id => gFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + id + "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date").catch(() => null)));
    return msgs.filter(Boolean).map(m => { const h = n => (m.payload.headers.find(x => x.name.toLowerCase() === n) || {}).value || "";
      return { conta: "Gmail", de: nomeRemetente(h("from")), assunto: h("subject") || "(sem assunto)", data: new Date(+m.internalDate).toISOString(),
        importante: (m.labelIds || []).includes("IMPORTANT"), nao_lido: (m.labelIds || []).includes("UNREAD"), trecho: curto(m.snippet), link: "https://mail.google.com/mail/u/0/#inbox/" + m.id }; });
  }
  async function gCalList(from, to) {
    const d = await gFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=" + encodeURIComponent(from.toISOString()) + "&timeMax=" + encodeURIComponent(to.toISOString()));
    return (d.items || []).map(e => ({ conta: "Google", id: e.id, titulo: e.summary || "(sem título)", inicio: e.start.dateTime || e.start.date, fim: (e.end || {}).dateTime || (e.end || {}).date, dia_todo: !e.start.dateTime, local: e.location || undefined }));
  }
  async function gCalCreate(ev) {
    const d = await gFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: ev.titulo, location: ev.local || undefined, description: "Criado pela VEGA", start: { dateTime: ev.inicio, timeZone: TZ }, end: { dateTime: ev.fim, timeZone: TZ } }) });
    return { id: d.id, link: d.htmlLink, undo: () => gFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + d.id, { method: "DELETE" }) };
  }

  /* ---------------- Microsoft (Outlook e-mail + calendário) ---------------- */
  const M_SCOPES = "offline_access User.Read Mail.Read Calendars.ReadWrite";
  const M_AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/";
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  async function msAuth() {
    const id = (cfg().msClientId || "").trim();
    if (!id) throw new ContaError("Falta o ID do aplicativo Microsoft nos ajustes.", "config");
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const url = M_AUTH + "authorize?" + new URLSearchParams({ client_id: id, response_type: "code", redirect_uri: REDIRECT, response_mode: "query", scope: M_SCOPES, code_challenge: challenge, code_challenge_method: "S256", state, prompt: "select_account" });
    const pop = window.open(url, "vega-ms", "width=500,height=680");
    if (!pop) throw new ContaError("O navegador bloqueou a janela da Microsoft. Permita pop-ups para este site.", "popup");
    const qs = await new Promise((res, rej) => {
      const onMsg = e => { if (e.origin === location.origin && e.data && e.data.vegaAuth) { cleanup(); res(e.data.vegaAuth); } };
      const t = setInterval(() => {
        // Plano B: lê o endereço da janela quando ela volta para a VEGA (caso o navegador corte a comunicação entre janelas)
        try { if (pop.location.origin === location.origin && /[?&](code|error)=/.test(pop.location.search)) { const q = pop.location.search; cleanup(); pop.close(); return res(q); } } catch (e) {}
        if (pop.closed) { cleanup(); rej(new ContaError("Janela da Microsoft fechada.", "popup")); }
      }, 500);
      const cleanup = () => { clearInterval(t); removeEventListener("message", onMsg); };
      addEventListener("message", onMsg);
    });
    const p = new URLSearchParams(qs);
    if (p.get("error")) throw new ContaError("A Microsoft não autorizou: " + (p.get("error_description") || p.get("error")).slice(0, 140), "denied");
    if (p.get("state") !== state) throw new ContaError("Resposta de login inválida.", "state");
    return msToken({ grant_type: "authorization_code", code: p.get("code"), redirect_uri: REDIRECT, code_verifier: verifier });
  }
  async function msToken(params) {
    const r = await fetch(M_AUTH + "token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg().msClientId.trim(), scope: M_SCOPES, ...params }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { if (params.grant_type === "refresh_token") { delete tok.ms; saveTok(); } throw new ContaError("Falha no login da Microsoft: " + String(d.error_description || d.error || r.status).slice(0, 140), "token"); }
    tok.ms = { access: d.access_token, refresh: d.refresh_token || (tok.ms && tok.ms.refresh), exp: Date.now() + (d.expires_in || 3600) * 1000 }; saveTok();
    return tok.ms;
  }
  async function msTok() {
    if (valid(tok.ms)) return tok.ms.access;
    if (tok.ms && tok.ms.refresh) return (await msToken({ grant_type: "refresh_token", refresh_token: tok.ms.refresh })).access; // renova sem janela
    throw new ContaError(tok.ms ? "A conexão com o Outlook expirou. Reconecte nos ajustes." : "Outlook não conectado.", tok.ms ? "expired" : "off");
  }
  async function msFetch(path, opt = {}) {
    const r = await fetch("https://graph.microsoft.com/v1.0" + path, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + await msTok(), Prefer: 'outlook.timezone="' + TZ + '"' } });
    if (r.status === 401) { if (tok.ms) { tok.ms.exp = 0; saveTok(); } throw new ContaError("A conexão com o Outlook expirou. Reconecte nos ajustes.", "expired"); }
    if (!r.ok) throw new ContaError("Outlook respondeu com erro " + r.status + ".", "http");
    return r.status === 204 ? null : r.json();
  }
  async function msMailList(n) {
    const since = new Date(Date.now() - 3 * 864e5).toISOString();
    const d = await msFetch("/me/mailFolders/inbox/messages?$top=" + n + "&$select=subject,from,receivedDateTime,bodyPreview,isRead,importance,webLink&$filter=" + encodeURIComponent("receivedDateTime ge " + since + " and isRead eq false") + "&$orderby=" + encodeURIComponent("receivedDateTime desc"));
    return (d.value || []).map(m => { const a = (m.from || {}).emailAddress || {}; const dom = (a.address || "").split("@")[1] || "";
      return { conta: "Outlook", de: (a.name || a.address || "?") + (dom ? " (" + dom + ")" : ""), assunto: m.subject || "(sem assunto)", data: m.receivedDateTime, importante: m.importance === "high", nao_lido: !m.isRead, trecho: curto(m.bodyPreview), link: m.webLink }; });
  }
  async function msCalList(from, to) {
    const d = await msFetch("/me/calendarView?startDateTime=" + encodeURIComponent(from.toISOString()) + "&endDateTime=" + encodeURIComponent(to.toISOString()) + "&$select=id,subject,start,end,location,isAllDay&$orderby=start/dateTime&$top=25");
    return (d.value || []).map(e => ({ conta: "Outlook", id: e.id, titulo: e.subject || "(sem título)", inicio: e.start.dateTime, fim: e.end.dateTime, dia_todo: e.isAllDay, local: (e.location || {}).displayName || undefined }));
  }
  async function msCalCreate(ev) {
    const d = await msFetch("/me/events", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: ev.titulo, body: { contentType: "text", content: "Criado pela VEGA" }, start: { dateTime: ev.inicio, timeZone: TZ }, end: { dateTime: ev.fim, timeZone: TZ }, location: ev.local ? { displayName: ev.local } : undefined }) });
    return { id: d.id, link: d.webLink, undo: () => msFetch("/me/events/" + d.id, { method: "DELETE" }) };
  }

  /* ---------------- API usada pelo app ---------------- */
  const connected = () => ({ google: !!tok.google, outlook: !!tok.ms });
  const any = () => !!(tok.google || tok.ms);
  const plus = (iso, min) => { const d = new Date(iso); d.setMinutes(d.getMinutes() + min); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`; };
  const local = iso => { const s = String(iso).slice(0, 16); return s.length === 16 ? s + ":00" : s; };

  async function emails({ conta = "todas", filtro = "", quantidade = 8 } = {}) {
    const n = Math.max(1, Math.min(15, +quantidade || 8)), out = [], erros = [];
    if (tok.google && conta !== "outlook") { try { out.push(...await gmailList(filtro, n)); } catch (e) { erros.push("Gmail: " + e.message); } }
    if (tok.ms && conta !== "gmail") { try { out.push(...await msMailList(n)); } catch (e) { erros.push("Outlook: " + e.message); } }
    if (!any()) return { erro: "Nenhuma conta de e-mail conectada. Conecte em Ajustes → Contas." };
    out.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    return { emails: out.slice(0, n * 2), erros: erros.length ? erros : undefined };
  }
  async function eventos({ dias = 1 } = {}) {
    const from = new Date(); from.setHours(0, 0, 0, 0); const to = new Date(from); to.setDate(to.getDate() + Math.max(1, Math.min(14, +dias || 1)));
    const out = [], erros = [];
    if (tok.google) { try { out.push(...await gCalList(from, to)); } catch (e) { erros.push("Google: " + e.message); } }
    if (tok.ms) { try { out.push(...await msCalList(from, to)); } catch (e) { erros.push("Outlook: " + e.message); } }
    if (!any()) return { erro: "Nenhuma agenda conectada. Conecte em Ajustes → Contas." };
    out.sort((a, b) => new Date(a.inicio) - new Date(b.inicio)); // Google vem em UTC, Outlook em horário local
    return { eventos: out, erros: erros.length ? erros : undefined };
  }
  async function criarEvento({ titulo, inicio, fim, duracao_min, local: lugar, conta }) {
    if (!titulo || !inicio || isNaN(new Date(inicio))) throw new ContaError("Preciso do título e da data e hora de início.", "args");
    const ev = { titulo: String(titulo).slice(0, 200), inicio: local(inicio), fim: fim && !isNaN(new Date(fim)) ? local(fim) : plus(inicio, +duracao_min || 60), local: lugar ? String(lugar).slice(0, 200) : "" };
    const usar = conta === "outlook" ? "outlook" : conta === "google" ? "google" : tok.google ? "google" : tok.ms ? "outlook" : null;
    if (!usar) throw new ContaError("Nenhuma agenda conectada.", "off");
    const r = usar === "google" ? await gCalCreate(ev) : await msCalCreate(ev);
    notify("Evento criado na agenda " + (usar === "google" ? "Google" : "Outlook") + ": " + ev.titulo, r.undo);
    return { ok: true, agenda: usar, inicio: ev.inicio, fim: ev.fim, link: r.link };
  }
  async function connect(which) {
    if (which === "google") { await googleAuth("consent"); }
    else { await msAuth(); }
    return connected();
  }
  function disconnect(which) {
    if (which === "google") { const t = tok.google; delete tok.google; saveTok(); try { if (t && window.google) google.accounts.oauth2.revoke(t.access, () => {}); } catch (e) {} }
    else { delete tok.ms; saveTok(); }
  }
  // Renova o Google sem perguntar, aproveitando um toque do usuário (o navegador só abre a janela com um toque)
  function refreshOnGesture() {
    if (tok.google && !valid(tok.google) && (cfg().googleClientId || "") && !gPending) googleAuth("").catch(() => {});
  }
  function status() {
    const g = !tok.google ? "desconectado" : valid(tok.google) ? "conectado" : "expirado (toque para renovar)";
    const m = !tok.ms ? "desconectado" : (valid(tok.ms) || tok.ms.refresh) ? "conectado" : "expirado";
    return { google: g, outlook: m };
  }
  return { init(c, n) { cfg = c; notify = n; }, emails, eventos, criarEvento, connect, disconnect, connected, any, status, refreshOnGesture };
})();
