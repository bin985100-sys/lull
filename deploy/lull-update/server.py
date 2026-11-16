"""
Lull Relay — сервер-посредник плеера Lull.

Зачем: из России YouTube замедлен, а SoundCloud заблокирован. Плеер ходит в них через этот сервер
(Нидерланды), а сервер ещё и быстро получает ссылки на звук: yt-dlp здесь постоянно «прогрет»
(не запускается заново на каждый трек), а готовые ссылки кэшируются для всех пользователей.

Эндпоинты (все, кроме /health, требуют заголовок X-Lull-Key):
  GET  /health                     — жив ли сервер
  ANY  /f?u=<url>                  — переслать запрос к разрешённому сайту (с Range), ответ потоком
  GET  /resolve/<videoId>?q=<auto|aac|low>  — ссылка на звук YouTube (её затем качать через /f)
  GET  /sc/search?q=<текст>        — поиск на SoundCloud (название, автор, длительность, url)
  GET  /sc/file?url=<soundcloud>   — звук трека SoundCloud целиком (файл из кэша сервера)

Ссылки googlevideo привязаны к IP того, кто их получил, поэтому звук по ссылке из /resolve
тоже нужно качать через /f — плеер так и делает.
"""

import asyncio
import contextvars
import base64
import hashlib
import json
import logging
import os
import re
import shutil
import socket
import ssl
import threading
import time
from collections import OrderedDict, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, urlparse

from aiohttp import ClientSession, ClientTimeout, TCPConnector, web
import yt_dlp

KEY = os.environ.get("LULL_KEY", "")
PORT = int(os.environ.get("LULL_PORT", "8443"))
DATA = Path(os.environ.get("LULL_DATA", "/var/lib/lull-relay"))
CERT = DATA / "cert.pem"
PKEY = DATA / "key.pem"
SC_DIR = DATA / "sc"
SC_DIR.mkdir(parents=True, exist_ok=True)

# Куда разрешено пересылать — только то, что нужно плееру (иначе сервер станет открытым прокси)
ALLOWED = (
    "youtube.com", "youtubei.googleapis.com", "googlevideo.com", "ytimg.com", "ggpht.com",
    "googleusercontent.com", "google.com", "gstatic.com", "googleapis.com",
    "soundcloud.com", "sndcdn.com", "lrclib.net", "better-lyrics.boidu.dev",
)
# Заголовки запроса, которые передаём дальше (без служебных заголовков самого relay)
PASS_REQ = {"range", "content-type", "user-agent", "accept", "accept-language", "origin", "referer", "cookie",
            "authorization", "x-goog-api-key", "x-goog-visitor-id", "x-youtube-client-name",
            "x-youtube-client-version", "x-goog-authuser", "x-origin", "x-user-agent", "if-none-match"}
PASS_RES = {"content-type", "content-length", "content-range", "accept-ranges", "cache-control", "etag", "last-modified",
            "content-encoding", "expires"}

log = logging.getLogger("lull-relay")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ---------- защита от злоупотреблений: не больше N запросов в минуту с одного адреса ----------
hits: dict[str, list[float]] = defaultdict(list)
LIMIT_PER_MIN = int(os.environ.get("LULL_RPM", "1200"))


def allowed_host(url: str) -> bool:
    try:
        h = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return any(h == d or h.endswith("." + d) for d in ALLOWED)


API_RPM = int(os.environ.get("LULL_API_RPM", "600"))
# Откуда можно звать /api из браузера: сайт, веб-приложение, приложение на телефоне (Capacitor) и разработка
ORIGINS = {o.strip() for o in os.environ.get("LULL_ORIGINS", "https://lull.website,https://www.lull.website,https://app.lull.website,capacitor://localhost,http://localhost,https://localhost,http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()}


def client_ip(request: web.Request) -> str:
    # За Caddy/nginx настоящий адрес — в X-Forwarded-For
    if request.remote in ("127.0.0.1", "::1"):
        xf = request.headers.get("X-Forwarded-For", "")
        if xf:
            return xf.split(",")[0].strip()
    return request.remote or "?"


def cors(request: web.Request, resp: web.StreamResponse) -> web.StreamResponse:
    origin = request.headers.get("Origin", "")
    if origin in ORIGINS or origin.endswith(".vercel.app"):
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Expose-Headers"] = "Content-Range, Content-Length, Accept-Ranges"
    return resp


def limited(ip: str, limit: int) -> bool:
    now = time.monotonic()
    q = hits[ip]
    while q and now - q[0] > 60:
        q.pop(0)
    if len(q) >= limit:
        return True
    q.append(now)
    return False


@web.middleware
async def guard(request: web.Request, handler):
    if request.path == "/health":
        return await handler(request)
    if request.path.startswith("/api/"):
        if request.method == "OPTIONS":
            r = web.Response(status=204)
            r.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            r.headers["Access-Control-Allow-Headers"] = "Content-Type, Range"
            r.headers["Access-Control-Max-Age"] = "86400"
            return cors(request, r)
        # звук идёт кусками — каждый кусок не считаем отдельным запросом к лимиту
        if not request.path.startswith("/api/stream/") and limited("api:" + client_ip(request), API_RPM):
            return cors(request, web.json_response({"error": "too many requests"}, status=429))
        resp = await handler(request)
        return cors(request, resp)
    if not KEY or request.headers.get("X-Lull-Key") != KEY:
        return web.json_response({"error": "unauthorized"}, status=401)
    ip = request.remote or "?"
    now = time.monotonic()
    q = hits[ip]
    while q and now - q[0] > 60:
        q.pop(0)
    if len(q) >= LIMIT_PER_MIN:
        return web.json_response({"error": "too many requests"}, status=429)
    q.append(now)
    return await handler(request)


# ---------- пересылка ----------
session: ClientSession | None = None


async def forward(request: web.Request) -> web.StreamResponse:
    url = request.query.get("u", "")
    if not url.startswith("https://") or not allowed_host(url):
        return web.json_response({"error": "host not allowed"}, status=403)
    # Плеер кладёт заголовки исходного запроса в X-Lull-H (base64 JSON): часть заголовков
    # (Cookie, Origin, Referer, User-Agent) Chromium не даёт выставить на запрос к другому хосту
    src = request.headers.items()
    packed = request.headers.get("X-Lull-H")
    if packed:
        try:
            src = json.loads(base64.b64decode(packed)).items()
        except Exception:
            return web.json_response({"error": "bad X-Lull-H"}, status=400)
    headers = {k: v for k, v in src if k.lower() in PASS_REQ or k.lower().startswith(("x-goog-", "x-youtube-"))}
    body = await request.read() if request.can_read_body else None
    assert session is not None
    try:
        upstream = await session.request(request.method, url, headers=headers, data=body, allow_redirects=True)
    except Exception as e:  # сеть до сайта недоступна
        log.warning("forward %s %s: %s", request.method, url[:120], e)
        return web.json_response({"error": f"upstream: {e}"}, status=502)
    resp = web.StreamResponse(status=upstream.status)
    for k, v in upstream.headers.items():
        if k.lower() in PASS_RES:
            resp.headers[k] = v
    resp.headers["X-Final-Url"] = str(upstream.url)
    await resp.prepare(request)
    try:
        async for chunk in upstream.content.iter_chunked(64 * 1024):
            await resp.write(chunk)
    except (ConnectionResetError, asyncio.CancelledError):
        pass  # плеер перемотал или переключил трек
    finally:
        upstream.release()
    return resp


# ---------- yt-dlp: прогретый экземпляр и кэш ссылок ----------
WORKERS = max(1, int(os.environ.get("LULL_WORKERS", "2")))
pool = ThreadPoolExecutor(max_workers=WORKERS)
resolve_slots = asyncio.Semaphore(WORKERS)
cache: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()
inflight: dict[str, asyncio.Future] = {}

FORMATS = {
    # 18 — mp4 со звуком, YouTube отдаёт его почти всегда, даже когда отдельных аудиодорожек клиенту не дали
    "low": "wa[protocol=https]/wa/18/b",
    "aac": "ba[protocol=https][ext=m4a]/ba[protocol=https]/ba/18/b",
    "auto": "ba[protocol=https][ext=webm]/ba[protocol=https]/ba/18/b",
}
_local = threading.local()
COOKIES = Path(os.environ.get("LULL_YT_COOKIES", str(DATA / "yt-cookies.txt")))


def ydl_for(fmt: str, client: str = "", proxy: str | None = None) -> yt_dlp.YoutubeDL:
    # Свой экземпляр на поток, формат и клиент (yt-dlp не потокобезопасен): плеер YouTube и разгадка
    # подписи кэшируются внутри — следующие треки быстрее.
    # source_address 0.0.0.0 = только IPv4: ссылка googlevideo привязана к адресу, с которого её получили,
    # и звук мы качаем тоже по IPv4 — иначе YouTube отвечает 403.
    _ydl = getattr(_local, "ydl", None)
    if _ydl is None:
        _ydl = _local.ydl = {}
    proxy = YT_PROXY if proxy is None else proxy
    k = f"{proxy}:{fmt}:{client}"
    if k not in _ydl:
        yt_args = {"skip": ["hls", "dash", "translated_subs"]}
        if client:
            yt_args["player_client"] = [client]
        # «быстрые» клиенты: без загрузки страницы ролика и конфигов — один запрос к API YouTube вместо трёх-четырёх
        if client == "android_vr":
            yt_args["player_skip"] = ["webpage", "configs"]
        _ydl[k] = yt_dlp.YoutubeDL({
            "quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True,
            "format": FORMATS[fmt], "socket_timeout": 10, "cachedir": str(DATA / "yt-dlp-cache"),
            "source_address": "0.0.0.0", "extractor_args": {"youtube": yt_args},
            **({"proxy": proxy} if proxy else {}),
            "js_runtimes": {"node": {}},
            # Аккаунт YouTube для треков с ограничениями (18+, «войдите, чтобы подтвердить…»):
            # файл cookies в формате Netscape кладёт владелец сервера, в репозиторий он не попадает.
            **({"cookiefile": str(COOKIES)} if os.environ.get("LULL_YT_USE_COOKIES") == "1" and COOKIES.is_file() else {}),
        })
    while len(_ydl) > 3:
        _ydl.pop(next(iter(_ydl)))
    return _ydl[k]


def to_stream(j: dict) -> dict:
    f = (j.get("requested_formats") or [j])[0]
    ext = f.get("ext") or j.get("ext") or "webm"
    mime = "audio/webm" if ext == "webm" else "audio/mp4" if ext in ("m4a", "mp4") else f"audio/{ext}"
    return {
        "url": f["url"], "headers": {**(j.get("http_headers") or {}), **(f.get("http_headers") or {})},
        "mime": mime, "bitrate": round((f.get("abr") or f.get("tbr") or 128) * 1000),
        "contentLength": f.get("filesize") or 0, "durationSec": round(j.get("duration") or 0),
        "formatId": str(f.get("format_id") or ""),
        "availableAt": float(f.get("available_at") or j.get("available_at") or 0),
    }


def resolve_sync(vid: str, fmt: str, client: str = "", proxy: str | None = None) -> dict:
    t0 = time.monotonic()
    j = ydl_for(fmt, client, proxy).extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
    s = to_stream(j)
    if str(s.get("formatId")) == "18":
        s["muxed"] = True
    # Audio-only itag 140 can be forbidden while the SAME video's progressive
    # itag 18 remains playable. Reuse the already deciphered format list.
    muxed = next((f for f in j.get("formats", []) if str(f.get("format_id")) == "18" and f.get("url")), None)
    if muxed and str(s.get("formatId")) != "18":
        variant = {k: v for k, v in j.items() if k != "requested_formats"}
        variant.update(muxed)
        alternative = to_stream(variant)
        alternative["muxed"] = True
        s["alternateFormats"] = [alternative]
    s["retryAfter"] = time.monotonic() + 5
    log.info("resolve %s %s %.1fs", vid, client or "default", time.monotonic() - t0)
    return s


# Клиенты-приложения (VR-шлем, телевизор) отдают ссылку без разгадки JS-защиты плеера — это главная экономия.
FAST_CLIENTS = ("android_vr", "tv")
# Способы получить звук. Какой из них сейчас работает с этого сервера, YouTube решает сам и часто меняет
# (то «вы бот» для одних клиентов, то 403 для других), поэтому порядок не зашит, а подстраивается — см. Ladder.
FALLBACK_CLIENTS = ("innertube", "", "mweb", "web_embedded", "web_safari", "tv", "android_vr")
STEP = max(0.05, float(os.environ.get("LULL_RACE_STEP", "0.35")))
RACE_WIDTH = max(1, int(os.environ.get("LULL_RACE_WIDTH", "2")))
RESOLVE_TIMEOUT = max(1, float(os.environ.get("LULL_RESOLVE_TIMEOUT", "18")))
MAX_MUXED_BYTES = 32 * 1024 * 1024
BOT_COOLDOWN = 120


class Ladder:
    """Рейтинг способов: последний успешный — первым, «бот»/403 — вниз или на паузу."""

    def __init__(self, state_path=None):
        self.last_ok: dict[str, float] = {}
        self.avg: dict[str, float] = {}
        self.fails: dict[str, int] = {}
        self.blocked_until: dict[str, float] = {}
        self.state_path = state_path
        if state_path:
            try:
                data=json.loads(state_path.read_text())
                now=time.time()
                for c,item in data.items():
                    if c not in (*FALLBACK_CLIENTS,'regional','regional_ytdlp'):
                        continue
                    stamp=float(item['last_ok']);avg=float(item['avg'])
                    if 0<=now-stamp<600 and .01<=avg<=60:
                        self.last_ok[c]=stamp;self.avg[c]=avg
            except (OSError,ValueError,TypeError,KeyError,AttributeError):
                pass

    def save(self):
        if self.state_path:
            try:
                self.state_path.parent.mkdir(parents=True,exist_ok=True)
                temp=self.state_path.with_suffix('.tmp')
                temp.write_text(json.dumps({c:{'last_ok':stamp,'avg':self.avg[c]} for c,stamp in self.last_ok.items()}))
                temp.replace(self.state_path)
            except OSError:
                pass

    def rank(self, methods: list[str]) -> list[str]:
        now = time.time()
        live = list(dict.fromkeys(c for c in methods if self.blocked_until.get(c, 0) < now))
        base = {c: i for i, c in enumerate(methods)}
        # Compare verified audio, including independent exits, by latency rather
        # than which route happened to win the previous track.
        def key(c: str):
            fresh = now - self.last_ok.get(c, 0) < 600
            return (0 if fresh else 1, self.avg.get(c, 9.0) + min(6,self.fails.get(c,0)*2) if fresh else base[c])
        return sorted(live, key=key)

    def order(self) -> list[str]:
        return self.rank(list(FALLBACK_CLIENTS))

    def hedge_delay(self, method: str) -> float:
        # Give the likely winner a short head start. Slow source activation must
        # not delay an independent exit until the full primary timeout.
        estimate=self.avg.get(method)
        return max(STEP, min(1.2, estimate*.8 if estimate is not None else STEP))

    def ok(self, c: str, secs: float):
        self.last_ok[c] = time.time()
        self.fails[c] = 0
        self.avg[c] = secs if c not in self.avg else self.avg[c] * 0.7 + secs * 0.3
        self.save()

    def fail(self, c: str, msg: str):
        self.fails[c] = self.fails.get(c, 0) + 1
        low = msg.lower()
        if "403" in low or self.fails[c] >= 3:
            self.blocked_until[c] = time.time() + min(120, 10 * self.fails[c])
        if "not a bot" in low or "не бот" in low or "sign in to confirm" in low:
            self.blocked_until[c] = time.time() + BOT_COOLDOWN
            log.warning("способ %s: YouTube просит подтвердить, что не бот — пауза %d мин", c or "default", BOT_COOLDOWN // 60)

    def state(self) -> dict:
        now = time.time()
        return {c or "default": {"ok_ago": round(now - self.last_ok[c]) if c in self.last_ok else None, "avg": round(self.avg.get(c, 0), 2),
                                 "fails": self.fails.get(c, 0), "paused": max(0, round(self.blocked_until.get(c, 0) - now))} for c in (*FALLBACK_CLIENTS,'regional','regional_ytdlp')}


ladder = Ladder(DATA / 'audio-routes.json')
API_LOCAL = os.environ.get("LULL_API_LOCAL", "http://127.0.0.1:8787")
API_REGIONAL = os.environ.get("LULL_YT_FALLBACK_API", "").rstrip("/")
# Выход в YouTube через Cloudflare WARP (socks5://127.0.0.1:40000): адрес сервера-датацентра YouTube режет.
# Через прокси — и получение ссылки (yt-dlp), и сам файл: ссылка привязана к адресу, с которого её получили.
YT_PROXY = os.environ.get("LULL_YT_PROXY", "")
YT_FALLBACK_PROXY = os.environ.get("LULL_YT_FALLBACK_PROXY", "")
yt_session: "ClientSession | None" = None
fallback_yt_session: "ClientSession | None" = None


def audio_session(s: dict):
    if s.get("exit") == "fallback":
        if fallback_yt_session is None:
            raise RuntimeError("fallback audio connection unavailable")
        return fallback_yt_session
    assert yt_session is not None
    return yt_session


# Only preparation requests ask the catalog for bytes. Link-only API clients keep JSON.
prepare_audio = contextvars.ContextVar("prepare_audio", default=False)
READ_AHEAD = os.environ.get("LULL_READ_AHEAD", "1") != "0"
verified_audio = OrderedDict()
AUDIO_FRAME = "application/vnd.lull.prepared-audio"
MAX_INLINE = 8 * 1024 * 1024


def remember_verified(url: str, data: bytes):
    verified_audio[url]=data
    verified_audio.move_to_end(url)
    while len(verified_audio)>4 or sum(map(len,verified_audio.values()))>MAX_MUXED_BYTES:
        verified_audio.popitem(last=False)


async def read_audio_frame(reader):
    length = int.from_bytes(await reader.readexactly(4), "big")
    if not 0 < length <= 128 * 1024:
        raise ValueError("invalid stream metadata length")
    meta = json.loads(await reader.readexactly(length))
    total = int(meta["size"])
    if not meta.get("url") or total <= 0:
        raise ValueError("invalid stream metadata")
    if meta.get('complete') and total > MAX_MUXED_BYTES:
        raise ValueError('complete audio frame exceeds size bound')
    expected = total if total <= MAX_INLINE or meta.get('complete') else FIRST_CHUNK + CHUNK
    data = await reader.readexactly(expected)
    if await reader.read(1):
        raise ValueError("oversized stream frame")
    return meta, data


async def resolve_innertube(vid: str, regional: str = "") -> dict:
    """Ссылка от каталога Lull (youtubei.js). Он сам проверяет начало и середину файла, поэтому повторно не проверяем."""
    assert session is not None
    headers = {"Accept": AUDIO_FRAME} if prepare_audio.get() or regional else {}
    async with session.get(f"{regional or API_LOCAL}/internal/stream/{vid}", headers=headers, timeout=ClientTimeout(total=8 if regional else 15)) as r:
        if r.status == 200 and r.content_type == AUDIO_FRAME:
            j, data = await read_audio_frame(r.content)
            if regional and len(data) != int(j.get("size") or 0):
                raise RuntimeError("regional audio must be complete")
            remember_verified(j['url'],data)
        else:
            j = await r.json(content_type=None)
            if regional and r.status == 200:
                raise RuntimeError("regional audio must be a prepared frame")
    if r.status != 200 or j.get("error") or not j.get("url"):
        raise RuntimeError(j.get("error") or f"innertube {r.status}")
    mime = (j.get("mime") or "audio/mp4").split(";")[0]
    log.info("resolve %s innertube %.1fs", vid, (j.get("ms") or 0) / 1000)
    return {"url": j["url"], "headers": {}, "mime": mime, "bitrate": j.get("bitrate") or 128000,
            "contentLength": j.get("size") or 0, "durationSec": j.get("duration") or 0, "formatId": "", "checked": True,
            "via": "innertube", "mediaId": j.get("mediaId") or vid, "client": j.get("client") or ""}


async def verify(s: dict) -> bool:
    """Ссылка реально отдаёт звук так, как его берёт раздача: первые байты (заодно узнаём размер)
    и следующий кусок в 2 МБ — без нужного токена YouTube отдаёт начало, а дальше 403."""
    assert yt_session is not None
    s.pop("_probe403", None)
    try:
        known = int(s.get("contentLength") or 0)
        if prepare_audio.get() and 0 < known <= MAX_INLINE:
            async with audio_session(s).get(s["url"], headers=s["headers"], timeout=ClientTimeout(total=12)) as r:
                if r.status not in (200, 206):
                    if r.status == 403:
                        s["_probe403"] = True
                    return False
                data = await r.content.readexactly(known)
                if await r.content.read(1):
                    return False
                remember_verified(s['url'],data)
                return True
        async with audio_session(s).get(s["url"], headers={**s["headers"], "Range": "bytes=0-1"}) as r:
            if r.status not in (200, 206):
                if r.status == 403:
                    s["_probe403"] = True
                return False
            total = r.headers.get("Content-Range", "").rpartition("/")[2]
            if not total.isdigit() and r.status == 200:
                total = r.headers.get("Content-Length", "")
            if total.isdigit():
                s["contentLength"] = int(total)
        n = int(s.get("contentLength") or 0)
        if n > FIRST_CHUNK + 1:
            await fetch_range(s, FIRST_CHUNK, min(n - 1, FIRST_CHUNK + CHUNK - 1))
        return True
    except PermissionError as e:
        if "403" in str(e):
            s["_probe403"] = True
        return False
    except Exception:
        return False


async def resolve_worker(vid: str, fmt: str, client: str, proxy: str | None = None) -> dict:
    # Cancelling asyncio cannot stop a running Python thread. Keep its slot occupied
    # until extraction really finishes, and never enqueue unlimited executor work.
    await resolve_slots.acquire()
    try:
        fut = asyncio.get_running_loop().run_in_executor(pool, resolve_sync, vid, fmt, client, proxy)
    except BaseException:
        resolve_slots.release()
        raise
    def finished(f):
        resolve_slots.release()
        if not f.cancelled():
            f.exception()
    fut.add_done_callback(finished)
    return await asyncio.shield(fut)


async def resolve_regional(vid: str) -> dict:
    """Independent exits race full audio, never hand a foreign-IP URL to WARP."""
    endpoints = list(dict.fromkeys(x.strip() for x in API_REGIONAL.split(',') if x.strip()))[:3]
    tasks = {asyncio.create_task(resolve_innertube(vid, base)) for base in endpoints}
    errors = []
    try:
        while tasks:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                tasks.remove(task)
                try:
                    return task.result()
                except Exception as e:
                    errors.append(str(e))
        raise RuntimeError('; '.join(errors) or 'no regional exit')
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def resolve_checked(vid: str, fmt: str) -> dict:
    """Bounded hedged race: advance on failure, cancel losers, cap total latency."""
    errors: list[str] = []
    t0 = time.monotonic()
    deadline = t0 + RESOLVE_TIMEOUT
    unavailable = asyncio.Event()
    route_failed = asyncio.Event()
    async def one(client: str, media_id: str | None = None):
        nonlocal deadline
        started = time.monotonic()
        target = media_id or vid
        try:
            if client in ("innertube", "regional"):
                if fmt != "aac":
                    return
                s = await resolve_regional(target) if client == "regional" else await resolve_innertube(target)
            elif client == "regional_ytdlp":
                s = await resolve_worker(target, fmt, "mweb", YT_FALLBACK_PROXY)
                s["exit"] = "fallback"
            else:
                s = await resolve_worker(target, fmt, client)
            resolved_at=time.monotonic()
            waited=0.0
            retry_after = s.pop("retryAfter", 0)
            candidates = [s, *s.pop("alternateFormats", [])]
            candidates.sort(key=lambda candidate:max(time.time(),float(candidate.get("availableAt") or 0)))
            selected = None
            for attempt in range(2):
                for candidate in candidates:
                    if s.get("exit"):
                        candidate["exit"] = s["exit"]
                    wait = max(0,float(candidate.get("availableAt") or 0)+.05-time.time())
                    if wait:
                        if wait > 35:
                            continue
                        deadline = max(deadline,min(t0+50,time.monotonic()+wait+12))
                        log.info("audio_source_wait video=%s route=%s seconds=%.2f",vid,client or "default",wait)
                        await asyncio.sleep(wait)
                        waited+=wait
                    if candidate.get("checked") or await verify(candidate):
                        if candidate.get("muxed") and int(candidate.get("contentLength") or 0) > MAX_MUXED_BYTES:
                            continue
                        selected = candidate
                        break
                if selected:
                    break
                if attempt or not retry_after or not any(x.get("_probe403") for x in candidates):
                    break
                delay = min(5, max(0, retry_after-time.monotonic()))
                log.info("audio_url_wait video=%s route=%s seconds=%.2f", vid, client or "default", delay)
                await asyncio.sleep(delay)
                waited+=delay
            if selected is None:
                raise RuntimeError("403 or incomplete audio probe")
            if selected is not s:
                log.info("audio_format_fallback video=%s route=%s format=%s", vid, client or "default", selected.get("formatId"))
            s = selected
            s.pop("_probe403", None)
        except Exception as e:
            msg = str(e).replace("ERROR: ", "")
            # «недоступно» запасной клиент (tv и др.) пишет и про нормальные видео — решает только итог по всем
            errors.append(f"{client or 'default'}: {msg}")
            low = msg.lower()
            reason = "bot" if "bot" in low or "sign in to confirm" in low else "forbidden" if "403" in low else "timeout" if "timeout" in low or "нет ответа" in low else "unavailable" if "unavailable" in low or "not available" in low or "недоступно" in low else "other"
            log.info("audio_failure video=%s route=%s reason=%s", vid, client or "default", reason)
            if media_id is None and client != "regional":
                route_failed.set()
            if media_id is None and any(x in low for x in ("unavailable", "not available", "country", "claimed content")):
                unavailable.set()
            if not any(x in low for x in ("unavailable", "not available", "claimed content", "country", "private", "removed")):
                if client in ("regional", "regional_ytdlp") and "403" in low:
                    # A regional 403 can be specific to this recording. Penalize
                    # its speed score without disabling it for unrelated songs.
                    ladder.fails[client] = ladder.fails.get(client,0)+1
                else:
                    ladder.fail(client, msg)
            return
        ladder.ok(client, time.monotonic() - started)
        log.info('audio_route_timing video=%s route=%s resolve_ms=%.0f activation_ms=%.0f verify_ms=%.0f',vid,client or 'default',(resolved_at-started)*1000,waited*1000,max(0,time.monotonic()-resolved_at-waited)*1000)
        s["method"] = client
        if client not in ("innertube", "regional"):
            s["client"] = client
        if media_id:
            s["mediaId"] = media_id
        return s

    async def other_recording():
        # Version discovery must not depend on the Innertube audio method being
        # healthy: a bot cooldown there used to disable all alternate recordings.
        try:
            assert session is not None
            async with session.get(f"{API_LOCAL}/internal/stream/{vid}?alternatives=1", timeout=ClientTimeout(total=4)) as response:
                result = await response.json()
            ids = [x for x in result.get("ids", []) if valid_vid(x) and x != vid][:5]
            clients = ((["regional_ytdlp"] if YT_FALLBACK_PROXY and fmt == "aac" else []) + [x for x in ladder.order() if x != "innertube"])[:2]
            for candidate in ids:
                for client in clients:
                    found = await one(client, candidate)
                    if found:
                        log.info("alternate %s -> %s via %s", vid, candidate, client or "default")
                        return found
        except Exception as e:
            errors.append(f"alternate: {e}")

    order = ladder.order()
    regional_started = False
    regional_methods = (["regional"] if API_REGIONAL else []) + (["regional_ytdlp"] if YT_FALLBACK_PROXY else [])
    regional_methods = ladder.rank(regional_methods)
    regional_ready = bool(regional_methods) and fmt == "aac"
    # A working independent exit must remain available while primary clients cool down.
    if regional_ready:
        order = ladder.rank(order + regional_methods)
        # Prefer the independent resolver implementation as the hedge. Two
        # yt-dlp clients can otherwise occupy both workers and starve the fast
        # API on a proven working regional exit.
        if order:
            if order[0] not in ('innertube','regional'):
                probes=['regional','innertube'] if order[0]=='regional_ytdlp' else ['innertube','regional']
                independent=next((c for c in probes if c in order[1:]),None)
            else:
                independent=next((c for c in order[1:] if c in ('innertube','regional')),None)
                if independent is None:
                    independent=next((c for c in order[1:] if c not in ('innertube','regional')),None)
            if independent is not None:
                order.remove(independent); order.insert(1,independent)
        regional_started = True
    if fmt != "aac" and "innertube" in order:
        order.remove("innertube")
    pending = set()
    leader = order[0] if order else "innertube"
    alternate_started = False
    try:
        while order or pending:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                errors.append("resolve deadline exceeded")
                break
            if not pending and order:
                pending.add(asyncio.create_task(one(order.pop(0))))
            hedge = ladder.hedge_delay(leader)
            completed, _ = await asyncio.wait(pending, timeout=min(hedge, remaining), return_when=asyncio.FIRST_COMPLETED)
            for task in completed:
                pending.remove(task)
                s = task.result()
                if s:
                    log.info("race %s: %s %.2fs", vid, s.get("method") or "default", time.monotonic() - t0)
                    return s
            if route_failed.is_set() and regional_ready and not regional_started:
                regional_started = True
                order = regional_methods + order
            if unavailable.is_set() and not alternate_started and len(pending) < RACE_WIDTH:
                alternate_started = True
                pending.add(asyncio.create_task(other_recording()))
            # A failure advances immediately; a slow attempt gets a bounded hedge.
            if order and len(pending) < RACE_WIDTH:
                pending.add(asyncio.create_task(one(order.pop(0))))
        raise RuntimeError("; ".join(errors) or "no stream")
    finally:
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)


async def api_warm(request: web.Request) -> web.Response:
    """Готовим ссылки на звук заранее (следующие треки очереди): потом трек стартует сразу."""
    fmt = request.query.get("q", "aac")
    fmt = fmt if fmt in FORMATS else "auto"
    # Existing APKs already warm visible lists: make these requests useful before
    # the tap, without requiring an APK update. full=0 remains link-only.
    full = request.query.get("full", "1") != "0"
    ids = list(dict.fromkeys(x for x in request.query.get("ids", "").split(",") if valid_vid(x)))[:6]
    queued = 0
    for vid in ids:
        if prep_find(vid, fmt) or f"{fmt}:{vid}" in prep_inflight:
            continue
        if not full:
            hit = cache.get(f"{fmt}:{vid}")
            if (hit and hit[0] > time.time()) or f"{fmt}:{vid}" in inflight:
                continue
        key = f"{fmt}:{vid}"
        if key not in warm_queue and len(warm_queue) >= 32:
            continue
        old = warm_queue.get(key)
        warm_queue[key] = (vid, fmt, full or bool(old and old[2]))
        warm_event.set()
        queued += 1
    r = web.json_response({"ok": True, "queued": queued}, status=202)
    return cors(request, r)


async def api_diag(request: web.Request) -> web.Response:
    """Замер: сколько каждый клиент YouTube получает рабочую ссылку на звук с этого сервера (без кэша).
    /api/diag?vid=…  — по очереди для всех клиентов; ограничено общим лимитом запросов."""
    vid = request.query.get("vid", "kJQP7kiw5Fk")
    if not (5 <= len(vid) <= 20):
        return cors(request, web.json_response({"error": "bad vid"}, status=400))
    loop = asyncio.get_running_loop()
    out = {}
    # state=1 — только рейтинг, без запросов к YouTube; all=1 — все способы; по умолчанию три первых в рейтинге
    if request.query.get("state"):
        return cors(request, web.json_response({"order": [c or "default" for c in ladder.order()], "ladder": ladder.state()}))
    probe_list = list(FALLBACK_CLIENTS) if request.query.get("all") else ladder.order()[:3]
    for c in probe_list:
        t0 = time.monotonic()
        try:
            s = await resolve_innertube(vid) if c == "innertube" else await loop.run_in_executor(pool, resolve_sync, vid, "aac", c)
            t1 = time.monotonic()
            ok = await verify(s)
            out[c or "default"] = {"resolve": round(t1 - t0, 2), "verify": round(time.monotonic() - t1, 2), "ok": ok, "mime": s.get("mime")}
        except Exception as e:
            out[c or "default"] = {"error": str(e).replace("ERROR: ", "")[:160], "t": round(time.monotonic() - t0, 2)}
    return cors(request, web.json_response({"vid": vid, "yt_dlp": yt_dlp.version.__version__, "order": [c or "default" for c in ladder.order()], "ladder": ladder.state(), "clients": out}))


async def _warm(vid: str, fmt: str, full: bool = True):
    try:
        await (prepared(vid, fmt) if full else get_stream(vid, fmt))
    except Exception as e:
        log.info("warm %s: %s", vid, e)


def valid_vid(vid: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_-]{11}", vid))


warm_queue = OrderedDict()
warm_event = asyncio.Event()


async def warm_worker():
    # One background preparation leaves two preparation slots for user taps.
    while True:
        await warm_event.wait()
        while warm_queue:
            _, args = warm_queue.popitem(last=False)
            await _warm(*args)
        warm_event.clear()


def warm_catalog_snapshot(snapshot) -> int:
    queued=0;seen=set()
    for section in snapshot if isinstance(snapshot,list) else []:
        for item in section.get('items',[]) if isinstance(section,dict) else []:
            if not isinstance(item,dict) or item.get('kind')!='track':continue
            track=item.get('track') or item
            vid=track.get('id') if isinstance(track,dict) else None
            if not isinstance(vid,str) or not valid_vid(vid) or vid in seen:continue
            seen.add(vid)
            key=f'aac:{vid}'
            if prep_find(vid,'aac') or key in prep_inflight or key in warm_queue:continue
            if len(warm_queue)>=32 or queued>=24:break
            warm_queue[key]=(vid,'aac',True);queued+=1
    if queued:warm_event.set()
    return queued


async def catalog_warm_worker():
    # Prepare the small public chart before a listener opens it. Existing files
    # cause no YouTube requests; user searches never enqueue audio here.
    await asyncio.sleep(15)
    while True:
        try:
            assert session is not None
            async with session.get(f'{NODE_API}/api/charts',timeout=ClientTimeout(total=15)) as response:
                if response.status==200:
                    queued=warm_catalog_snapshot(await response.json())
                    if queued:log.info('catalog_warm queued=%d',queued)
        except Exception as e:
            log.info('catalog_warm unavailable: %s',type(e).__name__)
        await asyncio.sleep(900)


async def get_stream(vid: str, fmt: str, fresh: bool = False) -> dict:
    """Ссылка на звук из кэша или свежая (проверенная). Бросает исключение, если трека нет."""
    fmt = fmt if fmt in FORMATS else "auto"
    key = f"{fmt}:{vid}"
    if fresh:
        cache.pop(key, None)
    hit = cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    if key not in inflight:
        fut = inflight[key] = asyncio.create_task(resolve_checked(vid, fmt))
        def finished(f):
            if inflight.get(key) is f:
                inflight.pop(key, None)
            if not f.cancelled():
                f.exception()
        fut.add_done_callback(finished)
    s = await asyncio.shield(inflight[key])
    try:
        expire = int(dict(p.split("=", 1) for p in s["url"].split("?", 1)[1].split("&") if "=" in p).get("expire", "0"))
    except Exception:
        expire = 0
    cache[key] = ((expire - 300) if expire else time.time() + 3 * 3600, s)
    cache.move_to_end(key)
    while len(cache) > 20000:
        cache.popitem(last=False)
    return s


def stream_error(e: Exception) -> web.Response:
    msg = str(e).replace("ERROR: ", "")
    low = msg.lower()
    transient = any(x in low for x in ("403", "bot", "timeout", "deadline", "incomplete", "connection", "нет ответа"))
    missing = ("unavailable" in low or "not available" in low) and "format" not in low and not transient
    return web.json_response({"error": msg, "reason": "not_available" if missing else "upstream_unavailable"}, status=404 if missing else 502)


async def resolve(request: web.Request) -> web.Response:
    try:
        s = await get_stream(request.match_info["vid"], request.query.get("q", "auto"), bool(request.query.get("fresh")))
    except Exception as e:
        return stream_error(e)
    return web.json_response(s)


# ---------- SoundCloud ----------
def _sc_search_sync(q: str) -> dict:
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True, "socket_timeout": 10}) as y:
        return y.extract_info(f"scsearch6:{q}", download=False)


async def sc_search(request: web.Request) -> web.Response:
    q = request.query.get("q", "").strip()
    if not q:
        return web.json_response([])
    loop = asyncio.get_running_loop()
    try:
        j = await loop.run_in_executor(pool, _sc_search_sync, q)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=502)
    out = [{"url": e.get("url") or e.get("webpage_url"), "title": e.get("title") or "", "uploader": e.get("uploader") or "",
            "duration": e.get("duration") or 0} for e in (j.get("entries") or [])]
    return web.json_response(out)


def sc_download_sync(url: str) -> Path:
    name = hashlib.sha1(url.encode()).hexdigest()
    for p in SC_DIR.glob(name + ".*"):
        return p
    opts = {"quiet": True, "no_warnings": True, "noplaylist": True, "socket_timeout": 10,
            "format": "http_mp3_1_0/http_mp3/bestaudio[protocol^=http]/bestaudio",
            "outtmpl": str(SC_DIR / (name + ".%(ext)s"))}
    with yt_dlp.YoutubeDL(opts) as y:
        y.download([url])
    files = list(SC_DIR.glob(name + ".*"))
    if not files:
        raise RuntimeError("SoundCloud: файл не скачался")
    # Кэш ограничен ~2 ГБ: удаляем самые старые
    all_files = sorted(SC_DIR.glob("*"), key=lambda p: p.stat().st_mtime)
    total = sum(p.stat().st_size for p in all_files)
    while total > 2 * 1024**3 and all_files:
        old = all_files.pop(0)
        total -= old.stat().st_size
        old.unlink(missing_ok=True)
    return files[0]


async def sc_file(request: web.Request) -> web.StreamResponse:
    url = request.query.get("url", "")
    if not url.startswith("https://soundcloud.com/") and not url.startswith("https://api.soundcloud.com/") and not url.startswith("https://api-v2.soundcloud.com/"):
        return web.json_response({"error": "bad url"}, status=400)
    loop = asyncio.get_running_loop()
    try:
        path = await loop.run_in_executor(pool, sc_download_sync, url)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=502)
    ext = path.suffix.lower()
    ctype = {".mp3": "audio/mpeg", ".opus": "audio/ogg", ".ogg": "audio/ogg", ".m4a": "audio/mp4"}.get(ext, "application/octet-stream")
    return web.FileResponse(path, headers={"Content-Type": ctype, "X-Ext": ext.lstrip(".")})


async def health(_: web.Request) -> web.Response:
    return web.json_response({"ok": True, "yt_dlp": yt_dlp.version.__version__, "cached": len(cache)})


async def on_start(app: web.Application):
    global session, yt_session, fallback_yt_session
    app["warm_worker"] = asyncio.create_task(warm_worker())
    session = ClientSession(timeout=ClientTimeout(total=None, sock_connect=10, sock_read=60), connector=TCPConnector(limit=0, ttl_dns_cache=300, family=socket.AF_INET), auto_decompress=False)
    yt_session = session
    if YT_PROXY:
        try:
            from aiohttp_socks import ProxyConnector
            yt_session = ClientSession(timeout=ClientTimeout(total=None, sock_connect=10, sock_read=60), connector=ProxyConnector.from_url(YT_PROXY, rdns=True, limit=0), auto_decompress=False)
            log.info("YouTube через прокси %s", YT_PROXY)
        except Exception as e:
            log.warning("прокси для YouTube не подключился: %s", e)
    if YT_FALLBACK_PROXY:
        from aiohttp_socks import ProxyConnector
        fallback_yt_session = ClientSession(timeout=ClientTimeout(total=None, sock_connect=10, sock_read=20), connector=ProxyConnector.from_url(YT_FALLBACK_PROXY, rdns=True, limit=4), auto_decompress=False)
    if os.environ.get('LULL_CATALOG_WARM','1')!='0':
        app['catalog_warm_worker']=asyncio.create_task(catalog_warm_worker())


async def on_stop(app: web.Application):
    catalog_worker=app.get('catalog_warm_worker')
    if catalog_worker:
        catalog_worker.cancel()
        await asyncio.gather(catalog_worker,return_exceptions=True)
    worker = app.get("warm_worker")
    if worker:
        worker.cancel()
        await asyncio.gather(worker, return_exceptions=True)
    if yt_session and yt_session is not session:
        await yt_session.close()
    if fallback_yt_session:
        await fallback_yt_session.close()
    if session:
        await session.close()



# ---------- публичный API для веб-версии и телефона ----------
NODE_API = os.environ.get("LULL_NODE_API", "http://127.0.0.1:8787")


FIRST_CHUNK = 256 * 1024      # первый кусок маленький — звук начинается сразу
CHUNK = 2 * 1024 * 1024       # дальше по 2 МБ: YouTube тормозит и обрывает длинные запросы веб-клиентов


async def fetch_range(s: dict, a: int, b: int) -> bytes:
    """Кусок файла a..b с YouTube; 3 попытки. 403/410 — ссылка протухла, пусть решает вызывающий."""
    assert yt_session is not None
    last = None
    for _ in range(3):
        try:
            sep = "&" if "?" in s["url"] else "?"
            async with audio_session(s).get(f"{s['url']}{sep}range={a}-{b}", headers=s["headers"], timeout=ClientTimeout(total=20, sock_read=10)) as r:
                if r.status in (403, 410):
                    raise PermissionError(f"{r.status}")
                if r.status not in (200, 206):
                    raise RuntimeError(f"upstream {r.status}")
                data = await r.read()
                if len(data) != b - a + 1:
                    raise RuntimeError(f"короткий ответ {len(data)} из {b - a + 1}")
                return data
        except PermissionError:
            raise
        except Exception as e:
            last = e
            await asyncio.sleep(0.3)
    raise RuntimeError(f"кусок {a}-{b}: {last}")


class AudioVersionChanged(RuntimeError):
    pass


def range_getter(vid: str, fmt: str, s: dict):
    """Загрузчик кусков файла: при 403 одна новая ссылка на всех (остальные куски ждут и повторяют с ней)."""
    state = {"s": s, "refreshes": 0}
    lock = asyncio.Lock()

    async def get(span):
        for _ in range(3):
            cur = state["s"]
            try:
                return await fetch_range(cur, *span)
            except PermissionError:
                async with lock:
                    if state["s"] is cur:
                        if state["refreshes"] >= 2:
                            raise
                        state["refreshes"] += 1
                        await stream_forbidden(cur)
                        renewed = await get_stream(vid, fmt, fresh=True)
                        if (renewed.get("mediaId", vid) != cur.get("mediaId", vid) or
                                renewed.get("contentLength") != cur.get("contentLength") or
                                renewed.get("formatId") != cur.get("formatId")):
                            raise AudioVersionChanged("Версия файла изменилась при обновлении ссылки")
                        state["s"] = renewed
        raise RuntimeError("ссылка не отдаёт файл")
    return get


# ---------- готовые файлы: трек целиком на диске, переупакованный в обычный m4a ----------
# YouTube отдаёт звук «дроблёным» MP4 (DASH). Плееры телефонов (Media3, AVPlayer) с ним при обычной загрузке
# по ссылке спотыкаются: позиция идёт, а звука нет, долгий старт. Поэтому качаем трек целиком (через WARP ~0.5 с),
# переупаковываем ffmpeg без перекодирования (-c copy, faststart) и отдаём файлом с диска — с перемоткой.
PREP = DATA / "prep"
FFMPEG = shutil.which("ffmpeg")
PREP_MAX = int(os.environ.get("LULL_PREP_MB", "3000")) * 1024 * 1024
prep_inflight: dict[str, asyncio.Future] = {}
prep_sem = asyncio.Semaphore(3)


def prep_find(vid: str, fmt: str) -> "Path | None":
    for ext in (".m4a", ".webm", ".mp4"):
        p = PREP / f"{fmt}-{vid}{ext}"
        if p.is_file() and p.stat().st_size > 0:
            stat=p.stat()
            if time.time()-stat.st_atime>60:
                # Preserve mtime exactly: FileResponse uses it for Range/ETag.
                try:
                    os.utime(p,ns=(time.time_ns(),stat.st_mtime_ns))
                except OSError:
                    pass
            return p
    return None


def prep_cleanup():
    try:
        files = sorted((p for p in PREP.iterdir() if p.is_file() and p.suffix in (".m4a", ".webm", ".mp4") and ".part." not in p.name), key=lambda p: p.stat().st_atime)
        total = sum(p.stat().st_size for p in files)
        for p in files:
            if total <= PREP_MAX:
                break
            total -= p.stat().st_size
            p.unlink(missing_ok=True)
    except Exception as e:
        log.warning("очистка готовых файлов: %s", e)


async def _prepare(vid: str, fmt: str) -> Path:
    try:
        return await _prepare_once(vid, fmt)
    except AudioVersionChanged:
        # A refreshed URL may select another valid format/recording. Start the
        # complete file again; never concatenate bytes from different versions.
        log.info("prepare_restart video=%s reason=version_changed", vid)
        return await _prepare_once(vid, fmt)


async def read_chunks(get, spans):
    tasks = [asyncio.create_task(get(span)) for span in spans]
    try:
        return await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def download_whole(stream: dict, path: Path, total: int):
    received = 0
    try:
        async with audio_session(stream).get(stream["url"], headers=stream["headers"], timeout=ClientTimeout(total=20, sock_read=8)) as response:
            if response.status in (403,410):
                raise PermissionError(str(response.status))
            if response.status not in (200,206):
                raise RuntimeError(f"full download HTTP {response.status}")
            with path.open("wb") as output:
                async for chunk in response.content.iter_chunked(64*1024):
                    received += len(chunk)
                    if received > total:
                        raise RuntimeError("oversized full audio response")
                    output.write(chunk)
        if received != total:
            raise RuntimeError(f"incomplete full audio response {received}/{total}")
    except BaseException:
        path.unlink(missing_ok=True)
        raise


async def download_ranges(get, path: Path, prefix: bytes, total: int):
    spans=iter((a,min(a+CHUNK-1,total-1)) for a in range(len(prefix),total,CHUNK))
    with path.open('wb') as output:
        output.write(prefix)
        async def worker():
            for a,b in spans:
                data=await get((a,b))
                if len(data)!=b-a+1:
                    raise RuntimeError('incomplete audio range')
                output.seek(a);output.write(data)
        tasks=[asyncio.create_task(worker()) for _ in range(4)]
        try:
            await asyncio.gather(*tasks)
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        finally:
            for task in tasks:
                if not task.done():task.cancel()
            await asyncio.gather(*tasks,return_exceptions=True)


async def _prepare_once(vid: str, fmt: str) -> Path:
    async with prep_sem:
        t0 = time.monotonic()
        flag = prepare_audio.set(READ_AHEAD)
        try:
            s = await get_stream(vid, fmt)
        finally:
            prepare_audio.reset(flag)
        if not s.get("contentLength"):
            await verify(s)
        total = int(s.get("contentLength") or 0)
        if not total:
            raise RuntimeError("нет размера файла")
        prefix = verified_audio.pop(s["url"], b"")
        PREP.mkdir(parents=True, exist_ok=True)
        mime = s.get("mime") or "audio/mp4"
        ext = ".m4a" if fmt == "aac" and FFMPEG else ".webm" if "webm" in mime else ".m4a"
        raw = PREP / f"{fmt}-{vid}.raw"
        out = PREP / f"{fmt}-{vid}{ext}"
        reused = len(prefix) if len(prefix) == total else 0
        if reused:
            raw.write_bytes(prefix)
        elif prefix and total > MAX_INLINE:
            # A large catalog response has already verified range downloads.
            # Keep that fast route, but bound memory to four chunks per file.
            await download_ranges(range_getter(vid,fmt,s),raw,prefix,total)
            reused=len(prefix)
        else:
            try:
                await download_whole(s,raw,total)
            except PermissionError:
                await stream_forbidden(s)
                await get_stream(vid,fmt,fresh=True)
                raise AudioVersionChanged("Full download requires a renewed source")
        t1 = time.monotonic()
        if FFMPEG and ext == ".m4a":
            tmp = PREP / f"{fmt}-{vid}.part.m4a"
            codec = ["-c:a", "aac", "-b:a", "128k", "-threads", "1"] if "webm" in mime or "opus" in mime else ["-c:a", "copy"]
            proc = await asyncio.create_subprocess_exec(
                FFMPEG, "-y", "-v", "error", "-i", str(raw), "-map", "0:a:0", "-vn", *codec,
                "-movflags", "+faststart", "-f", "ipod", str(tmp),
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
            _, err = await proc.communicate()
            if proc.returncode == 0 and tmp.exists() and tmp.stat().st_size > 10000:
                tmp.replace(out)
                raw.unlink(missing_ok=True)
            else:
                tmp.unlink(missing_ok=True)
                raw.unlink(missing_ok=True)
                raise RuntimeError("audio container preparation failed: " + (err or b"").decode(errors="ignore")[:160])
        else:
            raw.replace(out)
        log.info("prepare %s: %d КБ, без повторной загрузки %d КБ, скачано за %.1fs, всего %.1fs", vid, total // 1024, reused // 1024, t1 - t0, time.monotonic() - t0)
        prep_cleanup()
        return out


async def prepared(vid: str, fmt: str) -> Path:
    """Готовый файл трека: с диска, а если нет — качаем (один раз на трек, сколько бы запросов ни пришло)."""
    if not valid_vid(vid):
        raise ValueError("bad video id")
    fmt = fmt if fmt in FORMATS else "auto"
    p = prep_find(vid, fmt)
    if p:
        return p
    key = f"{fmt}:{vid}"
    fut = prep_inflight.get(key)
    if fut is None:
        fut = prep_inflight[key] = asyncio.ensure_future(_prepare(vid, fmt))
        fut.add_done_callback(lambda f: (prep_inflight.pop(key, None), f.cancelled() or f.exception()))
    return await asyncio.shield(fut)


async def api_stream(request: web.Request) -> web.StreamResponse:
    """Звук трека с перемоткой (Range). Браузер и телефон не могут открыть ссылку YouTube сами
    (она привязана к адресу сервера), поэтому отдаём её отсюда — кусками, с подкачкой следующего."""
    vid = request.match_info["vid"]
    if not valid_vid(vid):
        return cors(request, web.json_response({"error": "bad video id"}, status=400))
    fmt = request.query.get("q", "aac")
    fmt = fmt if fmt in FORMATS else "auto"
    try:
        started = time.monotonic()
        cached = prep_find(vid, fmt) is not None
        path = await asyncio.wait_for(prepared(vid, fmt), timeout=60)
        r = web.FileResponse(path, headers={"Content-Type": "audio/webm" if path.suffix == ".webm" else "audio/mp4",
                                            "Cache-Control": "no-store",
                                            "X-Lull-Cache": "hit" if cached else "miss",
                                            "Server-Timing": f"prepare;dur={(time.monotonic() - started) * 1000:.1f}"})
        return cors(request, r)
    except Exception as e:
        log.warning("prepare failed %s: %s", vid, str(e)[:200])
        if fmt == "aac":
            return cors(request, stream_error(e))
        # If there is no playable URL, rerunning the same full race here doubles
        # latency and consumes workers needed for the next tap.
        hit = cache.get(f"{fmt}:{vid}")
        if not hit or hit[0] <= time.time():
            return cors(request, stream_error(e))
    try:
        s = await get_stream(vid, fmt)
        if not s.get("contentLength"):
            await verify(s)
        if not s.get("contentLength"):
            s = await get_stream(vid, fmt, fresh=True)
            await verify(s)
    except Exception as e:
        return cors(request, stream_error(e))
    total = int(s.get("contentLength") or 0)
    if not total:
        return cors(request, web.json_response({"error": "нет размера файла"}, status=502))
    a, b, partial = 0, total - 1, False
    rng = request.headers.get("Range", "")
    if rng.startswith("bytes="):
        lo, _, hi = rng[6:].split(",")[0].partition("-")
        try:
            if lo:
                a, b = int(lo), (min(int(hi), total - 1) if hi else total - 1)
            elif hi:
                a, b = max(0, total - int(hi)), total - 1
            partial = True
        except ValueError:
            pass
    if a >= total or a > b:
        r = web.Response(status=416, headers={"Content-Range": f"bytes */{total}"})
        return cors(request, r)
    resp = web.StreamResponse(status=206 if partial else 200)
    resp.headers["Content-Type"] = s.get("mime") or "audio/mp4"
    resp.headers["Content-Length"] = str(b - a + 1)
    resp.headers["Accept-Ranges"] = "bytes"
    if partial:
        resp.headers["Content-Range"] = f"bytes {a}-{b}/{total}"
    resp.headers["Cache-Control"] = "no-store"
    cors(request, resp)

    spans = []
    pos, size = a, FIRST_CHUNK
    while pos <= b:
        end = min(pos + size - 1, b)
        spans.append((pos, end))
        pos, size = end + 1, CHUNK
    get = range_getter(vid, fmt, s)

    tasks: list[asyncio.Task] = []
    try:
        await resp.prepare(request)
        # подкачиваем на 2 куска вперёд, пока отдаём текущий
        for k, span in enumerate(spans):
            while len(tasks) < k + 3 and len(tasks) < len(spans):
                tasks.append(asyncio.ensure_future(get(spans[len(tasks)])))
            data = await tasks[k]
            await resp.write(data)
            tasks[k] = None  # type: ignore[assignment]
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    except Exception as e:
        log.warning("stream %s оборвался на %s: %s", vid, a, e)
        if request.transport:
            request.transport.close()  # иначе плеер ждёт недостающие байты до таймаута
    finally:
        for t in tasks:
            if t:
                if not t.done():
                    t.cancel()
                t.add_done_callback(lambda x: x.cancelled() or x.exception())
    return resp


async def stream_forbidden(s: dict):
    """Ссылка перестала отдавать файл (403): этот способ опускаем в рейтинге, а быстрому — говорим сменить клиент."""
    via = s.get("via") or ""
    log.warning("403 в середине файла: %s %s", via or "yt-dlp", s.get("client") or "")
    if via == "innertube":
        ladder.fail("innertube", "403")
        try:
            assert session is not None
            async with session.get(f"{API_LOCAL}/internal/stream/x?bad={quote(s.get('client') or '')}", timeout=ClientTimeout(total=3)):
                pass
        except Exception:
            pass
    else:
        ladder.fail(s.get("method", s.get("client", "")), "403")
    for k in [k for k, v in cache.items() if v[1] is s]:
        cache.pop(k, None)


async def api_proxy(request: web.Request) -> web.StreamResponse:
    """Каталог (главная, поиск, артисты, альбомы, тексты, обложки) — Node-сервис на этом же сервере."""
    assert session is not None
    body = await request.read() if request.can_read_body else None
    headers = {"Content-Type": request.headers.get("Content-Type", "application/json")}
    try:
        up = await session.request(request.method, NODE_API + request.path_qs, data=body, headers=headers)
    except Exception as e:
        return cors(request, web.json_response({"error": f"api: {e}"}, status=502))
    resp = web.StreamResponse(status=up.status)
    for k in ("Content-Type", "Content-Length", "Cache-Control", "Content-Encoding"):
        if k in up.headers:
            resp.headers[k] = up.headers[k]
    cors(request, resp)  # без этого браузер (веб-версия) не читает ответ: «Нет связи с сервером Lull»
    await resp.prepare(request)
    try:
        async for chunk in up.content.iter_chunked(64 * 1024):
            await resp.write(chunk)
    finally:
        up.release()
    return resp


def main():
    if not KEY:
        raise SystemExit("LULL_KEY не задан")
    app = web.Application(middlewares=[guard], client_max_size=8 * 1024 * 1024)
    app.router.add_get("/health", health)
    app.router.add_route("*", "/f", forward)
    app.router.add_get("/resolve/{vid}", resolve)
    app.router.add_get("/sc/search", sc_search)
    app.router.add_get("/sc/file", sc_file)
    app.router.add_get("/api/stream/{vid}", api_stream)
    app.router.add_get("/api/warm", api_warm)
    app.router.add_get("/api/diag", api_diag)
    app.router.add_route("*", "/api/{tail:.*}", api_proxy)
    app.on_startup.append(on_start)
    app.on_cleanup.append(on_stop)
    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ctx.load_cert_chain(CERT, PKEY)

    async def serve():
        runner = web.AppRunner(app, access_log=None)
        await runner.setup()
        await web.TCPSite(runner, "0.0.0.0", PORT, ssl_context=ctx).start()
        # Без шифрования, только для Caddy/nginx на этом же сервере (он даёт настоящий HTTPS для браузеров)
        await web.TCPSite(runner, "127.0.0.1", int(os.environ.get("LULL_HTTP_PORT", "8480"))).start()
        log.info("Lull Relay: https://0.0.0.0:%s, http://127.0.0.1:%s", PORT, os.environ.get("LULL_HTTP_PORT", "8480"))
        await asyncio.Event().wait()

    asyncio.run(serve())


if __name__ == "__main__":
    main()
