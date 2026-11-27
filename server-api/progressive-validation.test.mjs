import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('complete progressive audio is accepted; a full HTTP body containing truncated MP4 packets is rejected', { skip: !hasFfmpeg }, async () => {
  const module = process.env.LULL_VALIDATION_MODULE ? await import(pathToFileURL(process.env.LULL_VALIDATION_MODULE).href) : await (async () => {
    const { build } = await import('esbuild');
    const { outputFiles } = await build({ entryPoints: [new URL('./progressive-validation.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')], bundle: true, platform: 'node', format: 'esm', write: false });
    return import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
  })();
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'lull-progressive-test-'));
  try {
    const file = path.join(folder, 'fixture.m4a');
    const generated = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=3', '-c:a', 'aac', '-movflags', '+faststart', file]);
    assert.equal(generated.status, 0);
    const bytes = await fs.readFile(file);
    await module.validateProgressiveAudio(bytes);
    await assert.rejects(module.validateProgressiveAudio(bytes.subarray(0, Math.floor(bytes.length / 2))), /invalid progressive audio/);
    await assert.rejects(module.validateProgressiveAudio(Buffer.from('not an mp4')), /invalid progressive audio/);
  } finally {
    assert(folder.startsWith(path.join(os.tmpdir(), 'lull-progressive-test-')));
    await fs.rm(folder, { recursive: true, force: true });
  }
});
