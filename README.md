# BBC Learning English for Songloft

把 [BBC Learning English](https://www.bbc.co.uk/learningenglish/english/podcasts) 的 9 个播客做成播放列表，并提供 [Songloft](https://songloft.hanxi.cc) 插件自动同步成歌单。全部跑在 GitHub 上：GitHub Actions 每小时抓取 BBC RSS，生成的播放列表放在本仓库 [`playlists` 分支](https://github.com/jerryrat/BBC-LEARNING/tree/playlists)。

## 播放列表

| 节目 | GitHub | jsDelivr（国内较快） |
|---|---|---|
| 6 Minute English | [m3u8](https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists/6-minute-english.m3u8) | [m3u](https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists/6-minute-english.m3u) |
| Learning Easy English | [m3u8](https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists/easy-english.m3u8) | [m3u](https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists/easy-english.m3u) |
| Learning English from the News | [m3u8](https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists/news.m3u8) | [m3u](https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists/news.m3u) |
| Learning English Conversations | [m3u8](https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists/conversations.m3u8) | [m3u](https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists/conversations.m3u) |
| Learning English Vocabulary | [m3u8](https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists/vocabulary.m3u8) | [m3u](https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists/vocabulary.m3u) |
| Learning English Grammar | [m3u8](https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists/grammar.m3u8) | [m3u](https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists/grammar.m3u) |
| Learning English Stories | [m3u8](https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists/stories.m3u8) | [m3u](https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists/stories.m3u) |
| Learning English For Work | [m3u8](https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists/work.m3u8) | [m3u](https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists/work.m3u) |
| BBC英语教学 | [m3u8](https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists/chinese.m3u8) | [m3u](https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists/chinese.m3u) |
| 全部合集 | [all.m3u8](https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/playlists/all.m3u8) | [all.m3u](https://cdn.jsdelivr.net/gh/jerryrat/BBC-LEARNING@playlists/all.m3u) |

把链接粘进 VLC / PotPlayer 等播放器即可，最新一期在最前。jsDelivr 上请用 `.m3u` 后缀（它把 `.m3u8` 当成 HLS 直播流，VLC 会打不开）。jsDelivr 有缓存，偶尔会比 GitHub 晚一些。

## 安装 Songloft 插件

Songloft 客户端：设置 → JS 插件管理 → 插件商店 → 管理订阅源，添加插件源

    https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/main/registry.json

然后在商店里安装「BBC Learning English」。本仓库带 `songloft-plugin` topic，也能在插件商店的「GitHub 发现」里找到。

手动安装：下载 **[bbc-learning-english.jsplugin.zip（最新版）](https://github.com/jerryrat/BBC-LEARNING/releases/latest/download/bbc-learning-english.jsplugin.zip)**，在 Songloft 设置 → JS 插件管理 里上传该 zip（不要解压）。

安装后几秒内开始第一次同步（9 个歌单 `BBC · <节目名>`，约 2900 集）。

### 插件行为

- 默认每 60 分钟同步一次（10–1440 分钟可调），插件把自己加入宿主「插件常驻」，空闲时定时器不会被回收。
- 从 GitHub `playlists` 分支读取播放列表，GitHub 访问失败时自动改用 jsDelivr。
- 每次同步先读完整个列表，再一次性原子替换歌单成员（`replaceSongs`），失败时歌单保持原样。
- 歌曲按 BBC 节目 ID（vpid）去重；歌单靠描述 `bbc-learning-english:<slug>` 识别，改名不丢关联。
- 插件页面可选择节目、改源地址、同步间隔、每单最多集数、歌单名前缀，并可「立即同步」。
- 需要 Songloft 服务端 2.13.10 以上。

BBC 的音频由其分发服务插入约 1–2 分钟广告，无法去除。内容版权归 BBC 所有，仅供个人学习使用。

## 仓库结构

- `scripts/build-playlists.mjs` — 抓取 BBC RSS 生成播放列表（无依赖，Node 18+）
- `.github/workflows/playlists.yml` — 每小时运行上面的脚本，有新一期才提交到 `playlists` 分支；可在 Actions 页手动运行
- `src/`、`static/`、`plugin.json` — Songloft 插件（`@songloft/plugin-builder` 构建）
- `registry.json` — 插件源
- `worker/` — 旧的 bbc.wegoto.top Cloudflare Worker（已不再需要，保留给早期安装的插件过渡）

## 发布插件新版本

1. 改代码，`plugin.json` 和 `package.json` 的 version 加一（北京时间 `YYYY.M.D.N`）。
2. `npm install`（首次），`node publish.mjs` — 类型检查、构建、回写根目录 `plugin.json` 的哈希和下载地址。
3. 提交并推送到 `main`。
4. `node publish.mjs --release` — 创建 Release `v<version>` 并上传 zip。
