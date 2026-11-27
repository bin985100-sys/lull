/** Shared presentation for Telegram's inline photo and the browser return page. */
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function botMessage(chatId: number, appUrl: string, publicUrl: string, nonce?: string, photoId?: string) {
  const complete = !!nonce;
  return {
    chat_id: chatId,
    photo: photoId || `${appUrl}/icons/icon-512.png`,
    caption: complete ? '<b>Ты в Lull</b>\n\nВход выполнен. Возвращайся к музыке.' : '<b>Lull</b>\n\nТвоя музыка. Твой ритм.\nНачни вход в приложении, чтобы продолжить.',
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{
      text: complete ? 'Вернуться в Lull' : 'Открыть Lull',
      url: complete ? `${publicUrl}/api/auth/back?nonce=${encodeURIComponent(nonce!)}` : appUrl,
    }]] },
  };
}
export function returnPage(appUrl: string, title: string, text: string, nonce?: string, redirect?: string) {
  const query = nonce ? `?nonce=${encodeURIComponent(nonce)}` : '';
  const back = `lull://auth${query}`, web = `${appUrl}/auth${query}`;
  const scriptUrl = JSON.stringify(redirect || back).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#000000"><title>Lull</title>
<style>*{box-sizing:border-box}html{color-scheme:dark}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;background:#000;color:#f7f7f5;font:500 16px/1.55 system-ui,-apple-system,sans-serif;padding:max(28px,env(safe-area-inset-top)) 24px max(28px,env(safe-area-inset-bottom));text-align:center}main{width:min(100%,360px);animation:arrive .8s cubic-bezier(.2,.8,.2,1) both}.logo{display:block;width:142px;height:142px;margin:0 auto 26px;border-radius:36px}h1{font-size:30px;line-height:1.2;letter-spacing:-1px;margin:0 0 14px;font-weight:700}p{margin:0 auto 34px;max-width:310px;color:#a4a4ac}a{text-decoration:none;display:flex;min-height:58px;align-items:center;justify-content:center;border-radius:999px;padding:16px 22px;font-weight:650;transition:transform .25s ease,opacity .25s ease}a:active{transform:scale(.97)}a:focus-visible{outline:2px solid #b6a4ed;outline-offset:5px}.primary{background:#fafaf8;color:#050505}.secondary{color:#a4a4ac;margin-top:8px;min-height:48px;font-size:14px}@keyframes arrive{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){main{animation:none}a{transition:none}}</style></head><body><main>
<img class="logo" src="${escapeHtml(appUrl)}/icons/icon-512.png" width="142" height="142" alt="Логотип Lull"><h1>${escapeHtml(title)}</h1>${text ? `<p>${escapeHtml(text)}</p>` : ''}
${redirect ? '' : `<a class="primary" href="${escapeHtml(back)}">Вернуться в Lull</a><a class="secondary" href="${escapeHtml(web)}">Открыть веб-версию</a>`}</main><script>${redirect ? `location.replace(${scriptUrl})` : `setTimeout(function(){location.href=${scriptUrl}},650)`}</script></body></html>`;
}
