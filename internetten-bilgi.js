// Sanatçı ve albüm adına göre yıl, tür ve plak şirketini MusicBrainz'den bulur.
// MusicBrainz ücretsizdir, anahtar istemez; saniyede bir istek sınırı vardır.
const ReleaseLookup = (() => {
  const API = 'https://musicbrainz.org/ws/2';

  async function get(path) {
    const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}fmt=json`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 503) throw new Error('Servis meşgul, biraz sonra tekrar dene.');
    if (!res.ok) throw new Error(`Servis hata verdi (${res.status}).`);
    return res.json();
  }

  const quote = (s) => `"${s.replace(/["\\]/g, ' ').trim()}"`;
  const isVinyl = (r) => (r.media || []).some((m) => /vinyl/i.test(m.format || ''));
  const titleCase = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (m, sep, ch) => sep + ch.toLocaleUpperCase('tr'));

  // { year, genre, label } döndürür; bulunamayan alanlar boş metin olur.
  // Hiç eşleşme yoksa null döner.
  async function find(artist, album) {
    const query = `release:${quote(album)} AND artist:${quote(artist)}`;
    const { releases = [] } = await get(`/release/?query=${encodeURIComponent(query)}&limit=25`);
    const good = releases.filter((r) => (r.score ?? 0) >= 80);
    if (!good.length) return null;
    // Plak baskısı varsa onu tercih et; yoksa en iyi eşleşmeyi al.
    const best = good.find((r) => isVinyl(r) && r.date) || good.find((r) => r.date) || good[0];

    const labelOf = (r) => (r['label-info'] || []).map((li) => li.label?.name).find(Boolean) || '';
    const label = labelOf(best) || good.map(labelOf).find(Boolean) || '';

    let genre = '';
    let firstDate = '';
    const groupId = best['release-group']?.id;
    if (groupId) {
      const group = await get(`/release-group/${groupId}?inc=genres+tags`);
      firstDate = group['first-release-date'] || '';
      const ranked = (list) => (list || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0));
      const names = ranked(group.genres).map((g) => g.name);
      if (!names.length) names.push(...ranked(group.tags).map((t) => t.name).slice(0, 1));
      genre = names.slice(0, 2).map(titleCase).join(', ');
    }

    const year = (best.date || firstDate || '').slice(0, 4);
    return { year, genre, label };
  }

  return { find };
})();
