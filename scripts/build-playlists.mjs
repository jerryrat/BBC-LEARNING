// Fetch the 9 BBC Learning English RSS feeds and write m3u8 playlists.
//   node scripts/build-playlists.mjs [outDir]      (default: ./playlists)
// Run hourly by .github/workflows/playlists.yml, which commits the result to the `playlists` branch.
// No dependencies, Node 18+.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const FEEDS = [
  { slug: "6-minute-english", id: "p02pc9tn", name: "6 Minute English" },
  { slug: "easy-english", id: "p0hsrwv5", name: "Learning Easy English" },
  { slug: "news", id: "p05hw4bq", name: "Learning English from the News" },
  { slug: "conversations", id: "p02pc9zn", name: "Learning English Conversations" },
  { slug: "vocabulary", id: "p02pc9xz", name: "Learning English Vocabulary" },
  { slug: "grammar", id: "p02pc9wq", name: "Learning English Grammar" },
  { slug: "stories", id: "p02pc9s1", name: "Learning English Stories" },
  { slug: "work", id: "p0h6ffwg", name: "Learning English For Work" },
  { slug: "chinese", id: "p02pc9st", name: "BBC英语教学" },
];

const REPO = "jerryrat/BBC-LEARNING";
const RAW = `https://raw.githubusercontent.com/${REPO}/playlists`;
const CDN = `https://cdn.jsdelivr.net/gh/${REPO}@playlists`;

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1]).trim() : "";
}
function attr(xml, name, a) {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]*)"`));
  return m ? decodeEntities(m[1]) : "";
}
function clean(s) {
  return s.replace(/<[^>]+>/g, "").replace(/[\r\n]+/g, " ").replace(/,/g, "，").trim();
}

export function parseFeed(xml) {
  const channel = xml.split("<item>")[0];
  const image = attr(channel, "itunes:image", "href").replace(/^http:/, "https:");
  const items = [];
  for (const part of xml.split("<item>").slice(1)) {
    const it = part.split("</item>")[0];
    let url = attr(it, "ppg:enclosureSecure", "url") || attr(it, "enclosure", "url");
    if (!url) continue;
    url = url.replace(/^http:/, "https:").replace("/proto/http/", "/proto/https/");
    items.push({
      title: clean(tag(it, "title")),
      duration: parseInt(tag(it, "itunes:duration"), 10) || -1,
      date: tag(it, "pubDate"),
      image: (attr(it, "itunes:image", "href") || image).replace(/^http:/, "https:"),
      url,
    });
  }
  return { image, items };
}

export function toM3U8(feed, parsed) {
  const out = ["#EXTM3U", `#PLAYLIST:${feed.name}`, `#EXTIMG:${parsed.image}`];
  for (const i of parsed.items) {
    const d = i.date ? new Date(i.date) : null;
    const day = d && !isNaN(d) ? d.toISOString().slice(0, 10) + " " : "";
    out.push(`#EXTINF:${i.duration} tvg-logo="${i.image}" group-title="${feed.name}",${day}${i.title}`, i.url);
  }
  return out.join("\n") + "\n";
}

async function fetchRSS(feed) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://podcasts.files.bbci.co.uk/${feed.id}.rss`, {
        headers: { "User-Agent": "Mozilla/5.0 (BBC-LEARNING playlist builder; github.com/" + REPO + ")" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      if (!xml.includes("<rss")) throw new Error("not an RSS document");
      return xml;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw new Error(`${feed.slug} (${feed.id}): ${last && last.message}`);
}

function indexHtml(rows) {
  const tr = rows
    .map(
      (r) =>
        `<tr><td>${r.name}</td><td><a href="${r.slug}.m3u8">${r.slug}.m3u8</a></td><td>${r.count}</td>` +
        `<td>${r.newest}</td><td><a href="https://podcasts.files.bbci.co.uk/${r.id}.rss">RSS</a></td></tr>`,
    )
    .join("\n");
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BBC Learning English 播放列表</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 16px;color:#222}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}
a{color:#b80000}code{background:#f3f3f3;padding:2px 4px;word-break:break-all}</style></head><body>
<h1>BBC Learning English 播放列表</h1>
<p>来源 <a href="https://www.bbc.co.uk/learningenglish/english/podcasts">BBC Learning English Podcasts</a>，GitHub Actions 每小时自动更新，最新一期在最前。</p>
<p>播放器地址：<code>${RAW}/&lt;节目&gt;.m3u8</code>（国内可用 <code>${CDN}/&lt;节目&gt;.m3u8</code>）</p>
<table><tr><th>节目</th><th>M3U8</th><th>集数</th><th>最新</th><th>原始</th></tr>
${tr}
</table>
<p>全部合集：<a href="all.m3u8">all.m3u8</a> · <a href="index.json">index.json</a> · <a href="https://github.com/${REPO}">GitHub</a></p>
</body></html>
`;
}

async function main() {
  const out = process.argv[2] || "playlists";
  mkdirSync(out, { recursive: true });
  const rows = [];
  const parts = [];
  const failed = [];
  for (const feed of FEEDS) {
    let text;
    try {
      const parsed = parseFeed(await fetchRSS(feed));
      if (!parsed.items.length) throw new Error("feed has no episodes");
      text = toM3U8(feed, parsed);
    } catch (e) {
      // Keep the previous file when BBC is briefly unavailable; fail only if there is nothing to keep.
      const file = join(out, feed.slug + ".m3u8");
      if (!existsSync(file)) throw e;
      console.warn("WARN keeping old " + feed.slug + ": " + e.message);
      failed.push(feed.slug);
      text = readFileSync(file, "utf8");
    }
    writeFileSync(join(out, feed.slug + ".m3u8"), text);
    const count = text.split("\n").filter((l) => l.startsWith("https://")).length;
    const first = text.split("\n").find((l) => l.startsWith("#EXTINF:")) || "";
    rows.push({ ...feed, count, newest: first.slice(first.indexOf(",") + 1) });
    parts.push(text.split("\n").filter((l) => l && !/^#(EXTM3U|PLAYLIST|EXTIMG)/.test(l)).join("\n") + "\n");
    console.log(`${feed.slug}: ${count}`);
  }
  writeFileSync(join(out, "all.m3u8"), "#EXTM3U\n#PLAYLIST:BBC Learning English (all)\n" + parts.join(""));
  writeFileSync(
    join(out, "index.json"),
    JSON.stringify(
      rows.map((r) => ({
        slug: r.slug,
        id: r.id,
        name: r.name,
        count: r.count,
        newest: r.newest,
        m3u8: `${RAW}/${r.slug}.m3u8`,
        cdn: `${CDN}/${r.slug}.m3u8`,
        rss: `https://podcasts.files.bbci.co.uk/${r.id}.rss`,
      })),
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(out, "index.html"), indexHtml(rows));
  if (failed.length === FEEDS.length) throw new Error("all feeds failed");
  console.log("total " + rows.reduce((a, r) => a + r.count, 0) + (failed.length ? " (kept old: " + failed.join(",") + ")" : ""));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
