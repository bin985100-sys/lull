export interface LyricClockTarget { playing: boolean; currentTime: number }

/** Custom-element setters trigger a render. Repeated frozen frames must not
 * restart lyric interpolation or scrolling while the audio is buffering.
 */
export function syncLyricsClock(target: LyricClockTarget, time: number, playing: boolean) {
  const position = Number.isFinite(time) ? time : 0;
  if (target.playing !== playing) target.playing = playing;
  if (target.currentTime !== position) target.currentTime = position;
}

export function lyricsPlayback(player: { playing: boolean; loading: boolean; position: number }, media: { isPlaying: boolean; position: number }) {
  return {
    playing: player.playing && !player.loading && media.isPlaying,
    time: player.loading ? player.position : media.position
  };
}
