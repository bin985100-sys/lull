import asyncio
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from test_server import s, VID


class SourceRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_corrupt_cached_container_is_evicted_and_replaced_once(self):
        with tempfile.TemporaryDirectory() as folder:
            fixture = Path(folder) / 'valid.m4a'
            subprocess.run([s.FFMPEG, '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=2', '-c:a', 'aac', str(fixture)], check=True)
            good = fixture.read_bytes()
            bad = b'broken-container' * 2000
            key = f'aac:{VID}'
            broken = {'url': 'https://fixture.invalid/bad', 'contentLength': len(bad), 'mime': 'audio/mp4', 'durationSec': 2, 'method': 'regional'}
            valid = {'url': 'https://fixture.invalid/good', 'contentLength': len(good), 'mime': 'audio/mp4', 'durationSec': 2}
            s.cache[key] = (s.time.time() + 60, broken)
            calls = []

            async def stream(*args):
                if calls:
                    self.assertIn('regional', s.rejected_audio_methods.get())
                selected = s.cache[key][1] if key in s.cache else valid
                calls.append(selected['url'])
                s.verified_audio[selected['url']] = bad if selected is broken else good
                return selected

            with patch.object(s, 'PREP', Path(folder) / 'prep'), patch.object(s, 'get_stream', stream):
                result = await s._prepare(VID, 'aac')
            self.assertEqual(calls, [broken['url'], valid['url']])
            self.assertTrue(result.is_file())
            self.assertNotIn(key, s.cache)
            self.assertFalse(s.rejected_audio_methods.get())

    async def test_one_age_restricted_upload_does_not_disable_audio_routes_globally(self):
        async def restricted(*args):
            raise RuntimeError('Sign in to confirm your age. This video may be inappropriate for some users.')
        with patch.object(s.ladder, 'order', return_value=['fixture']), patch.object(s, 'API_REGIONAL', ''), patch.object(s, 'YT_FALLBACK_PROXY', ''), patch.object(s, 'resolve_worker', restricted), patch.object(s.ladder, 'fail') as fail:
            with self.assertRaises(RuntimeError):
                await s.resolve_checked(VID, 'aac')
        fail.assert_not_called()

    async def test_repeated_corruption_is_bounded_to_two_attempts(self):
        with tempfile.TemporaryDirectory() as folder:
            calls = 0

            async def stream(*args):
                nonlocal calls
                calls += 1
                s.verified_audio['https://fixture.invalid/bad'] = b'broken' * 3000
                return {'url': 'https://fixture.invalid/bad', 'contentLength': 18000, 'mime': 'audio/mp4'}

            with patch.object(s, 'PREP', Path(folder)), patch.object(s, 'get_stream', stream):
                with self.assertRaises(s.AudioVersionChanged):
                    await asyncio.wait_for(s._prepare(VID, 'aac'), 10)
            self.assertEqual(calls, 2)
            self.assertFalse(list(Path(folder).glob('*.m4a')))


if __name__ == '__main__':
    unittest.main()
