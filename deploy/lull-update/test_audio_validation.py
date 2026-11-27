"""Small generated audio fixtures only; no network or production catalogue."""
import pathlib
import shutil
import subprocess
import tempfile
import unittest
from audio_validation import validate_audio


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'ffmpeg and ffprobe required')
class AudioValidationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.folder.name) / 'fixture.m4a'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac', str(self.path)], check=True)

    def tearDown(self):
        self.folder.cleanup()

    async def test_complete_aac_and_rounding_tolerance(self):
        self.assertAlmostEqual(await validate_audio(self.path, 2, 'aac'), 2, delta=.1)

    async def test_short_recording_is_not_accepted_as_a_complete_song(self):
        with self.assertRaisesRegex(RuntimeError, 'Incomplete audio duration'):
            await validate_audio(self.path, 160, 'aac')

    async def test_missing_moov_and_wrong_codec_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'incompatible'):
            await validate_audio(self.path, 2, 'opus')
        self.path.write_bytes(self.path.read_bytes()[:100])
        with self.assertRaisesRegex(RuntimeError, 'Invalid audio container'):
            await validate_audio(self.path)


if __name__ == '__main__':
    unittest.main()
