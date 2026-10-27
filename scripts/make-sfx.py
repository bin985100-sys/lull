"""Синтез звуков интерфейса для заставки «Волны» (свои, без сторонних сэмплов).
Запуск: python3 scripts/make-sfx.py — пишет WAV в src/assets/sfx/, затем конвертируется в mp3."""
import numpy as np, wave, os
SR = 44100
out = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'sfx')
rng = np.random.default_rng(7)

def save(name, x):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.9
    st = np.stack([x, x], 1)
    with wave.open(os.path.join(out, name + '.wav'), 'w') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())

def bandnoise(n, f0, f1, q=6.0):
    """Шум, пропущенный через резонансный фильтр с плавающей частотой."""
    x = rng.standard_normal(n)
    y = np.zeros(n); b1 = b2 = 0.0
    f = np.linspace(f0, f1, n)
    for i in range(n):
        w0 = 2 * np.pi * f[i] / SR
        r = np.exp(-w0 / (2 * q))
        a1 = 2 * r * np.cos(w0); a2 = -r * r
        v = x[i] * (1 - r) + a1 * b1 + a2 * b2
        b2, b1 = b1, v; y[i] = v
    return y

def env(n, a, d):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) * np.exp(-np.maximum(0, t - a) / d)
    return e

# 1. Короткий «свиш» — появление обложки
n = int(0.22 * SR)
save('swish', bandnoise(n, 900, 3800, 4) * env(n, 0.03, 0.06))

# 2. Закручивание — нарастающий вихрь
n = int(1.05 * SR)
t = np.arange(n) / SR
riser = bandnoise(n, 300, 5200, 3) * (t / t[-1]) ** 1.6
tone = np.sin(2 * np.pi * np.cumsum(np.linspace(180, 900, n)) / SR) * 0.25 * (t / t[-1]) ** 2
flutter = 0.75 + 0.25 * np.sin(2 * np.pi * np.cumsum(np.linspace(3, 22, n)) / SR)
x = (riser + tone) * flutter
x[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
save('swirl', x)

# 3. Схлопывание — мягкий глубокий удар со вспышкой
n = int(0.7 * SR)
t = np.arange(n) / SR
thump = np.sin(2 * np.pi * (48 + 60 * np.exp(-t * 18)) * t) * np.exp(-t * 6)
click = bandnoise(n, 2500, 2500, 1.5) * np.exp(-t * 60) * 0.5
air = bandnoise(n, 6000, 2000, 2) * np.exp(-t * 4) * 0.25
save('impact', thump + click + air)

# 4. Появление кнопки — «поп» и стеклянный звон
n = int(0.9 * SR)
t = np.arange(n) / SR
pop = np.sin(2 * np.pi * (420 + 700 * np.exp(-t * 40)) * t) * np.exp(-t * 28)
chime = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, a, d in [(1318.5, 0.35, 4.5), (1975.5, 0.22, 6), (2637, 0.12, 8)])
save('pop', pop * 0.9 + chime * np.minimum(1, t / 0.005))
print('ok')
