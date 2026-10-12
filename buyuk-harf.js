// Adları "Her Kelimenin İlk Harfi Büyük, Gerisi Küçük" biçimine getirir.
// i/İ ve ı/I harfleri Türkçe ile İngilizcede farklı çevrildiği için dil,
// metnin kendisinde (yoksa aynı plağın diğer adlarında) Türkçeye özgü harf
// olup olmamasına göre seçilir.
const TextCase = (() => {
  const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
  // Kelime: harf, rakam ve kesme işareti dizisi (Don't, Rock'n'roll tek kelime).
  const WORD = /[\p{L}\p{M}\p{N}'’]+/gu;
  // Roma rakamları (II, IV, XII…) büyük harfle kalır; tek "I" İngilizce zamir de olabilir.
  const ROMAN = /^(?=[IVX]{2,}$)X{0,3}(?:IX|IV|V?I{0,3})$/;

  const hasTurkish = (text) => TURKISH.test(text || '');
  const localeFor = (...texts) => (texts.some(hasTurkish) ? 'tr' : 'en');

  function word(w, locale) {
    if (ROMAN.test(w)) return w;
    const lower = w.toLocaleLowerCase(locale);
    // Rakamla başlayan kelimeler (2nd, 70'ler) olduğu gibi küçük kalır.
    if (!/^\p{L}/u.test(lower)) return lower;
    const first = String.fromCodePoint(lower.codePointAt(0));
    return first.toLocaleUpperCase(locale) + lower.slice(first.length);
  }

  // fallbackLocale: metinde Türkçe harf yoksa kullanılacak dil ('tr' | 'en').
  function title(text, fallbackLocale = 'en') {
    if (typeof text !== 'string' || !text) return text;
    const locale = hasTurkish(text) ? 'tr' : fallbackLocale;
    return text.replace(WORD, (w) => word(w, locale));
  }

  return { title, localeFor };
})();
