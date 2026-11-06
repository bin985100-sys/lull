import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: [new URL('./stream-client.ts', import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/, '$1')], bundle: true, platform: 'node', format: 'esm', write: false });
const { streamFetch, TV_VERSION } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
test('TV player context and headers agree; request fields survive', async () => {
  let seen;
  const f = streamFetch(async (...args) => { seen = args; return new Response('{}'); });
  const init = { method:'POST', body:JSON.stringify({videoId:'dQw4w9WgXcQ',context:{client:{clientName:'TVHTML5'}},playbackContext:{signatureTimestamp:123}}) };
  await f('https://www.youtube.com/youtubei/v1/player', init);
  const body = JSON.parse(seen[1].body);
  assert.equal(body.context.client.clientVersion, TV_VERSION);
  assert.equal(body.context.client.deviceMake, 'Samsung');
  assert.equal(seen[1].headers.get('X-Youtube-Client-Version'), TV_VERSION);
  assert.equal(body.videoId, 'dQw4w9WgXcQ');
  assert.equal(body.playbackContext.signatureTimestamp, 123);
  assert.equal(JSON.parse(init.body).context.client.clientVersion, undefined);
});
test('catalog requests pass through unchanged', async () => {
  let seen;
  const f = streamFetch(async (...args) => { seen=args; return new Response('{}'); });
  const init = { body:JSON.stringify({context:{client:{clientName:'TVHTML5'}}}) };
  await f('https://www.youtube.com/youtubei/v1/search',init);
  assert.equal(seen[1],init);
});
