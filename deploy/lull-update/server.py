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
WORKERS = max(1, int(os.environ.get("LULL_WORKERS", "8")))
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


def ydl_for(fmt: str, client: str = "") -> yt_dlp.YoutubeDL:
    # Свой экземпляр на поток, формат и клиент (yt-dlp не потокобезопасен): плеер YouTube и разгадка
    # подписи кэшируются внутри — следующие треки быстрее.
    # source_address 0.0.0.0 = только IPv4: ссылка googlevideo привязана к адресу, с которого её получили,
    # и звук мы качаем тоже по IPv4 — иначе YouTube отвечает 403.
    _ydl = getattr(_local, "ydl", None)
    if _ydl is None:
        _ydl = _local.ydl = {}
    k = f"{fmt}:{client}"
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
            **({"proxy": YT_PROXY} if YT_PROXY else {}),
            "js_runtimes": {"node": {}},
            # Аккаунт YouTube для треков с ограничениями (18+, «войдите, чтобы подтвердить…»):
            # файл cookies в формате Netscape кладёт владелец сервера, в репозиторий он не попадает.
            **({"cookiefile": str(COOKIES)} if os.environ.get("LULL_YT_USE_COOKIES") == "1" and COOKIES.is_file() else {}),
        })
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
    }


def resolve_sync(vid: str, fmt: str, client: str = "") -> dict:
    t0 = time.monotonic()
    j = ydl_for(fmt, client).extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
    s = to_stream(j)
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
BOT_COOLDOWN = 120


class Ladder:
    """Рейтинг способов: последний успешный — первым, «бот»/403 — вниз или на паузу."""

    def __init__(self):
        self.last_ok: dict[str, float] = {}
        self.avg: dict[str, float] = {}
        self.fails: dict[str, int] = {}
        self.blocked_until: dict[str, float] = {}

    def order(self) -> list[str]:
        now = time.time()
        live = [c for c in FALLBACK_CLIENTS if self.blocked_until.get(c, 0) < now]
        base = {c: i for i, c in enumerate(FALLBACK_CLIENTS)}
        # успевший недавно (10 мин) — вперёд, потом по скорости; у кого подряд ошибки — назад
        def key(c: str):
            fresh = now - self.last_ok.get(c, 0) < 600
            return (0 if fresh else 1, self.fails.get(c, 0), self.avg.get(c, 9.0) if fresh else base[c])
        return sorted(live, key=key) or list(FALLBACK_CLIENTS)

    def ok(self, c: str, secs: float):
        self.last_ok[c] = time.time()
        self.fails[c] = 0
        self.avg[c] = secs if c not in self.avg else self.avg[c] * 0.7 + secs * 0.3

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
                                 "fails": self.fails.get(c, 0), "paused": max(0, round(self.blocked_until.get(c, 0) - now))} for c in FALLBACK_CLIENTS}


ladder = Ladder()
API_LOCAL = os.environ.get("LULL_API_LOCAL", "http://127.0.0.1:8787")
# Выход в YouTube через Cloudflare WARP (socks5://127.0.0.1:40000): адрес сервера-датацентра YouTube режет.
# Через прокси — и получение ссылки (yt-dlp), и сам файл: ссылка привязана к адресу, с которого её получили.
YT_PROXY = os.environ.get("LULL_YT_PROXY", "")
yt_session: "ClientSession | None" = None


async def resolve_innertube(vid: str) -> dict:
    """Ссылка от каталога Lull (youtubei.js). Он сам проверяет начало и середину файла, поэтому повторно не проверяем."""
    assert session is not None
    async with session.get(f"{API_LOCAL}/internal/stream/{vid}", timeout=ClientTimeout(total=15)) as r:
        j = await r.json(content_type=None)
    if r.status != 200 or j.get("error") or not j.get("url"):
        raise RuntimeError(j.get("error") or f"innertube {r.status}")
    mime = (j.get("mime") or "audio/mp4").split(";")[0]
    log.info("resolve %s innertube %.1fs", vid, (j.get("ms") or 0) / 1000)
    return {"url": j["url"], "headers": {}, "mime": mime, "bitrate": j.get("bitrate") or 128000,
            "contentLength": j.get("size") or 0, "durationSec": j.get("duration") or 0, "formatId": "", "checked": True,
            "via": "innertube", "client": j.get("client") or ""}


async def verify(s: dict) -> bool:
    """Ссылка реально отдаёт звук так, как его берёт раздача: первые байты (заодно узнаём размер)
    и следующий кусок в 2 МБ — без нужного токена YouTube отдаёт начало, а дальше 403."""
    assert yt_session is not None
    try:
        async with yt_session.get(s["url"], headers={**s["headers"], "Range": "bytes=0-1"}) as r:
            if r.status not in (200, 206):
                return False
            total = r.headers.get("Content-Range", "").rpartition("/")[2]
            if total.isdigit():
                s["contentLength"] = int(total)
        n = int(s.get("contentLength") or 0)
        if n > FIRST_CHUNK + 1:
            await fetch_range(s, FIRST_CHUNK, min(n - 1, FIRST_CHUNK + CHUNK - 1))
        return True
    except Exception:
        return False


async def resolve_worker(vid: str, fmt: str, client: str) -> dict:
    # Cancelling asyncio cannot stop a running Python thread. Keep its slot occupied
    # until extraction really finishes, and never enqueue unlimited executor work.
    await resolve_slots.acquire()
    try:
        fut = asyncio.get_running_loop().run_in_executor(pool, resolve_sync, vid, fmt, client)
    except BaseException:
        resolve_slots.release()
        raise
    def finished(f):
        resolve_slots.release()
        if not f.cancelled():
            f.exception()
    fut.add_done_callback(finished)
    return await asyncio.shield(fut)


async def resolve_checked(vid: str, fmt: str) -> dict:
    """Bounded hedged race: advance on failure, cancel losers, cap total latency."""
    errors: list[str] = []
    async def one(client: str):
        started = time.monotonic()
        try:
            if client == "innertube":
                if fmt != "aac":
                    return
                s = await resolve_innertube(vid)
            else:
                s = await resolve_worker(vid, fmt, client)
            if not s.get("checked") and not await verify(s):
                raise RuntimeError("403 or incomplete audio probe")
        except Exception as e:
            msg = str(e).replace("ERROR: ", "")
            # «недоступно» запасной клиент (tv и др.) пишет и про нормальные видео — решает только итог по всем
            errors.append(f"{client or 'default'}: {msg}")
            low = msg.lower()
            if "unavailable" not in low and "not available" not in low and "claimed content" not in low:
                ladder.fail(client, msg)
            return
        ladder.ok(client, time.monotonic() - started)
        s["method"] = client
        if client != "innertube":
            s["client"] = client
        return s

    t0 = time.monotonic()
    order = ladder.order()
    if fmt != "aac" and "innertube" in order:
        order.remove("innertube")
    pending = set()
    try:
        while order or pending:
            remaining = RESOLVE_TIMEOUT - (time.monotonic() - t0)
            if remaining <= 0:
                errors.append("resolve deadline exceeded")
                break
            if not pending and order:
                pending.add(asyncio.create_task(one(order.pop(0))))
            hedge = max(STEP, min(1.0, ladder.avg.get("innertube", 0) * 2))
            completed, _ = await asyncio.wait(pending, timeout=min(hedge, remaining), return_when=asyncio.FIRST_COMPLETED)
            for task in completed:
                pending.remove(task)
                s = task.result()
                if s:
                    log.info("race %s: %s %.2fs", vid, s.get("method") or "default", time.monotonic() - t0)
                    return s
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
    return web.json_response({"error": msg}, status=404 if ("unavailable" in low or "not available" in low) and "format" not in low else 502)


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
    global session, yt_session
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


async def on_stop(app: web.Application):
    worker = app.get("warm_worker")
    if worker:
        worker.cancel()
        await asyncio.gather(worker, return_exceptions=True)
    if yt_session and yt_session is not session:
        await yt_session.close()
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
            async with yt_session.get(f"{s['url']}{sep}range={a}-{b}", headers=s["headers"], timeout=ClientTimeout(total=20, sock_read=10)) as r:
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
                        state["s"] = await get_stream(vid, fmt, fresh=True)
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
            return p
    return None


def prep_cleanup():
    try:
        files = sorted((p for p in PREP.iterdir() if p.is_file() and p.suffix in (".m4a", ".webm", ".mp4") and ".part." not in p.name), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        for p in files:
            if total <= PREP_MAX:
                break
            total -= p.stat().st_size
            p.unlink(missing_ok=True)
    except Exception as e:
        log.warning("очистка готовых файлов: %s", e)


async def _prepare(vid: str, fmt: str) -> Path:
    async with prep_sem:
        t0 = time.monotonic()
        s = await get_stream(vid, fmt)
        if not s.get("contentLength"):
            await verify(s)
        total = int(s.get("contentLength") or 0)
        if not total:
            raise RuntimeError("нет размера файла")
        get = range_getter(vid, fmt, s)
        spans, pos = [], 0
        while pos < total:
            spans.append((pos, min(pos + CHUNK - 1, total - 1)))
            pos += CHUNK
        parts = await asyncio.gather(*(get(x) for x in spans))
        t1 = time.monotonic()
        PREP.mkdir(parents=True, exist_ok=True)
        mime = s.get("mime") or "audio/mp4"
        ext = ".webm" if "webm" in mime else ".m4a"
        raw = PREP / f"{fmt}-{vid}.raw"
        out = PREP / f"{fmt}-{vid}{ext}"
        raw.write_bytes(b"".join(parts))
        if FFMPEG and ext == ".m4a":
            tmp = PREP / f"{fmt}-{vid}.part.m4a"
            proc = await asyncio.create_subprocess_exec(
                FFMPEG, "-y", "-v", "error", "-i", str(raw), "-map", "0:a:0", "-vn", "-c:a", "copy",
                "-movflags", "+faststart", "-f", "ipod", str(tmp),
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
            _, err = await proc.communicate()
            if proc.returncode == 0 and tmp.exists() and tmp.stat().st_size > 10000:
                tmp.replace(out)
                raw.unlink(missing_ok=True)
            else:
                log.warning("ffmpeg %s: %s — отдаю как есть", vid, (err or b"").decode(errors="ignore")[:200])
                tmp.unlink(missing_ok=True)
                raw.replace(out)
        else:
            raw.replace(out)
        log.info("prepare %s: %d КБ, скачано за %.1fs, всего %.1fs", vid, total // 1024, t1 - t0, time.monotonic() - t0)
        prep_cleanup()
        return out


async def prepared(vid: str, fmt: str) -> Path:
    """Готовый файл трека: с диска, а если нет — качаем (один раз на трек, сколько бы запросов ни пришло)."""
    if not valid_vid(vid):
        raise ValueError("bad video id")
    fmt = fmt if fmt in FORMATS else "auto"
    p = prep_find(vid, fmt)
    if p:
        try:
            os.utime(p)
        except OSError:
            pass
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
        path = await asyncio.wait_for(prepared(vid, fmt), timeout=25)
        r = web.FileResponse(path, headers={"Content-Type": "audio/webm" if path.suffix == ".webm" else "audio/mp4",
                                            "Cache-Control": "no-store",
                                            "X-Lull-Cache": "hit" if cached else "miss",
                                            "Server-Timing": f"prepare;dur={(time.monotonic() - started) * 1000:.1f}"})
        return cors(request, r)
    except Exception as e:
        log.warning("готовый файл %s не получился (%s) — отдаю потоком", vid, str(e)[:200])
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
