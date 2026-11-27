import { spawn as spawnValidatedMedia } from 'node:child_process';
import { mkdtemp as makeValidationFolder, writeFile as writeValidationFile, rm as removeValidationFolder } from 'node:fs/promises';
import { tmpdir as validationTempRoot } from 'node:os';
import { join as validationPath } from 'node:path';

/** A full HTTP body can still contain MP4 sample offsets beyond its end. Check
 * every audio packet before allowing this candidate to win the resolver race. */
export async function validateProgressiveAudio(data: Buffer): Promise<void> {
  const folder = await makeValidationFolder(validationPath(validationTempRoot(), 'lull-progressive-'));
  try {
    const file = validationPath(folder, 'source.mp4');
    await writeValidationFile(file, data);
    await new Promise<void>((resolve, reject) => {
      const process = spawnValidatedMedia('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-map', '0:a:0', '-vn', '-c:a', 'copy', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      let errors = '', timedOut = false;
      const timer = setTimeout(() => { timedOut = true; process.kill('SIGKILL'); }, 3000);
      process.stderr.on('data', chunk => { if (errors.length < 2048) errors += String(chunk).slice(0, 2048 - errors.length); });
      process.once('error', error => { clearTimeout(timer); reject(error); });
      process.once('close', code => { clearTimeout(timer); if (timedOut) reject(Error('progressive validation timed out')); else if (code || errors) reject(Error('invalid progressive audio: ' + errors.slice(0, 200))); else resolve(); });
    });
  } finally {
    if (!folder.startsWith(validationPath(validationTempRoot(), 'lull-progressive-'))) throw Error('Invalid validation folder');
    await removeValidationFolder(folder, { recursive: true, force: true });
  }
}
