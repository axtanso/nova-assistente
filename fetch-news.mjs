// Lê feeds RSS de fontes jornalísticas reais e gera news.json para a Vega.
// Roda no GitHub Actions (Node 20+), sem dependências.
import { writeFile, readFile } from "node:fs/promises";

const FEEDS = JSON.parse(await readFile(new URL("./feeds.json", import.meta.url), "utf8"));
const MAX_PER_FEED = 6;
const MAX_TOTAL = 30;

const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i")); return m ? decode(m[1]) : ""; };
const atomLink = xml => { const m = xml.match(/<link[^>]*href="([^"]+)"/i); return m ? m[1] : ""; };

export function parse(xml, fonte, categoria) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, MAX_PER_FEED).map(b => {
    const link = tag(b, "link") || atomLink(b);
    const raw = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const d = raw ? new Date(raw) : null;
    return { titulo: tag(b, "title"), link, fonte, categoria, data: d && !isNaN(d) ? d.toISOString() : null };
  }).filter(n => n.titulo && /^https?:\/\//.test(n.link));
}

async function main() {
  const all = [];
  for (const f of FEEDS) {
    try {
      const r = await fetch(f.url, { headers: { "User-Agent": "Mozilla/5.0 (Vega assistente; RSS)" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const items = parse(await r.text(), f.fonte, f.categoria);
      console.log(`${f.fonte}: ${items.length} itens`);
      all.push(...items);
    } catch (e) { console.warn(`${f.fonte}: falhou (${e.message})`); }
  }
  const seen = new Set();
  const itens = all
    .filter(n => { const k = n.titulo.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
    .slice(0, MAX_TOTAL);
  if (!itens.length) { console.warn("Nenhuma notícia obtida; news.json mantido."); return; }
  await writeFile(new URL("../news.json", import.meta.url), JSON.stringify({ atualizado: new Date().toISOString(), itens }, null, 1) + "\n");
  console.log(`news.json: ${itens.length} notícias`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
