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
import shutil
import socket
import ssl
import subprocess
import threading
import time
from collections import OrderedDict, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

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
    "soundcloud.com", "sndcdn.com", "lrclib.net", "betterlyrics.org", "better-lyrics.boidu.dev",
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
pool = ThreadPoolExecutor(max_workers=int(os.environ.get("LULL_WORKERS", "6")))
cache: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()
inflight: dict[str, asyncio.Future] = {}

FORMATS = {
    "low": "wa[protocol=https]/wa",
    "aac": "ba[protocol=https][ext=m4a]/ba[protocol=https]/ba",
    "auto": "ba[protocol=https][ext=webm]/ba[protocol=https]/ba",
}
_local = threading.local()


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
        _ydl[k] = yt_dlp.YoutubeDL({
            "quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True,
            "format": FORMATS[fmt], "socket_timeout": 10, "cachedir": str(DATA / "yt-dlp-cache"),
            "source_address": "0.0.0.0", "extractor_args": {"youtube": yt_args},
            "js_runtimes": {"node": {}},
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


FALLBACK_CLIENTS = ("", "tv", "web_safari", "mweb", "web_embedded")


def video_unavailable(message: str) -> bool:
    text = message.lower()
    if "requested format" in text and "not available" in text:
        return False
    if "no video formats found" in text:
        return False
    return "unavailable" in text or "not available" in text


async def verify(s: dict) -> bool:
    """Проверяем, что ссылка реально отдаёт звук отсюда (первые байты), и узнаём размер файла."""
    assert session is not None
    try:
        async with session.get(s["url"], headers={**s["headers"], "Range": "bytes=0-1"}) as r:
            if r.status not in (200, 206):
                return False
            total = r.headers.get("Content-Range", "").rpartition("/")[2]
            if total.isdigit():
                s["contentLength"] = int(total)
            return True
    except Exception:
        return False


async def resolve_checked(vid: str, fmt: str) -> dict:
    loop = asyncio.get_running_loop()
    errors = []
    for client in FALLBACK_CLIENTS:
        try:
            s = await loop.run_in_executor(pool, resolve_sync, vid, fmt, client)
        except Exception as e:
            msg = str(e).replace("ERROR: ", "")
            if video_unavailable(msg):
                raise
            errors.append(msg)
            continue
        if await verify(s):
            return s
        log.warning("resolve %s %s: ссылка отдаёт 403, пробую другой клиент", vid, client or "default")
        errors.append(f"{client or 'default'}: 403")
    raise RuntimeError("; ".join(errors) or "no stream")


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
        inflight[key] = asyncio.ensure_future(resolve_checked(vid, fmt))
    try:
        s = await inflight[key]
    finally:
        inflight.pop(key, None)
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
    return web.json_response({"error": msg}, status=404 if video_unavailable(msg) else 502)


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


def _sc_download_raw(url: str) -> Path:
    name = hashlib.sha1(url.encode()).hexdigest()
    for p in SC_DIR.glob(name + ".*"):
        if p.suffix.lower() in {".mp3", ".m4a", ".mp4", ".opus", ".ogg", ".webm", ".aac"} and p.stat().st_size:
            return p
    opts = {"quiet": True, "no_warnings": True, "noplaylist": True, "socket_timeout": 10,
            "format": "http_mp3_1_0/http_mp3/bestaudio[protocol^=http]/bestaudio",
            "outtmpl": str(SC_DIR / (name + ".%(ext)s"))}
    with yt_dlp.YoutubeDL(opts) as y:
        y.download([url])
    files = [p for p in SC_DIR.glob(name + ".*") if p.suffix.lower() in {".mp3", ".m4a", ".mp4", ".opus", ".ogg", ".webm", ".aac"} and p.stat().st_size]
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


def playable_sc_file(source: Path) -> Path:
    """AAC must have a seek index at the front. Fragmented M4A made Chromium
    scan most of the song through repeated range requests before starting.
    Remux once, without re-encoding the audio, and retain the original cache.
    """
    if source.suffix.lower() not in {".m4a", ".mp4"} or source.name.endswith(".faststart.m4a"):
        return source
    target = source.with_name(source.stem + ".faststart.m4a")
    if target.exists() and target.stat().st_size:
        return target
    ffmpeg = os.environ.get("LULL_FFMPEG") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to prepare streaming AAC audio")
    temporary = target.with_suffix(".tmp")
    try:
        subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                        "-i", str(source), "-map", "0:a:0", "-vn", "-c:a", "copy",
                        "-movflags", "+faststart", "-f", "ipod", str(temporary)],
                       check=True, timeout=30, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        temporary.replace(target)
        return target
    finally:
        temporary.unlink(missing_ok=True)


_sc_file_locks = defaultdict(threading.Lock)


def sc_download_sync(url: str) -> Path:
    # Concurrent range requests must not see half-downloaded or half-remuxed files.
    name = hashlib.sha1(url.encode()).hexdigest()
    with _sc_file_locks[name]:
        return playable_sc_file(_sc_download_raw(url))


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
    return web.json_response({"ok": True, "yt_dlp": yt_dlp.version.__version__, "cached": len(cache), "audio_container": "faststart-v1"})


async def on_start(app: web.Application):
    global session
    session = ClientSession(timeout=ClientTimeout(total=None, sock_connect=10, sock_read=60), connector=TCPConnector(limit=0, ttl_dns_cache=300, family=socket.AF_INET), auto_decompress=False)


async def on_stop(app: web.Application):
    if session:
        await session.close()



# ---------- публичный API для веб-версии и телефона ----------
NODE_API = os.environ.get("LULL_NODE_API", "http://127.0.0.1:8787")


async def api_stream(request: web.Request) -> web.StreamResponse:
    """Звук трека с поддержкой перемотки (Range). Браузер не может открыть ссылку YouTube сам:
    она привязана к адресу сервера и закрыта CORS, поэтому отдаём её отсюда."""
    vid = request.match_info["vid"]
    fmt = request.query.get("q", "aac")
    assert session is not None
    for attempt in range(2):
        try:
            s = await get_stream(vid, fmt, fresh=attempt > 0)
        except Exception as e:
            return stream_error(e)
        headers = dict(s["headers"])
        rng = request.headers.get("Range")
        if rng:
            headers["Range"] = rng
        try:
            up = await session.get(s["url"], headers=headers)
        except Exception as e:
            return web.json_response({"error": f"upstream: {e}"}, status=502)
        if up.status in (403, 410) and attempt == 0:
            up.release()
            continue
        resp = web.StreamResponse(status=up.status)
        for k in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"):
            if k in up.headers:
                resp.headers[k] = up.headers[k]
        resp.headers["Content-Type"] = s.get("mime") or up.headers.get("Content-Type", "audio/mp4")
        resp.headers["Cache-Control"] = "no-store"
        cors(request, resp)
        await resp.prepare(request)
        try:
            async for chunk in up.content.iter_chunked(64 * 1024):
                await resp.write(chunk)
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        finally:
            up.release()
        return resp
    return web.json_response({"error": "stream forbidden"}, status=502)


async def api_proxy(request: web.Request) -> web.StreamResponse:
    """Каталог (главная, поиск, артисты, альбомы, тексты, обложки) — Node-сервис на этом же сервере."""
    assert session is not None
    body = await request.read() if request.can_read_body else None
    headers = {"Content-Type": request.headers.get("Content-Type", "application/json")}
    try:
        up = await session.request(request.method, NODE_API + request.path_qs, data=body, headers=headers)
    except Exception as e:
        return web.json_response({"error": f"api: {e}"}, status=502)
    resp = web.StreamResponse(status=up.status)
    for k in ("Content-Type", "Content-Length", "Cache-Control", "Content-Encoding"):
        if k in up.headers:
            resp.headers[k] = up.headers[k]
    # Streaming headers must be complete before prepare() sends them to the client.
    cors(request, resp)
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
    try:
        from audio_broker import install_audio_broker
    except ModuleNotFoundError as error:
        if error.name != 'audio_broker':
            raise
        app.router.add_get("/api/stream/{vid}", api_stream)
    else:
        install_audio_broker(app, get_stream, _sc_search_sync, sc_download_sync, pool, lambda: session, cors)
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
