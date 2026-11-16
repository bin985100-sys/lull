"""Offline regression tests. Never use production data/cookies or YouTube."""
import asyncio
import importlib.util
import json
import os
import subprocess
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

tmp = tempfile.TemporaryDirectory()
os.environ['LULL_DATA'] = tmp.name
os.environ['LULL_YT_COOKIES'] = str(Path(tmp.name) / 'absent')
os.environ['LULL_CATALOG_WARM'] = '0'
spec = importlib.util.spec_from_file_location('relay', Path(__file__).with_name('server.py'))
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
VID = 'dQw4w9WgXcQ'


class RelayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        s.cache.clear(); s.inflight.clear(); s.prep_inflight.clear()
        s.verified_audio.clear()
        s.ladder = s.Ladder()
        s.warm_queue.clear();s.warm_event.clear()

    def test_verified_audio_cache_is_bounded_by_bytes_not_only_file_count(self):
        with patch.object(s,'MAX_MUXED_BYTES',8):
            s.remember_verified('old',b'12345');s.remember_verified('new',b'67890')
        self.assertEqual(list(s.verified_audio),['new'])

    async def test_complete_progressive_frame_preserves_large_file_and_rejects_oversize(self):
        async def frame(size):
            reader=asyncio.StreamReader();meta=json.dumps({'url':'https://fixture.invalid/file','size':size,'complete':True}).encode()
            reader.feed_data(len(meta).to_bytes(4,'big')+meta+b'a'*size);reader.feed_eof()
            return await s.read_audio_frame(reader)
        with patch.object(s,'MAX_INLINE',3),patch.object(s,'MAX_MUXED_BYTES',8):
            meta,data=await frame(7);self.assertEqual(len(data),7)
            with self.assertRaisesRegex(ValueError,'bound'):await frame(9)

    def test_verified_speed_beats_more_recent_slow_exit(self):
        s.ladder.ok('innertube',1.2)
        s.ladder.ok('regional_ytdlp',8)
        self.assertEqual(s.ladder.rank(['regional_ytdlp','innertube'])[0],'innertube')

    def test_restart_preserves_only_fresh_verified_route_timings(self):
        with tempfile.TemporaryDirectory(dir=tmp.name) as root:
            path=Path(root)/'routes.json'
            before=s.Ladder(path);before.ok('regional_ytdlp',2.5)
            restored=s.Ladder(path)
            self.assertEqual(restored.rank(['innertube','regional_ytdlp'])[0],'regional_ytdlp')
            text=path.read_text();self.assertNotIn('url',text);self.assertNotIn('proxy',text)
            data=json.loads(text);data['regional_ytdlp']['last_ok']=time.time()-3600
            path.write_text(json.dumps(data));self.assertFalse(s.Ladder(path).last_ok)

    def test_blocked_regional_route_is_not_hedged_until_cooldown(self):
        s.ladder.fail('regional_ytdlp','403')
        self.assertEqual(s.ladder.rank(['regional_ytdlp','innertube']),['innertube'])

    def test_hedge_delay_tracks_leader_with_bounded_head_start(self):
        s.ladder.ok('regional',.8)
        s.ladder.ok('innertube',20)
        self.assertLess(s.ladder.hedge_delay('regional'),s.ladder.hedge_delay('innertube'))
        self.assertLessEqual(s.ladder.hedge_delay('innertube'),1.2)

    async def test_slow_known_ytdlp_does_not_starve_new_fast_regional_api(self):
        s.ladder.ok('regional_ytdlp',8)
        async def slow(*args):await asyncio.sleep(20)
        async def fast(*args):return {'checked':True,'url':'https://fixture.invalid/full'}
        with patch.object(s,'API_REGIONAL','http://fixture'),patch.object(s,'YT_FALLBACK_PROXY','socks5://fixture'),patch.object(s.ladder,'order',return_value=['innertube']),patch.object(s,'resolve_worker',slow),patch.object(s,'resolve_innertube',slow),patch.object(s,'resolve_regional',fast),patch.object(s,'STEP',.01):
            start=time.monotonic()
            self.assertEqual((await s.resolve_checked(VID,'aac'))['method'],'regional')
            self.assertLess(time.monotonic()-start,1.5)

    def test_public_chart_warm_is_bounded_and_coalesces_tracks_only(self):
        snapshot=[{'items':[{'kind':'track','track':{'id':VID}},{'kind':'track','id':VID},{'kind':'artist','id':'aaaaaaaaaaa'}]}]
        with patch.object(s,'prep_find',return_value=None):
            self.assertEqual(s.warm_catalog_snapshot(snapshot),1)
            self.assertEqual(s.warm_catalog_snapshot(snapshot),0)
        self.assertEqual(list(s.warm_queue),['aac:'+VID])
        self.assertTrue(s.warm_queue['aac:'+VID][2])

    def test_ready_chart_file_does_not_trigger_a_new_source_request(self):
        with patch.object(s,'prep_find',return_value=Path('ready.m4a')):
            self.assertEqual(s.warm_catalog_snapshot([{'items':[{'kind':'track','id':VID}]}]),0)
        self.assertFalse(s.warm_queue)

    def test_audio_download_uses_the_same_exit_as_resolution(self):
        primary, fallback = object(), object()
        with patch.object(s, 'yt_session', primary), patch.object(s, 'fallback_yt_session', fallback):
            self.assertIs(s.audio_session({}), primary)
            self.assertIs(s.audio_session({'exit': 'fallback'}), fallback)

    async def test_forbidden_audio_falls_back_to_same_video_progressive_format(self):
        async def worker(*args):
            return {'url':'https://fixture.invalid/audio','exit':'fallback','alternateFormats':[{'url':'https://fixture.invalid/muxed','formatId':'18','muxed':True}]}
        async def verify(stream):
            self.assertEqual(stream['exit'],'fallback')
            stream['contentLength']=1024
            return stream['url'].endswith('/muxed')
        with patch.object(s.ladder,'order',return_value=['fixture']), patch.object(s,'resolve_worker',worker), patch.object(s,'verify',verify):
            result=await s.resolve_checked(VID,'aac')
        self.assertEqual(result['formatId'],'18')
        self.assertNotIn('alternateFormats',result)

    async def test_newly_issued_url_gets_one_bounded_retry_without_extracting_again(self):
        calls=0; extractions=0
        async def worker(*args):
            nonlocal extractions
            extractions+=1
            return {'url':'https://fixture.invalid/audio','retryAfter':time.monotonic()+.02}
        async def verify(stream):
            nonlocal calls
            calls+=1
            stream['_probe403']=True
            return calls==2
        with patch.object(s.ladder,'order',return_value=['fixture']), patch.object(s,'resolve_worker',worker), patch.object(s,'verify',verify):
            start=time.monotonic();await s.resolve_checked(VID,'aac')
        self.assertEqual(extractions,1);self.assertEqual(calls,2)
        self.assertLess(time.monotonic()-start,.2)

    async def test_declared_source_availability_extends_only_that_race(self):
        ready=time.time()+.04
        async def worker(*args):return {'url':'https://fixture.invalid/audio','availableAt':ready}
        async def verify(stream):
            self.assertGreaterEqual(time.time(),ready)
            return True
        with patch.object(s.ladder,'order',return_value=['fixture']),patch.object(s,'resolve_worker',worker),patch.object(s,'verify',verify),patch.object(s,'RESOLVE_TIMEOUT',.01):
            self.assertEqual((await s.resolve_checked(VID,'aac'))['method'],'fixture')

    async def test_prepared_cache_access_preserves_range_etag_timestamp(self):
        with tempfile.TemporaryDirectory(dir=tmp.name) as root,patch.object(s,'PREP',Path(root)):
            path=Path(root)/f'aac-{VID}.m4a';path.write_bytes(b'complete')
            modified=path.stat().st_mtime_ns
            os.utime(path,ns=(1,modified))
            self.assertEqual(s.prep_find(VID,'aac'),path)
            self.assertEqual(await s.prepared(VID,'aac'),path)
            self.assertEqual(path.stat().st_mtime_ns,modified)
            self.assertGreater(path.stat().st_atime_ns,1)

    def test_cache_eviction_uses_actual_access_not_creation_order(self):
        with tempfile.TemporaryDirectory(dir=tmp.name) as root,patch.object(s,'PREP',Path(root)),patch.object(s,'PREP_MAX',10):
            cold=Path(root)/'cold.m4a';hot=Path(root)/'hot.m4a'
            cold.write_bytes(b'1234567890');hot.write_bytes(b'1234567890')
            os.utime(cold,ns=(1,200));os.utime(hot,ns=(200,1))
            s.prep_cleanup()
            self.assertFalse(cold.exists());self.assertTrue(hot.exists())

    async def test_version_change_restarts_whole_preparation_once(self):
        calls=0
        async def prepare(*args):
            nonlocal calls
            calls+=1
            if calls==1:raise s.AudioVersionChanged('changed')
            return Path('complete.m4a')
        with patch.object(s,'_prepare_once',prepare):
            self.assertEqual(await s._prepare(VID,'aac'),Path('complete.m4a'))
        self.assertEqual(calls,2)

    async def test_failed_chunk_cancels_old_downloads_before_restart(self):
        cancelled=asyncio.Event()
        async def get(span):
            if span==0:
                await asyncio.sleep(.01)
                raise s.AudioVersionChanged('changed')
            try:await asyncio.sleep(30)
            finally:cancelled.set()
        with self.assertRaises(s.AudioVersionChanged):
            await s.read_chunks(get,[0,1])
        self.assertTrue(cancelled.is_set())

    async def test_whole_download_checks_length_and_removes_partial_files(self):
        class Content:
            async def iter_chunked(self,size):
                yield b'abc'
        class Reply:
            status=200; content=Content()
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
        class Session:
            def get(self,url,**kwargs):
                return Reply()
        with tempfile.TemporaryDirectory(dir=tmp.name) as root, patch.object(s,'audio_session',return_value=Session()):
            path=Path(root)/'audio.raw'
            await s.download_whole({'url':'https://fixture.invalid/file','headers':{}},path,3)
            self.assertEqual(path.read_bytes(),b'abc')
            with self.assertRaisesRegex(RuntimeError,'incomplete'):
                await s.download_whole({'url':'https://fixture.invalid/file','headers':{}},path,4)
            self.assertFalse(path.exists())

    async def test_large_range_download_writes_in_order_with_four_bounded_workers(self):
        active=0;peak=0;data=bytes(range(30))
        async def get(span):
            nonlocal active,peak
            active+=1;peak=max(peak,active)
            try:
                await asyncio.sleep(.001*(span[0]%3))
                return data[span[0]:span[1]+1]
            finally:active-=1
        with tempfile.TemporaryDirectory(dir=tmp.name) as root,patch.object(s,'CHUNK',3):
            path=Path(root)/'large.raw'
            await s.download_ranges(get,path,data[:2],len(data))
            self.assertEqual(path.read_bytes(),data)
            self.assertLessEqual(peak,4)

    @unittest.skipUnless(s.FFMPEG, 'ffmpeg required')
    async def test_aac_request_converts_opus_into_real_aac_m4a(self):
        with tempfile.TemporaryDirectory(dir=tmp.name) as root:
            source=Path(root)/'source.webm'
            subprocess.run([s.FFMPEG,'-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=2','-c:a','libopus',str(source)],check=True)
            data=source.read_bytes();url='https://fixture.invalid/opus'
            s.verified_audio[url]=data
            async def stream(*args):
                return {'url':url,'headers':{},'mime':'audio/webm','contentLength':len(data)}
            with patch.object(s,'PREP',Path(root)/'prep'), patch.object(s,'get_stream',stream):
                result=await s._prepare_once(VID,'aac')
            self.assertEqual(result.suffix,'.m4a')
            codecs=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_name','-of','json',str(result)]))
            self.assertEqual(codecs['streams'][0]['codec_name'],'aac')

    def test_progressive_fallback_is_taken_from_original_extraction(self):
        info={'url':'https://fixture.invalid/audio','format_id':'140','ext':'m4a','duration':88,'formats':[{'url':'https://fixture.invalid/muxed','format_id':'18','ext':'mp4'}]}
        class Extractor:
            def extract_info(self,*args,**kwargs): return info
        with patch.object(s,'ydl_for',return_value=Extractor()):
            result=s.resolve_sync(VID,'aac')
        self.assertEqual(result['alternateFormats'][0]['formatId'],'18')
        self.assertTrue(result['alternateFormats'][0]['muxed'])

    async def test_oversized_progressive_fallback_is_rejected(self):
        async def worker(*args):
            return {'url':'https://fixture.invalid/audio','alternateFormats':[{'url':'https://fixture.invalid/muxed','formatId':'18','muxed':True}]}
        async def verify(stream):
            stream['contentLength']=s.MAX_MUXED_BYTES+1
            return stream['url'].endswith('/muxed')
        with patch.object(s.ladder,'order',return_value=['fixture']), patch.object(s,'resolve_worker',worker), patch.object(s,'verify',verify):
            with self.assertRaisesRegex(RuntimeError,'incomplete audio probe'):
                await s.resolve_checked(VID,'aac')

    async def test_regional_ytdlp_binds_verification_to_its_proxy(self):
        async def worker(vid, fmt, client, proxy):
            self.assertEqual(client, 'mweb')
            self.assertEqual(proxy, 'socks5://fallback.invalid:1234')
            return {'url': 'https://example.invalid/audio'}
        async def verify(stream):
            self.assertEqual(stream['exit'], 'fallback')
            return True
        with patch.object(s, 'YT_FALLBACK_PROXY', 'socks5://fallback.invalid:1234'), patch.object(s, 'API_REGIONAL', ''), patch.object(s.ladder, 'order', return_value=[]), patch.object(s, 'resolve_worker', worker), patch.object(s, 'verify', verify):
            self.assertEqual((await s.resolve_checked(VID,'aac'))['method'], 'regional_ytdlp')

    def test_worker_keeps_only_three_extractor_instances(self):
        with patch.object(s._local, 'ydl', {}, create=True), patch.object(s.yt_dlp, 'YoutubeDL', side_effect=lambda opts: object()):
            for client in ['mweb', 'tv', 'web_embedded', 'web_safari']:
                s.ydl_for('aac',client)
            self.assertEqual(len(s._local.ydl),3)

    def test_transient_error_does_not_mark_track_permanently_missing(self):
        self.assertEqual(s.stream_error(RuntimeError('unavailable; regional: 403')).status,502)
        self.assertEqual(s.stream_error(RuntimeError('Video unavailable')).status,404)

    def test_all_paused_methods_stay_paused(self):
        for client in s.FALLBACK_CLIENTS:
            s.ladder.fail(client, 'Sign in to confirm you are not a bot')
        self.assertEqual(s.ladder.order(), [])

    async def test_bot_failure_uses_independent_exit(self):
        calls = []
        async def resolve(vid, regional=''):
            calls.append(regional)
            if not regional:
                raise RuntimeError('Sign in to confirm you are not a bot')
            return {'checked': True}
        with patch.object(s.ladder, 'order', return_value=['innertube']), patch.object(s, 'API_REGIONAL', 'http://fallback'), patch.object(s, 'resolve_innertube', resolve):
            self.assertEqual((await s.resolve_checked(VID, 'aac'))['method'], 'regional')
        self.assertEqual(calls, ['', 'http://fallback'])

    async def test_primary_cooldown_does_not_disable_regional_exit(self):
        async def resolve(vid, regional=''):
            self.assertEqual(regional, 'http://fallback')
            return {'checked': True}
        with patch.object(s.ladder, 'order', return_value=[]), patch.object(s, 'API_REGIONAL', 'http://fallback'), patch.object(s, 'resolve_innertube', resolve):
            self.assertEqual((await s.resolve_checked(VID, 'aac'))['method'], 'regional')

    async def test_failed_exit_does_not_hide_healthy_exit(self):
        async def resolve(vid, base):
            if base.endswith('bad'):
                raise RuntimeError('403')
            await asyncio.sleep(.01)
            return {'checked': True}
        with patch.object(s, 'API_REGIONAL', 'http://bad,http://good'), patch.object(s, 'resolve_innertube', resolve):
            self.assertTrue((await s.resolve_regional(VID))['checked'])

    async def test_regional_failure_is_track_specific(self):
        calls = 0
        async def resolve(vid, base=''):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError('403 on 262144')
            return {'checked': True}
        with patch.object(s, 'API_REGIONAL', 'http://good'), patch.object(s.ladder, 'order', return_value=[]), patch.object(s, 'resolve_innertube', resolve):
            with self.assertRaises(RuntimeError):
                await s.resolve_checked(VID, 'aac')
            self.assertEqual((await s.resolve_checked('aaaaaaaaaaa', 'aac'))['method'], 'regional')

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

    async def test_regional_audio_races_only_after_unavailable_and_preserves_client(self):
        class Reply:
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
            async def json(self): return {'ids': []}
        class Session:
            def get(self, *args, **kwargs): return Reply()
        async def worker(*args): raise RuntimeError('Video unavailable in your country')
        async def inner(vid, base):
            self.assertEqual(base, 'http://region.invalid')
            return {'checked': True, 'client': 'TV-SAMSUNG', 'mediaId': vid}
        with patch.object(s, 'API_REGIONAL', 'http://region.invalid'), patch.object(s.ladder, 'order', side_effect=lambda: ['mweb']), patch.object(s, 'resolve_worker', worker), patch.object(s, 'resolve_innertube', inner), patch.object(s, 'session', Session()):
            result = await s.resolve_checked(VID, 'aac')
        self.assertEqual(result['method'], 'regional')
        self.assertEqual(result['client'], 'TV-SAMSUNG')

    async def test_regional_url_without_full_audio_is_rejected(self):
        class Reply:
            status = 200
            content_type = 'application/json'
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
            async def json(self, **kwargs): return {'url': 'https://example.invalid/audio', 'size': 100}
        class Session:
            def get(self, *args, **kwargs): return Reply()
        with patch.object(s, 'session', Session()):
            with self.assertRaisesRegex(RuntimeError, 'prepared frame'):
                await s.resolve_innertube(VID, 'http://region.invalid')

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
