/// <reference types="@songloft/plugin-sdk" />
import { createMusicUrlHandler, createRouter, jsonResponse } from "@songloft/plugin-sdk";
import type { HTTPRequest, HTTPResponse } from "@songloft/plugin-sdk";

// BBC Learning English -> Songloft playlists.
// Source: m3u8 lists built hourly from the BBC RSS feeds by this repo's GitHub Action.

const ENTRY = "bbc-learning-english";
// Built hourly by GitHub Actions (scripts/build-playlists.mjs) on the `playlists` branch.
const DEFAULT_SOURCE = "https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists";
// Earlier versions defaulted to these; saved settings still holding one are moved to DEFAULT_SOURCE.
const OLD_SOURCES = ["https://bbc.wegoto.top"];
// Used when the primary source fails (e.g. raw.githubusercontent.com blocked).
const FALLBACK_SOURCE = "https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists";
const ARTIST = "BBC Learning English";

const FEEDS = [
  { slug: "6-minute-english", name: "6 Minute English" },
  { slug: "easy-english", name: "Learning Easy English" },
  { slug: "news", name: "Learning English from the News" },
  { slug: "conversations", name: "Learning English Conversations" },
  { slug: "vocabulary", name: "Learning English Vocabulary" },
  { slug: "grammar", name: "Learning English Grammar" },
  { slug: "stories", name: "Learning English Stories" },
  { slug: "work", name: "Learning English For Work" },
  { slug: "chinese", name: "BBC英语教学" },
];

interface Settings {
  source: string;
  feeds: string[]; // enabled slugs
  intervalMinutes: number;
  maxEpisodes: number; // 0 = all
  prefix: string; // playlist name prefix
}
interface FeedStatus {
  playlistId?: number;
  count?: number;
  added?: number;
  removed?: number;
  newest?: string;
  lastSuccess?: string;
  error?: string;
}
interface State {
  settings: Settings;
  playlists: Record<string, number>; // slug -> playlist id
  statuses: Record<string, FeedStatus>;
  lastRun?: string;
  nextRun: number;
}
interface Episode {
  title: string;
  url: string;
  duration: number;
  cover: string;
  key: string;
}

const DEFAULTS: Settings = {
  source: DEFAULT_SOURCE,
  feeds: FEEDS.map((f) => f.slug),
  intervalMinutes: 60,
  maxEpisodes: 0,
  prefix: "BBC · ",
};

class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let state: State | undefined;
let busy = false;
let stopped = true;
let timer: ReturnType<typeof setTimeout> | undefined;

async function current(): Promise<State> {
  if (state) return state;
  const saved = ((await songloft.storage.get("state")) || {}) as Partial<State>;
  state = {
    settings: migrate({ ...DEFAULTS, ...(saved.settings || {}) }),
    playlists: saved.playlists || {},
    statuses: saved.statuses || {},
    lastRun: saved.lastRun,
    nextRun: saved.nextRun || 0,
  };
  return state;
}
function migrate(s: Settings): Settings {
  if (OLD_SOURCES.indexOf(s.source.replace(/\/+$/, "")) >= 0) s.source = DEFAULT_SOURCE;
  return s;
}

async function save(): Promise<void> {
  if (state) await songloft.storage.set("state", state);
}

// ---------- m3u8 ----------

// The title starts after the first comma that is not inside quotes.
function findTitleComma(s: string): number {
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') quoted = !quoted;
    else if (s[i] === "," && !quoted) return i;
  }
  return -1;
}

export function parseM3U(text: string, fallbackCover: string): Episode[] {
  const out: Episode[] = [];
  let info: { title: string; duration: number; cover: string } | null = null;
  let listCover = fallbackCover;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTIMG:")) {
      listCover = line.slice(8).trim() || listCover;
    } else if (line.startsWith("#EXTINF:")) {
      const rest = line.slice(8);
      const comma = findTitleComma(rest);
      const head = comma >= 0 ? rest.slice(0, comma) : rest;
      const title = comma >= 0 ? rest.slice(comma + 1).trim() : "";
      const duration = parseInt(head, 10);
      const logo = /tvg-logo="([^"]*)"/.exec(head);
      info = { title, duration: duration > 0 ? duration : 0, cover: logo ? logo[1] : listCover };
    } else if (!line.startsWith("#") && /^https?:\/\//i.test(line)) {
      const vpid = /\/vpid\/([a-z0-9]+)/i.exec(line);
      out.push({
        title: (info && info.title) || line.split("/").pop() || line,
        url: line,
        duration: info ? info.duration : 0,
        cover: info ? info.cover : listCover,
        key: vpid ? vpid[1] : line,
      });
      info = null;
    }
  }
  return out;
}

async function fetchFeed(source: string, slug: string): Promise<{ episodes: Episode[]; cover: string }> {
  const base = source.replace(/\/+$/, "");
  try {
    return await fetchFrom(base, slug);
  } catch (e) {
    if (base !== DEFAULT_SOURCE) throw e;
    songloft.log.warn(slug + ": GitHub raw failed (" + ((e as any)?.message || e) + "), trying jsDelivr");
    return await fetchFrom(FALLBACK_SOURCE, slug);
  }
}

async function fetchFrom(base: string, slug: string): Promise<{ episodes: Episode[]; cover: string }> {
  const url = base + "/" + slug + ".m3u8";
  const res = await fetch(url, {
    headers: { "User-Agent": "Songloft-BBC-Plugin/1.0", "X-Fetch-Timeout-Ms": "30000" },
  });
  if (!res.ok) throw new Error("播放列表返回 HTTP " + res.status);
  const text = await res.text();
  if (!text.startsWith("#EXTM3U")) throw new Error("返回内容不是 m3u8");
  const img = /^#EXTIMG:(.*)$/m.exec(text);
  const cover = img ? img[1].trim() : "";
  const episodes = parseM3U(text, cover);
  if (!episodes.length) throw new Error("播放列表为空");
  return { episodes, cover };
}

// ---------- sync ----------

function hasReplace(): boolean {
  return typeof (songloft.playlists as any).replaceSongs === "function";
}

async function ensurePlaylist(s: State, slug: string, name: string, cover: string): Promise<number> {
  const marker = ENTRY + ":" + slug;
  const all = await songloft.playlists.list();
  let pl = all.find((p) => p.id === s.playlists[slug] && p.type === "normal");
  if (!pl) pl = all.find((p) => p.description === marker && p.type === "normal");
  const wanted = s.settings.prefix + name;
  if (!pl) {
    let n = wanted;
    for (let i = 2; all.some((p) => p.name === n); i++) n = wanted + " (" + i + ")";
    pl = await songloft.playlists.create({
      name: n,
      type: "normal",
      description: marker,
      coverUrl: cover || undefined,
    });
  } else if (pl.name !== wanted && !all.some((p) => p.id !== pl!.id && p.name === wanted)) {
    try {
      await songloft.playlists.update(pl.id, { name: wanted });
    } catch {
      /* keep the old name */
    }
  }
  s.playlists[slug] = pl.id;
  return pl.id;
}

async function syncFeed(s: State, feed: { slug: string; name: string }): Promise<FeedStatus> {
  // Read the whole list first; the playlist is only touched when everything worked.
  const { episodes, cover } = await fetchFeed(s.settings.source, feed.slug);
  const list = s.settings.maxEpisodes > 0 ? episodes.slice(0, s.settings.maxEpisodes) : episodes;
  const ids: number[] = [];
  for (let i = 0; i < list.length; i += 100) {
    const batch = list.slice(i, i + 100);
    const records: any[] = await (songloft.songs.create as any)(
      batch.map((e) => ({
        url: e.url,
        title: e.title,
        artist: ARTIST,
        album: feed.name,
        coverUrl: e.cover || cover,
        duration: e.duration,
        dedupKey: ENTRY + ":" + e.key,
        sourceData: JSON.stringify({ feed: feed.slug, vpid: e.key, url: e.url }),
      })),
      { probeMetadata: false },
    );
    if (!Array.isArray(records) || records.length !== batch.length || records.some((r) => !r || !(r.id > 0)))
      throw new Error("歌曲写入结果不完整，歌单未改动");
    for (let j = 0; j < records.length; j++) {
      const r = records[j], e = batch[j];
      // Host returns its own /play URL in `url`; the stored remote address is source_url.
      const stored = r.source_url !== undefined ? r.source_url : r.url;
      if (stored !== e.url || r.title !== e.title)
        await songloft.songs.update(r.id, { url: e.url, title: e.title });
    }
    ids.push(...records.map((r) => r.id as number));
  }
  const unique = Array.from(new Set(ids));
  const playlistId = await ensurePlaylist(s, feed.slug, feed.name, cover);
  const before = await songloft.playlists.getSongs(playlistId);
  const beforeIds = new Set(before.map((x) => x.id));
  const afterIds = new Set(unique);
  const same = before.length === unique.length && before.every((x, i) => x.id === unique[i]);
  if (!same) await (songloft.playlists as any).replaceSongs(playlistId, unique);
  return {
    playlistId,
    count: unique.length,
    added: unique.filter((id) => !beforeIds.has(id)).length,
    removed: before.filter((x) => !afterIds.has(x.id)).length,
    newest: list[0] ? list[0].title : undefined,
    lastSuccess: new Date().toISOString(),
  };
}

async function syncAll(only?: string[]): Promise<Record<string, FeedStatus>> {
  if (busy) throw new UserError("正在同步，请稍候", 409);
  if (!hasReplace()) throw new UserError("Songloft 版本过旧（缺少 replaceSongs），请升级服务端", 409);
  busy = true;
  const s = await current();
  try {
    const slugs = only && only.length ? only : s.settings.feeds;
    for (const feed of FEEDS.filter((f) => slugs.indexOf(f.slug) >= 0)) {
      try {
        s.statuses[feed.slug] = await syncFeed(s, feed);
      } catch (e: any) {
        const prev = s.statuses[feed.slug] || {};
        s.statuses[feed.slug] = { ...prev, error: String((e && e.message) || e).slice(0, 240) };
        songloft.log.warn("sync " + feed.slug + " failed: " + s.statuses[feed.slug].error);
      }
      await save();
    }
    if (!only || !only.length) {
      s.lastRun = new Date().toISOString();
      s.nextRun = Date.now() + s.settings.intervalMinutes * 60000;
    }
    await save();
    return s.statuses;
  } finally {
    busy = false;
  }
}

// ---------- keep alive (so the timer survives idle eviction) ----------

async function keepAlive(): Promise<boolean> {
  try {
    const base = await songloft.plugin.getHostUrl();
    const token = await songloft.plugin.getToken();
    const h = {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "X-Fetch-Timeout-Ms": "10000",
    };
    const r = await fetch(base + "/api/v1/settings/plugin-keep-alive", { headers: h });
    if (!r.ok) return false;
    const cfg: any = await r.json();
    const list: string[] = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : [];
    if (list.indexOf(ENTRY) >= 0) return true;
    const w = await fetch(base + "/api/v1/settings/plugin-keep-alive", {
      method: "PUT",
      headers: h,
      body: JSON.stringify({ plugins: list.concat([ENTRY]) }),
    });
    return w.ok;
  } catch {
    return false;
  }
}

// ---------- HTTP API ----------

const router = createRouter();

function body(req: HTTPRequest): any {
  try {
    return JSON.parse(String(req.body || "{}")) || {};
  } catch {
    throw new UserError("请求 JSON 无效");
  }
}

router.get("/api/state", async () => {
  const s = await current();
  return jsonResponse({ feeds: FEEDS, ...s, busy, replaceSupported: hasReplace() });
});

router.post("/api/settings", async (req) => {
  const s = await current();
  const b = body(req);
  const next: Settings = { ...s.settings };
  if (typeof b.source === "string") {
    if (!/^https?:\/\/\S+$/i.test(b.source.trim())) throw new UserError("源地址必须是 http(s) URL");
    next.source = b.source.trim().replace(/\/+$/, "");
  }
  if (Array.isArray(b.feeds)) next.feeds = FEEDS.map((f) => f.slug).filter((x) => b.feeds.indexOf(x) >= 0);
  if (b.intervalMinutes !== undefined) {
    const n = Number(b.intervalMinutes);
    if (!(n >= 10 && n <= 1440)) throw new UserError("同步间隔须在 10–1440 分钟");
    next.intervalMinutes = Math.round(n);
  }
  if (b.maxEpisodes !== undefined) {
    const n = Number(b.maxEpisodes);
    if (!(n >= 0 && n <= 5000)) throw new UserError("每个歌单最多集数须在 0–5000（0 = 全部）");
    next.maxEpisodes = Math.round(n);
  }
  if (typeof b.prefix === "string") next.prefix = b.prefix.slice(0, 30);
  s.settings = next;
  s.nextRun = Math.min(s.nextRun || 0, Date.now() + next.intervalMinutes * 60000);
  await save();
  return jsonResponse({ settings: next });
});

router.post("/api/sync", async (req) => {
  const b = body(req);
  const only: string[] | undefined = Array.isArray(b.feeds) ? b.feeds.map(String) : undefined;
  if (busy) throw new UserError("正在同步，请稍候", 409);
  if (b.wait) return jsonResponse({ statuses: await syncAll(only) });
  void syncAll(only).catch((e) => songloft.log.error("sync failed: " + ((e && e.message) || e)));
  return jsonResponse({ started: true }, 202);
});

// Songs created by a plugin are resolved through the plugin at play time.
// The stored BBC mediaselector link redirects to a freshly signed CDN URL on every request,
// so returning it as-is is enough.
router.post(
  "/api/music/url",
  createMusicUrlHandler({
    resolveUrl: async (data) => {
      const url = typeof data.url === "string" ? data.url : "";
      if (/^https?:\/\//i.test(url)) return url;
      throw new Error("source_not_available");
    },
  }),
);

// ---------- scheduler ----------

function schedule(ms: number): void {
  if (!stopped) timer = setTimeout(() => void tick(), ms);
}
async function tick(): Promise<void> {
  try {
    const s = await current();
    if (!busy && Date.now() >= (s.nextRun || 0)) await syncAll();
  } catch (e: any) {
    songloft.log.error("auto sync: " + ((e && e.message) || e));
  } finally {
    schedule(60000);
  }
}

globalThis.onInit = async () => {
  await current();
  stopped = false;
  const kept = await keepAlive();
  songloft.log.info("BBC Learning English started, keep-alive " + (kept ? "on" : "unavailable"));
  schedule(5000);
};
globalThis.onDeinit = async () => {
  stopped = true;
  if (timer !== undefined) clearTimeout(timer);
};
globalThis.onHTTPRequest = async (req: HTTPRequest): Promise<HTTPResponse> => {
  try {
    return await router.handle(req);
  } catch (e: any) {
    const status = e instanceof UserError ? e.status : 500;
    return jsonResponse({ error: String((e && e.message) || e) }, status);
  }
};
