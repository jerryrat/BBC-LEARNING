# BBC Learning English for Songloft

把 [BBC Learning English](https://www.bbc.co.uk/learningenglish/english/podcasts) 的 9 个播客同步成 [Songloft](https://songloft.hanxi.cc) 歌单，定时重新拉取播放列表，新一期自动出现在歌单最前面。

| 节目 | m3u8 |
|---|---|
| 6 Minute English | https://bbc.wegoto.top/6-minute-english.m3u8 |
| Learning Easy English | https://bbc.wegoto.top/easy-english.m3u8 |
| Learning English from the News | https://bbc.wegoto.top/news.m3u8 |
| Learning English Conversations | https://bbc.wegoto.top/conversations.m3u8 |
| Learning English Vocabulary | https://bbc.wegoto.top/vocabulary.m3u8 |
| Learning English Grammar | https://bbc.wegoto.top/grammar.m3u8 |
| Learning English Stories | https://bbc.wegoto.top/stories.m3u8 |
| Learning English For Work | https://bbc.wegoto.top/work.m3u8 |
| BBC英语教学 | https://bbc.wegoto.top/chinese.m3u8 |

m3u8 也可以直接放进 VLC / PotPlayer 等播放器使用。

## 安装插件

Songloft 客户端：设置 → JS 插件管理 → 插件商店 → 管理订阅源，添加插件源

    https://raw.githubusercontent.com/jerryrat/BBC-LEARNING/main/registry.json

然后在商店里安装「BBC Learning English」。本仓库带 `songloft-plugin` topic，也能在插件商店的「GitHub 发现」里直接找到。

手动安装：下载 **[bbc-learning-english.jsplugin.zip（最新版）](https://github.com/jerryrat/BBC-LEARNING/releases/latest/download/bbc-learning-english.jsplugin.zip)**，在 Songloft 设置 → JS 插件管理 里上传该 zip（不要解压）。

安装后几秒内开始第一次同步（9 个歌单 `BBC · <节目名>`，约 2900 集）。

## 行为

- 默认每 60 分钟同步一次（10–1440 分钟可调），插件把自己加入宿主「插件常驻」，空闲时定时器不会被回收。
- 每次同步先读完整个 m3u8，再一次性原子替换歌单成员（`replaceSongs`），失败时歌单保持原样。
- 歌曲按 BBC 节目 ID（vpid）去重；歌单靠描述 `bbc-learning-english:<slug>` 识别，改名不丢关联。
- 播放时插件把 BBC mediaselector 链接交给宿主，BBC 每次跳转到新签名的 CDN 地址。
- 插件页面可选择节目、改源地址、同步间隔、每单最多集数、歌单名前缀，并可「立即同步」。
- 需要 Songloft 服务端 2.13.10 以上。

BBC 的音频由其分发服务插入约 1–2 分钟广告，插件无法去除。内容版权归 BBC 所有，仅供个人学习使用。

## 仓库结构

- `src/`、`static/`、`plugin.json` — Songloft 插件（`@songloft/plugin-builder` 构建）
- `registry.json` — 插件源
- `worker/` — bbc.wegoto.top 的 Cloudflare Worker：把 BBC RSS 转成 m3u8，并镜像插件包

## 发布新版本

1. 改代码，`plugin.json` 和 `package.json` 的 version 加一（北京时间 `YYYY.M.D.N`）。
2. `npm install`（首次），`node publish.mjs` — 类型检查、构建、回写根目录 `plugin.json` 的哈希和下载地址。
3. 提交并推送到 `main`。
4. `node publish.mjs --release` — 创建 Release `v<version>` 并上传 zip。
5. `cd worker && npx wrangler deploy` — 更新 bbc.wegoto.top 镜像（m3u8 Worker 也在这里）。
