"""One prepared audio choice shared by mobile prefetch and range requests."""
import asyncio
import re
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from aiohttp import web


def normalize(value):
    value = re.sub(r'\([^)]*\)|\[[^]]*\]|official|video|audio|lyrics?|remastered', '', value.casefold())
    return re.sub(r'[^\w]+', ' ', value).strip()


def matching_recording(entries, hint):
    title, artist = normalize(hint.get('title', '')), normalize(hint.get('artist', ''))
    if not title or not artist:
        return None
    duration = float(hint.get('duration') or 0)
    for entry in entries:
        if not entry:
            continue
        name, uploader = normalize(entry.get('title') or ''), normalize(entry.get('uploader') or '')
        seconds = float(entry.get('duration') or 0)
        url = entry.get('webpage_url') or entry.get('url') or ''
        if not url.startswith(('https://soundcloud.com/', 'https://api.soundcloud.com/', 'https://api-v2.soundcloud.com/')):
            continue
        if title in name and (artist in name or artist in uploader or uploader and uploader in artist) and seconds > 40 and (not duration or abs(seconds - duration) <= 15):
            return {**entry, 'url': url}
    return None


class AudioBroker:
    def __init__(self, resolve, search, download, pool, timeout=12):
        self.resolve, self.search, self.download, self.pool = resolve, search, download, pool
        self.timeout = timeout
        self.cache, self.pending, self.hints = {}, {}, {}

    async def prepare(self, video_id, quality, hint=None):
        key = (video_id, quality)
        if hint and hint.get('title'):
            self.hints[key] = hint
            if len(self.hints) > 1000:
                self.hints.pop(next(iter(self.hints)), None)
        cached = self.cache.get(key)
        if cached and cached['until'] > time.time() and ('file' not in cached or Path(cached['file']).is_file()):
            return cached
        if key not in self.pending:
            if len(self.pending) >= 32:
                raise RuntimeError('Audio preparation is busy')
            self.pending[key] = asyncio.create_task(self._choose(key))
            def finished(task):
                if self.pending.get(key) is task:
                    self.pending.pop(key, None)
                if not task.cancelled():
                    task.exception()
            self.pending[key].add_done_callback(finished)
        # A cancelled browser prefetch must not cancel another listener's audio.
        return await asyncio.shield(self.pending[key])

    async def _choose(self, key):
        video_id, quality = key
        async def primary():
            resolution = asyncio.create_task(self.resolve(video_id, quality))
            resolution.add_done_callback(lambda done: None if done.cancelled() else done.exception())
            stream = await asyncio.shield(resolution)
            return {'stream': stream, 'mime': stream.get('mime', 'audio/mp4'), 'size': stream.get('contentLength', 0), 'duration': stream.get('durationSec', 0)}
        async def alternate():
            # Give a foreground request time to attach catalogue hints to prefetch.
            await asyncio.sleep(0.15)
            hint = self.hints.get(key, {})
            if not hint.get('title') or not hint.get('artist'):
                raise RuntimeError('No recording metadata')
            loop = asyncio.get_running_loop()
            found = await loop.run_in_executor(self.pool, self.search, f"{hint['artist']} {hint['title']}")
            pick = matching_recording(found.get('entries') or [], hint)
            if not pick:
                raise RuntimeError('Matching recording not found')
            path = await loop.run_in_executor(self.pool, self.download, pick['url'])
            mime = {'.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.opus': 'audio/ogg', '.ogg': 'audio/ogg'}.get(path.suffix, 'audio/mpeg')
            return {'file': str(path), 'mime': mime, 'size': path.stat().st_size, 'duration': pick.get('duration') or 0}
        tasks = {asyncio.create_task(primary()), asyncio.create_task(alternate())}
        remaining = set(tasks)
        deadline = asyncio.get_running_loop().time() + self.timeout
        try:
            while remaining:
                done, remaining = await asyncio.wait(remaining, timeout=max(0, deadline - asyncio.get_running_loop().time()), return_when=asyncio.FIRST_COMPLETED)
                if not done:
                    raise TimeoutError('Audio preparation timed out')
                for task in done:
                    try:
                        result = task.result()
                    except Exception:
                        continue
                    result['until'] = time.time() + 15 * 60
                    self.cache[key] = result
                    while len(self.cache) > 1000:
                        oldest = next(iter(self.cache))
                        self.cache.pop(oldest, None)
                        self.hints.pop(oldest, None)
                    return result
            raise RuntimeError('No playable recording available')
        finally:
            # The shared primary may warm its cache; unused alternate work stops.
            for task in tasks:
                if task.done():
                    if not task.cancelled(): task.exception()
                else:
                    task.cancel()


def install_audio_broker(app, resolve, search, download, pool, get_session, cors):
    # YouTube extraction must not occupy every worker needed by the alternate.
    fallback_pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix='lull-audio-alternate')
    broker = AudioBroker(resolve, search, download, fallback_pool)
    async def close_workers(_app):
        fallback_pool.shutdown(wait=False, cancel_futures=True)
    app.on_cleanup.append(close_workers)
    def parameters(request):
        video_id = request.match_info['vid']
        if not re.fullmatch(r'[a-zA-Z0-9_-]{11}', video_id):
            raise web.HTTPBadRequest(text='Invalid track identifier')
        quality = request.query.get('q', 'aac')
        quality = quality if quality in ('aac', 'auto', 'low') else 'aac'
        try: duration = max(0, min(86400, float(request.query.get('d', 0))))
        except ValueError: duration = 0
        hint = {'title': request.query.get('t', '')[:240], 'artist': request.query.get('a', '')[:160], 'duration': duration}
        return video_id, quality, hint
    async def prepare(request):
        video_id, quality, hint = parameters(request)
        try:
            chosen = await broker.prepare(video_id, quality, hint)
        except Exception:
            return web.json_response({'error': 'Не удалось подготовить звук. Попробуй другой трек.'}, status=503)
        return web.json_response({'id': video_id, 'mime': chosen['mime'], 'contentLength': chosen['size'], 'durationSec': chosen['duration'], 'bitrate': 0, 'loudnessDb': 0}, headers={'Cache-Control': 'no-store'})
    async def stream(request):
        video_id, quality, hint = parameters(request)
        try:
            chosen = await broker.prepare(video_id, quality, hint)
        except Exception:
            return web.json_response({'error': 'Не удалось подготовить звук. Попробуй другой трек.'}, status=503)
        if 'file' in chosen:
            return web.FileResponse(chosen['file'], headers={'Content-Type': chosen['mime'], 'Cache-Control': 'private, max-age=900'})
        source = chosen['stream']
        headers = dict(source.get('headers') or {})
        if request.headers.get('Range'): headers['Range'] = request.headers['Range']
        try:
            upstream = await get_session().get(source['url'], headers=headers)
        except Exception:
            broker.cache.pop((video_id, quality), None)
            return web.json_response({'error': 'Источник звука не ответил'}, status=502)
        if upstream.status not in (200, 206, 416):
            broker.cache.pop((video_id, quality), None)
            upstream.release()
            return web.json_response({'error': 'Источник звука временно недоступен'}, status=502)
        response = web.StreamResponse(status=upstream.status, headers={key: value for key, value in upstream.headers.items() if key.lower() in ('content-type', 'content-length', 'content-range', 'accept-ranges')})
        cors(request, response)
        await response.prepare(request)
        try:
            async for chunk in upstream.content.iter_chunked(65536):
                await response.write(chunk)
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        finally:
            upstream.release()
        return response
    app.router.add_get('/api/prepare/{vid}', prepare)
    app.router.add_get('/api/stream/{vid}', stream)
    async def health(_request): return web.json_response({'ok': True, 'audio_broker': 'v1'})
    app.router.add_get('/api/audio-health', health)
    return broker
