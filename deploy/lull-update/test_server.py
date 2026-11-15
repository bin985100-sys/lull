"""Offline regression tests. Never use production data/cookies or YouTube."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

tmp = tempfile.TemporaryDirectory()
os.environ['LULL_DATA'] = tmp.name
os.environ['LULL_YT_COOKIES'] = str(Path(tmp.name) / 'absent')
spec = importlib.util.spec_from_file_location('relay', Path(__file__).with_name('server.py'))
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
VID = 'dQw4w9WgXcQ'


class RelayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        s.cache.clear(); s.inflight.clear(); s.prep_inflight.clear()
        s.ladder = s.Ladder()

    async def test_verified_frame_rejects_partial_and_extra_audio(self):
        metadata = json.dumps({"size": 7, "url": "https://example.invalid/audio"}).encode()
        header = len(metadata).to_bytes(4, "big") + metadata
        def reader(data):
            stream = asyncio.StreamReader()
            stream.feed_data(header + data)
            stream.feed_eof()
            return stream
        _, audio = await s.read_audio_frame(reader(b"1234567"))
        self.assertEqual(audio, b"1234567")
        with self.assertRaises(asyncio.IncompleteReadError):
            await s.read_audio_frame(reader(b"12"))
        with self.assertRaises(ValueError):
            await s.read_audio_frame(reader(b"12345678"))

    async def test_failed_method_advances_without_hedge_delay(self):
        async def worker(vid, fmt, client):
            if client == 'bad': raise RuntimeError('no format')
            return {'checked': True}
        with patch.object(s.ladder, 'order', return_value=['bad', 'good']), patch.object(s, 'resolve_worker', worker), patch.object(s, 'STEP', 1):
            start = time.monotonic()
            self.assertEqual((await s.resolve_checked(VID, 'aac'))['method'], 'good')
            self.assertLess(time.monotonic() - start, .5)

    async def test_slow_loser_is_cancelled_and_race_is_bounded(self):
        running = 0; peak = 0; cancelled = asyncio.Event()
        async def worker(vid, fmt, client):
            nonlocal running, peak
            running += 1; peak = max(peak, running)
            try:
                if client == 'slow':
                    try: await asyncio.sleep(20)
                    finally: cancelled.set()
                return {'checked': True}
            finally: running -= 1
        with patch.object(s.ladder, 'order', return_value=['slow', 'fast', 'unused']), patch.object(s, 'resolve_worker', worker), patch.object(s, 'STEP', .01):
            result = await s.resolve_checked(VID, 'aac')
        self.assertEqual(result['method'], 'fast')
        self.assertTrue(cancelled.is_set())
        self.assertLessEqual(peak, 2)

    async def test_deadline_cancels_pending_tasks(self):
        async def worker(*args): await asyncio.sleep(20)
        with patch.object(s.ladder, 'order', return_value=['slow']), patch.object(s, 'resolve_worker', worker), patch.object(s, 'RESOLVE_TIMEOUT', .02):
            with self.assertRaisesRegex(RuntimeError, 'deadline'):
                await s.resolve_checked(VID, 'aac')

    async def test_cancelled_waiter_does_not_cancel_shared_resolution(self):
        entered = asyncio.Event(); release = asyncio.Event(); calls = 0
        async def resolve(*args):
            nonlocal calls
            calls += 1; entered.set(); await release.wait()
            return {'url': 'https://example.invalid/audio'}
        with patch.object(s, 'resolve_checked', resolve):
            first = asyncio.create_task(s.get_stream(VID, 'aac'))
            await entered.wait()
            second = asyncio.create_task(s.get_stream(VID, 'aac'))
            await asyncio.sleep(0)
            first.cancel()
            with self.assertRaises(asyncio.CancelledError): await first
            self.assertIn('aac:' + VID, s.inflight)
            release.set()
            self.assertIn('url', await second)
            self.assertEqual(calls, 1)
            self.assertFalse(s.inflight)

    async def test_innertube_client_identity_is_preserved(self):
        async def inner(vid): return {'checked': True, 'client': 'TV-SAMSUNG', 'via': 'innertube'}
        with patch.object(s.ladder, 'order', return_value=['innertube']), patch.object(s, 'resolve_innertube', inner):
            self.assertEqual((await s.resolve_checked(VID, 'aac'))['client'], 'TV-SAMSUNG')

    async def test_alternate_works_when_innertube_is_paused(self):
        alternate = 'kJQP7kiw5Fk'
        class Reply:
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
            async def json(self): return {'ids': [alternate]}
        class Session:
            def get(self, *args, **kwargs): return Reply()
        async def worker(vid, fmt, client):
            if vid == VID: raise RuntimeError('Video unavailable in your country')
            return {'checked': True, 'url': 'https://example.invalid/audio'}
        with patch.object(s.ladder, 'order', side_effect=lambda: ['mweb']), patch.object(s, 'resolve_worker', worker), patch.object(s, 'session', Session()):
            found = await s.resolve_checked(VID, 'aac')
        self.assertEqual(found['mediaId'], alternate)
        self.assertEqual(found['method'], 'mweb')

    async def test_alternate_keeps_the_same_deadline(self):
        class Reply:
            async def __aenter__(self): await asyncio.sleep(20)
            async def __aexit__(self, *args): pass
        class Session:
            def get(self, *args, **kwargs): return Reply()
        async def worker(*args): raise RuntimeError('Video unavailable')
        with patch.object(s.ladder, 'order', return_value=['mweb']), patch.object(s, 'resolve_worker', worker), patch.object(s, 'session', Session()), patch.object(s, 'RESOLVE_TIMEOUT', .03):
            start = time.monotonic()
            with self.assertRaisesRegex(RuntimeError, 'deadline'):
                await s.resolve_checked(VID, 'aac')
            self.assertLess(time.monotonic() - start, .2)

    async def test_alternate_does_not_stop_after_three_region_blocked_uploads(self):
        candidates = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd']
        class Reply:
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
            async def json(self): return {'ids': candidates}
        class Session:
            def get(self, *args, **kwargs): return Reply()
        async def worker(vid, fmt, client):
            if vid != candidates[-1]: raise RuntimeError('Video unavailable in your country')
            return {'checked': True}
        with patch.object(s.ladder, 'order', side_effect=lambda: ['mweb']), patch.object(s, 'resolve_worker', worker), patch.object(s, 'session', Session()):
            self.assertEqual((await s.resolve_checked(VID, 'aac'))['mediaId'], candidates[-1])

    async def test_partial_file_is_not_ready_or_evicted(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(s, 'PREP', Path(folder)), patch.object(s, 'PREP_MAX', 0):
            part = Path(folder) / f'aac-{VID}.part.m4a'; part.write_bytes(b'partial')
            self.assertIsNone(s.prep_find(VID, 'aac'))
            s.prep_cleanup()
            self.assertTrue(part.exists())
            ready = Path(folder) / f'aac-{VID}.m4a'; ready.write_bytes(b'complete')
            self.assertEqual(s.prep_find(VID, 'aac'), ready)

    async def test_invalid_id_cannot_access_files(self):
        with self.assertRaises(ValueError): await s.prepared('../escape', 'aac')
        self.assertFalse(s.valid_vid('*'))

    async def test_forbidden_method_gets_cooldown(self):
        await s.stream_forbidden({'method': 'mweb'})
        self.assertNotIn('mweb', s.ladder.order())


if __name__ == '__main__':
    unittest.main()
