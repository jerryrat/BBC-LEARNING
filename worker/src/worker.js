// BBC Learning English podcasts -> M3U8 playlists
// Source page: https://www.bbc.co.uk/learningenglish/english/podcasts

const FEEDS = [
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

const CACHE_SECONDS = 3600;

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

function parseFeed(xml) {
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

function toM3U8(feed, parsed) {
  const out = ["#EXTM3U", `#PLAYLIST:${feed.name}`, `#EXTIMG:${parsed.image}`];
  for (const i of parsed.items) {
    const d = i.date ? new Date(i.date) : null;
    const day = d && !isNaN(d) ? d.toISOString().slice(0, 10) + " " : "";
    out.push(
      `#EXTINF:${i.duration} tvg-logo="${i.image}" group-title="${feed.name}",${day}${i.title}`,
      i.url
    );
  }
  return out.join("\n") + "\n";
}

async function fetchFeed(feed) {
  const res = await fetch(`https://podcasts.files.bbci.co.uk/${feed.id}.rss`, {
    cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    headers: { "User-Agent": "Mozilla/5.0 bbc.wegoto.top" },
  });
  if (!res.ok) throw new Error(`RSS ${feed.id}: HTTP ${res.status}`);
  return parseFeed(await res.text());
}

function indexPage(origin) {
  const rows = FEEDS.map(
    (f) => `<tr><td>${f.name}</td><td><a href="/${f.slug}.m3u8">${origin}/${f.slug}.m3u8</a></td>` +
      `<td><a href="https://podcasts.files.bbci.co.uk/${f.id}.rss">RSS</a></td></tr>`
  ).join("");
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BBC Learning English 播放列表</title>
<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 16px;color:#222}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}
a{color:#b80000}code{background:#f3f3f3;padding:2px 4px}</style></head><body>
<h1>BBC Learning English 播放列表</h1>
<p>来源 <a href="https://www.bbc.co.uk/learningenglish/english/podcasts">BBC Learning English Podcasts</a>，每小时自动同步，最新一期在最前。把 m3u8 链接粘到 VLC / PotPlayer / IINA 等播放器即可。</p>
<table><tr><th>节目</th><th>M3U8</th><th>原始</th></tr>${rows}</table>
<p>全部合集：<a href="/all.m3u8">${origin}/all.m3u8</a> · JSON：<a href="/index.json">/index.json</a></p>
</body></html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const cache = caches.default;

    if (path === "/") {
      return new Response(indexPage(url.origin), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }
    if (path === "/index.json") {
      return Response.json(FEEDS.map((f) => ({ ...f, m3u8: `${url.origin}/${f.slug}.m3u8`,
        rss: `https://podcasts.files.bbci.co.uk/${f.id}.rss` })));
    }

    const m = path.match(/^\/([a-z0-9-]+)\.(m3u8|m3u)$/);
    if (!m) return new Response("Not found", { status: 404 });
    const slug = m[1];
    const list = slug === "all" ? FEEDS : FEEDS.filter((f) => f.slug === slug || f.id === slug);
    if (!list.length) return new Response("Unknown playlist", { status: 404 });

    const cacheKey = new Request(`${url.origin}/${slug}.m3u8?v=2`);
    let res = await cache.match(cacheKey);
    if (res) return res;

    try {
      let body;
      if (slug === "all") {
        const parts = await Promise.all(list.map(async (f) => toM3U8(f, await fetchFeed(f))));
        body = "#EXTM3U\n#PLAYLIST:BBC Learning English (all)\n" +
          parts.map((p) => p.split("\n").filter((l) => !/^#(EXTM3U|PLAYLIST|EXTIMG)/.test(l)).join("\n")).join("");
      } else {
        body = toM3U8(list[0], await fetchFeed(list[0]));
      }
      res = new Response(body, {
        headers: {
          "content-type": "audio/x-mpegurl; charset=utf-8",
          "content-disposition": `inline; filename="${slug}.m3u8"`,
          "cache-control": `public, max-age=${CACHE_SECONDS}`,
          "access-control-allow-origin": "*",
        },
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    } catch (e) {
      return new Response(`Upstream error: ${e.message}`, { status: 502 });
    }
  },
};
