import { useEffect, useRef } from 'react';

/**
 * Живой фон: WebGL-шейдер с четырьмя цветовыми пятнами, которые медленно плывут по
 * кривым Лиссажу поверх «вихревого» шума. Цвета плавно перетекают к новой палитре,
 * движение медленное и непрерывное, не зависит от музыки. Сверху — плёночное зерно.
 */

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC[4];
uniform float uEnergy;
uniform float uIntensity;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * 0.085;

  // Искажение пространства шумом — пятна «текут», а не просто двигаются
  vec2 warp = vec2(fbm(p * 1.4 + vec2(t, -t * 0.7)), fbm(p * 1.4 + vec2(-t * 0.8, t) + 5.2));
  p += (warp - 0.5) * 0.7;

  vec3 col = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = vec2(
      aspect * (0.5 + 0.42 * sin(t * (0.9 + fi * 0.27) + fi * 1.9)),
      0.5 + 0.40 * cos(t * (0.7 + fi * 0.21) + fi * 2.7)
    );
    float r = 0.42 + 0.08 * fi + 0.14 * uEnergy;
    float d = length(p - c);
    float k = exp(-(d * d) / (r * r));
    col += uC[i] * k;
    wsum += k;
  }
  col = col / max(wsum, 0.0001);
  float cover = smoothstep(0.0, 1.2, wsum);

  vec3 base = vec3(0.035, 0.035, 0.045);
  vec3 c = mix(base, col, cover * uIntensity * (0.85 + 0.25 * uEnergy));

  // Мягкий блик сверху и затемнение по краям
  c += 0.05 * uIntensity * smoothstep(0.6, 1.0, uv.y);
  float vig = smoothstep(1.25, 0.35, length((uv - vec2(0.5, 0.55)) * vec2(1.1, 1.3)));
  c *= mix(0.55, 1.0, vig);

  // Зерно, чтобы не было полос на градиентах
  c += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.035;
  gl_FragColor = vec4(c, 1.0);
}
`;

const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

interface Props {
  colors: string[];
  /** 0..1 — насколько ярко проявляются цвета (на страницах слабее, в плеере сильнее) */
  intensity?: number;
  animated?: boolean;
  /** функция, возвращающая энергию звука 0..1 */
  energy?: () => number;
  /** во сколько раз уменьшать разрешение рендера (фон размытый, высокая чёткость не нужна) */
  scale?: number;
  className?: string;
}

export function LiveBackground({ colors, intensity = 0.6, animated = true, energy, scale = 0.5, className }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef<number[]>([]);
  const props = useRef({ intensity, animated, energy });
  props.current = { intensity, animated, energy };

  useEffect(() => {
    const list = [...colors, ...colors, ...colors].slice(0, 4);
    target.current = list.flatMap(hexToRgb);
  }, [colors]);

  useEffect(() => {
    const el = canvas.current!;
    const gl = el.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) {
      el.dataset.fallback = '1';
      return;
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    // Слабая видеокарта/телефон: шейдер не собрался — показываем CSS-градиент вместо белого холста
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) || gl.isContextLost()) {
      el.dataset.fallback = '1';
      el.width = 0;
      el.height = 0;
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uC = gl.getUniformLocation(prog, 'uC');
    const uEnergy = gl.getUniformLocation(prog, 'uEnergy');
    const uIntensity = gl.getUniformLocation(prog, 'uIntensity');

    const current = [...target.current];
    let curIntensity = props.current.intensity;
    let time = Math.random() * 100;
    let last = performance.now();
    let raf = 0;
    let e = 0;

    const resize = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(2, Math.round(r.width * scale));
      const h = Math.max(2, Math.round(r.height * scale));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { animated, energy, intensity } = props.current;
      // Плавный переход цветов к новой палитре (~1.5 с)
      const tgt = target.current;
      for (let i = 0; i < 12; i++) {
        const d = (tgt[i] ?? 0) - (current[i] ?? 0);
        current[i] = (current[i] ?? 0) + d * Math.min(1, dt * 2.2);
      }
      curIntensity += (intensity - curIntensity) * Math.min(1, dt * 3);
      const en = energy ? energy() : 0;
      e += (en - e) * Math.min(1, dt * 8);
      // Движение равномерное и независимое от музыки
      if (animated) time += dt;
      if (document.hidden) return;
      gl.uniform2f(uRes, el.width, el.height);
      gl.uniform1f(uTime, time);
      gl.uniform3fv(uC, current);
      gl.uniform1f(uEnergy, e);
      gl.uniform1f(uIntensity, curIntensity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [scale]);

  const fallback = `radial-gradient(60% 70% at 20% 10%, ${colors[0]}99, transparent 70%), radial-gradient(60% 70% at 85% 30%, ${colors[1] ?? colors[0]}88, transparent 70%), radial-gradient(70% 70% at 50% 100%, ${colors[2] ?? colors[0]}66, transparent 70%), #0B0B0E`;
  return <canvas ref={canvas} className={`livebg ${className ?? ''}`} aria-hidden="true" style={{ background: fallback }} />;
}
