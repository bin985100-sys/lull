"""Measure the real HTTP stream, including full-file decoding. No cache deletion."""
import argparse
import json
import shutil
import subprocess
import tempfile
import time
import urllib.request

p = argparse.ArgumentParser()
p.add_argument('--base', default='http://127.0.0.1:8480')
p.add_argument('--ids', default='RgKAFK5djSk,kJQP7kiw5Fk,dQw4w9WgXcQ,JGwWNGJdvx8')
args = p.parse_args()
for vid in args.ids.split(','):
    for attempt in (1, 2):
        start = time.monotonic()
        try:
            with urllib.request.urlopen(f'{args.base}/api/stream/{vid}?q=aac', timeout=35) as r:
                first = r.read(1)
                ttfb = time.monotonic() - start
                data = first + r.read()
                result = dict(id=vid, attempt=attempt, status=r.status, cache=r.headers.get('X-Lull-Cache'),
                              first_byte_s=round(ttfb, 3), full_s=round(time.monotonic()-start, 3), bytes=len(data),
                              server_timing=r.headers.get('Server-Timing'))
            if attempt == 1 and shutil.which('ffmpeg'):
                with tempfile.NamedTemporaryFile(suffix='.m4a') as f:
                    f.write(data); f.flush()
                    decode = subprocess.run(['ffmpeg', '-v', 'error', '-i', f.name, '-f', 'null', '-'], capture_output=True, timeout=45)
                    result['decode_ok'] = decode.returncode == 0
            print(json.dumps(result), flush=True)
        except Exception as e:
            print(json.dumps(dict(id=vid, attempt=attempt, error=str(e), seconds=round(time.monotonic()-start, 3))), flush=True)
