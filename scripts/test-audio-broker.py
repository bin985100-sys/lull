import asyncio
import importlib.util
from pathlib import Path
import tempfile
import unittest
from aiohttp import web
from aiohttp.test_utils import TestServer, TestClient
from concurrent.futures import ThreadPoolExecutor

spec = importlib.util.spec_from_file_location('audio_broker', Path(__file__).resolve().parents[1] / 'relay/audio_broker.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BrokerTests(unittest.IsolatedAsyncioTestCase):
    async def test_alternate_wins_once_and_late_primary_cannot_replace_it(self):
        with tempfile.TemporaryDirectory() as folder, ThreadPoolExecutor(2) as pool:
            audio = Path(folder) / 'ready.mp3'
            audio.write_bytes(b'audio-data')
            calls = []
            async def primary(*args):
                calls.append('primary')
                await asyncio.sleep(.3)
                return {'url': 'https://unused.invalid', 'mime': 'audio/mp4'}
            def search(query):
                calls.append('search')
                return {'entries': [{'url': 'https://soundcloud.com/artist/example', 'title': 'Artist - Example', 'uploader': 'Artist', 'duration': 180}]}
            broker = module.AudioBroker(primary, search, lambda url: audio, pool)
            hint = {'title': 'Example', 'artist': 'Artist', 'duration': 180}
            a, b = await asyncio.gather(broker.prepare('video-id', 'aac', hint), broker.prepare('video-id', 'aac', hint))
            self.assertIs(a, b)
            self.assertEqual(a['file'], str(audio))
            await asyncio.sleep(.35)
            self.assertIs(await broker.prepare('video-id', 'aac', hint), a)
            self.assertEqual(calls.count('primary'), 1)
            self.assertEqual(calls.count('search'), 1)

    async def test_fast_primary_does_not_download_alternate(self):
        with ThreadPoolExecutor(1) as pool:
            async def primary(*args): return {'url': 'https://source.invalid', 'mime': 'audio/mp4'}
            def forbidden(*args): raise AssertionError('Unneeded alternate started')
            broker = module.AudioBroker(primary, forbidden, forbidden, pool)
            result = await broker.prepare('video-id', 'aac', {'title': 'Example', 'artist': 'Artist'})
            self.assertIn('stream', result)
            await asyncio.sleep(.2)

    def test_unrelated_artist_and_preview_are_rejected(self):
        hint = {'title': 'Example', 'artist': 'Original artist', 'duration': 180}
        candidates = [{'url': 'https://soundcloud.com/person/song', 'title': 'Example', 'uploader': 'Another singer', 'duration': 180}, {'url': 'https://soundcloud.com/original/preview', 'title': 'Original artist Example', 'uploader': 'Original artist', 'duration': 30}]
        self.assertIsNone(module.matching_recording(candidates, hint))

    async def test_cancelled_prefetch_does_not_cancel_playback(self):
        with ThreadPoolExecutor(1) as pool:
            async def primary(*args):
                await asyncio.sleep(.05)
                return {'url': 'https://source.invalid', 'mime': 'audio/mp4'}
            broker = module.AudioBroker(primary, lambda q: {}, lambda url: None, pool)
            first = asyncio.create_task(broker.prepare('video-id', 'aac'))
            second = asyncio.create_task(broker.prepare('video-id', 'aac'))
            await asyncio.sleep(.01)
            first.cancel()
            with self.assertRaises(asyncio.CancelledError): await first
            self.assertIn('stream', await second)

    async def test_prepared_file_serves_consistent_ranges_and_cors(self):
        with tempfile.TemporaryDirectory() as folder, ThreadPoolExecutor(1) as pool:
            audio = Path(folder) / 'ready.mp3'
            audio.write_bytes(bytes(range(100)))
            async def primary(*args): raise RuntimeError('Primary unavailable')
            def search(query): return {'entries': [{'url': 'https://soundcloud.com/artist/example', 'title': 'Artist Example', 'uploader': 'Artist', 'duration': 180}]}
            def cors(request, response):
                if request.headers.get('Origin') == 'https://app.lull.website': response.headers['Access-Control-Allow-Origin'] = 'https://app.lull.website'
                return response
            @web.middleware
            async def guard(request, handler): return cors(request, await handler(request))
            app = web.Application(middlewares=[guard])
            module.install_audio_broker(app, primary, search, lambda url: audio, pool, lambda: None, cors)
            async with TestClient(TestServer(app)) as client:
                async with client.get('/api/prepare/abcdefghijk?t=Example&a=Artist&d=180') as response:
                    self.assertEqual((await response.json())['contentLength'], 100)
                for start, end in ((0, 3), (4, 9)):
                    async with client.get('/api/stream/abcdefghijk', headers={'Range': f'bytes={start}-{end}', 'Origin': 'https://app.lull.website'}) as response:
                        self.assertEqual(response.status, 206)
                        self.assertEqual(await response.read(), bytes(range(start, end + 1)))
                        self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'https://app.lull.website')

if __name__ == '__main__': unittest.main()
