"""Validate a completed audio container before it enters the public disk cache."""
import asyncio
import json
import shutil

FFPROBE = shutil.which('ffprobe')


async def validate_audio(path, expected_duration=0, expected_codec=None):
    if not FFPROBE:
        raise RuntimeError('Audio validation requires ffprobe')
    process = await asyncio.create_subprocess_exec(
        FFPROBE, '-v', 'error', '-select_streams', 'a:0',
        '-show_entries', 'stream=codec_name,duration:format=duration', '-of', 'json', str(path),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        output, errors = await asyncio.wait_for(process.communicate(), timeout=8)
    except BaseException:
        if process.returncode is None:
            process.kill()
        await process.communicate()
        raise
    if process.returncode or errors:
        raise RuntimeError('Invalid audio container: ' + errors.decode(errors='replace')[:180])
    data = json.loads(output)
    streams = data.get('streams') or []
    if not streams or expected_codec and streams[0].get('codec_name') != expected_codec:
        raise RuntimeError('Missing or incompatible audio stream')
    duration = float(streams[0].get('duration') or data.get('format', {}).get('duration') or 0)
    if not 0 < duration < 48 * 3600:
        raise RuntimeError('Invalid audio duration')
    expected = float(expected_duration or 0)
    if expected > 5 and duration < expected - max(3, expected * .02):
        raise RuntimeError(f'Incomplete audio duration {duration:.2f}/{expected:.2f}')
    return duration
