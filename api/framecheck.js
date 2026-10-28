// 주소가 다른 사이트 안(iframe)에 보여지는 것을 허용하는지 확인합니다.
// X-Frame-Options나 CSP frame-ancestors로 막혀 있으면 embeddable: false
module.exports = async function (req, res) {
  const target = (req.query && req.query.url) || '';
  let u;
  try { u = new URL(target); } catch (e) { return res.status(400).json({ embeddable: false, error: 'bad url' }); }
  if (!/^https?:$/.test(u.protocol)) return res.status(400).json({ embeddable: false, error: 'bad url' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(u.href, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 daisso-framecheck' } });
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (r.headers.get('content-security-policy') || '').toLowerCase();
    let blocked = /deny|sameorigin/.test(xfo);
    const fa = csp.split(';').map(s => s.trim()).find(s => s.startsWith('frame-ancestors'));
    if (fa && !/\s\*(\s|$)/.test(fa + ' ')) blocked = true;
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ embeddable: !blocked });
  } catch (e) {
    // 확인이 안 되면 일단 화면 안에서 열어 봄
    return res.status(200).json({ embeddable: true, unknown: true });
  } finally { clearTimeout(timer); }
};
