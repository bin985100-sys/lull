import assert from 'node:assert/strict';
import { selectStream, isVideoUnavailable } from '../electron/stream-selection.ts';

let resolveLate;
const late = new Promise((resolve) => { resolveLate = resolve; });
const winner = { mime: 'audio/webm', contentLength: 100, via: 'relay' };
const commits = [];
assert.equal(await selectStream([Promise.resolve(winner), late], (s) => commits.push(s)), winner);
resolveLate({ mime: 'audio/mp4', contentLength: 200 });
await late;
await Promise.resolve();
assert.deepEqual(commits, [winner], 'A late source must not replace the playing file');

const fallback = { mime: 'audio/mp4' };
assert.equal(await selectStream([Promise.reject(new Error('source failed')), Promise.resolve(fallback)], () => {}), fallback);
let committed = false;
await assert.rejects(selectStream([Promise.reject(new Error('source failed'))], () => { committed = true; }));
assert.equal(committed, false);
assert.equal(isVideoUnavailable('yt-dlp: Requested format is not available. Use --list-formats'), false);
assert.equal(isVideoUnavailable('No video formats found'), false);
assert.equal(isVideoUnavailable('Video unavailable: Private video'), true);
assert.equal(isVideoUnavailable('The page needs to be reloaded'), false);
console.log('PASS: one stable source, fallback handling, and unavailable-video classification.');
