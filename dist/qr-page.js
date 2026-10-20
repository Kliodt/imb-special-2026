'use strict';
const origin = window.GUIDE_RUNTIME?.publicOrigin || location.origin;
const connection = document.getElementById('connection');
connection.textContent = origin.startsWith('https:')
  ? (window.GUIDE_RUNTIME?.testMode ? 'Тестовый HTTPS-адрес: работает, пока запущены платформа и туннель.' : 'QR-коды готовы для текущего HTTPS-адреса платформы.')
  : 'Локальный тест: телефон и компьютер должны быть в одной сети. Для живого сканера на телефоне нужен HTTPS.';
const definitions = [{ name: 'СТАРТ / Начать аудиогид', query: '?start=1', file: '00-start', start: true },
  ...window.GUIDE_TRACKS.map((track, i) => ({ name: `0${i + 1} / ${track.title}`, query: `?stop=${i + 1}`, file: `0${i + 1}` }))];
Promise.all(definitions.map(async item => {
  const article = document.createElement('article');
  if (item.start) article.className = 'start';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', item.start ? 'Стартовый QR-код' : `QR-код точки ${item.file}`);
  const title = document.createElement('h2'); title.textContent = item.name;
  const link = document.createElement('a'); link.className = 'link'; link.href = `${origin}/${item.query}`; link.textContent = link.href;
  const note = document.createElement('p'); note.className = 'printnote'; note.textContent = item.start ? 'Надень наушники · Отсканируй · Нажми ▶' : 'Сканируй внутри плеера';
  const download = document.createElement('a'); download.className = 'download'; download.download = `MEGA-${item.file}.png`; download.textContent = 'Скачать PNG';
  article.append(canvas, title, note, link, download); document.getElementById('codes').append(article);
  await QRCode.toCanvas(canvas, item.start ? link.href : `MEGA:${Number(item.file)}`, { width: 1000, margin: 4, errorCorrectionLevel: 'M' });
  download.href = canvas.toDataURL('image/png');
})).catch(() => { document.getElementById('error').textContent = 'Не удалось создать коды. Обнови страницу.'; });

// A local QR sheet follows the current address if the free HTTPS tunnel reconnects.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  setInterval(async () => {
    try {
      const config = await fetch('runtime.json', { cache: 'no-store' }).then(r => r.json());
      if (config.publicOrigin && config.publicOrigin !== origin) location.reload();
    } catch { /* Keep the last generated sheet visible. */ }
  }, 15000);
}
