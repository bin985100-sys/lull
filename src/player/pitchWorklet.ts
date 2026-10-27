/**
 * Сдвиг тональности без изменения скорости — AudioWorklet.
 * Классическая схема на линии задержки: два «считывателя» с переменной задержкой,
 * сдвинутые на полокна, со взаимодополняющими окнами sin²/cos² — их сумма всегда 1,
 * поэтому громкость не скачет. ratio > 1 — выше, < 1 — ниже.
 */
export const PITCH_WORKLET_SOURCE = `
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.win = Math.floor(sampleRate * 0.07);
    this.len = this.win * 2 + 8;
    this.bufs = [new Float32Array(this.len), new Float32Array(this.len)];
    this.w = 0;
    this.phase = 0;
  }
  read(buf, pos) {
    const len = this.len;
    pos = ((pos % len) + len) % len;
    const i = Math.floor(pos);
    const f = pos - i;
    return buf[i] * (1 - f) + buf[(i + 1) % len] * f;
  }
  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const ratio = params.ratio[0];
    const N = this.win;
    const frames = output[0].length;
    const chans = Math.min(output.length, 2);
    for (let i = 0; i < frames; i++) {
      const d1 = this.phase;
      const d2 = (this.phase + N / 2) % N;
      const g1 = Math.sin((Math.PI * d1) / N) ** 2;
      const g2 = 1 - g1;
      for (let c = 0; c < chans; c++) {
        const src = input && input[c] ? input[c] : input && input[0] ? input[0] : null;
        const buf = this.bufs[c];
        buf[this.w] = src ? src[i] : 0;
        output[c][i] = this.read(buf, this.w - d1) * g1 + this.read(buf, this.w - d2) * g2;
      }
      this.w = (this.w + 1) % this.len;
      this.phase = (this.phase + (1 - ratio) + N) % N;
    }
    return true;
  }
}
registerProcessor('pitch-shifter', PitchShifter);
`;
