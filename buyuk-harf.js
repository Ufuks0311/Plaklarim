// Adları "Her Kelimenin İlk Harfi Büyük, Gerisi Küçük" biçimine getirir.
//
// Zor olan tek şey i harfidir: büyük harfle yazılmış "KADIN"daki I küçülünce ı,
// "BILLIE"deki I küçülünce i olmalı; küçük yazılmış "istanbul" İ ile, "indie"
// I ile başlamalı. Doğru yazılmış (büyük-küçük karışık) kelimelerde harfin
// kendisi bellidir ve değiştirilmez. Belirsiz harfler için sırasıyla kelimenin
// kendisine, aynı alandaki diğer kelimelere, plağın diğer adlarına ve son olarak
// Türkçe ses uyumuna bakılır.
const TextCase = (() => {
  // Kelime: harf, rakam ve kesme işareti dizisi (Don't, Rock'n'roll tek kelime).
  const WORD = /[\p{L}\p{M}\p{N}'’]+/gu;
  // Roma rakamları (II, IV, XII…) büyük harfle kalır; tek "I" İngilizce zamir de olabilir.
  const ROMAN = /^(?=[IVX]{2,}$)X{0,3}(?:IX|IV|V?I{0,3})$/;
  const TR_LETTERS = /[ğĞışŞİçÇöÖüÜ]/;
  // Türkçede bulunmayan harfler ve harf grupları: İngilizce, Fransızca, Almanca…
  const FOREIGN_LETTERS = /[qwxäßéèêàâëïîôûùñåøæ]/i;
  const FOREIGN_PARTS = /th|ck|ch|ph|sh|sc|ee|oo|ea|ou|oi|ei|ie|eu|ght|(?:ing|tion|ness|ic)$/;
  const EN_WORDS = new Set(("the of and you your my me i i'm it it's is to in with from for all are be this that "
    + "what when don't can't won't we she he they her his our by at as or not no yes oh come go get let do so up "
    + "down out over into one two three world life man woman girl girls boy boys heart soul love lover live night "
    + "time baby song songs greatest hits best side part vol feat featuring remix version edition original "
    + "soundtrack collection sweet little big old new day days way home light dark moon star stars fire rain dream "
    + "dreams summer winter christmas king queen lady mister miss till until wild child free sing hey yeah").split(' '));

  const lower = (s) => s.replace(/İ/g, 'i').toLowerCase().replace(/’/g, "'");
  const isAllCaps = (w) => /\p{Lu}/u.test(w) && !/\p{Ll}/u.test(w);

  function isForeign(w) {
    const l = lower(w);
    return EN_WORDS.has(l) || FOREIGN_LETTERS.test(l) || FOREIGN_PARTS.test(l.replace(/'/g, ''));
  }

  // Bir metin grubundaki ipuçları:
  //  dotless: büyük harfli bir kelimede İ var, yani yazan İ ile I'yı ayırıyor (I = ı).
  //  foreign / turkish: yabancı ya da Türkçe harf içeren kelime sayısı.
  function evidence(texts) {
    const words = texts.flatMap((t) => (typeof t === 'string' ? t.match(WORD) || [] : []));
    return {
      dotless: words.some((w) => isAllCaps(w) && w.includes('İ')),
      foreign: words.filter(isForeign).length,
      turkish: words.filter((w) => TR_LETTERS.test(w)).length,
    };
  }

  // Ses uyumu: belirsiz I'lar dışındaki ünlülerin hepsi kalınsa (a, ı, o, u) Türkçe ı.
  function backVowelsOnly(w) {
    const vowels = Array.from(w.replace(/I/g, '')).map((c) => (c === 'İ' ? 'i' : c.toLowerCase()))
      .filter((c) => 'aıoueiöü'.includes(c));
    return vowels.length > 0 && vowels.every((c) => 'aıou'.includes(c));
  }

  // Büyük harfli kelimedeki I noktalı mı (i/İ) yoksa noktasız mı (ı/I)?
  function dotted(w, field, record) {
    if (w.includes('İ')) return false;
    if (isForeign(w)) return true;
    if (field.dotless) return false;
    if (field.foreign) return true;
    if (record.dotless) return false;
    if (record.foreign) return true;
    return !backVowelsOnly(w);
  }

  // Noktalı i ile başlayan kelime Türkçe mi (İ) yoksa yabancı mı (I)?
  function turkish(w, field, record) {
    if (TR_LETTERS.test(w)) return true;
    if (isForeign(w)) return false;
    if (field.turkish !== field.foreign) return field.turkish > field.foreign;
    if (record.turkish !== record.foreign) return record.turkish > record.foreign;
    return true;
  }

  function word(w, field, record) {
    if (ROMAN.test(w)) return w;
    const chars = Array.from(w);
    const first = chars.findIndex((c) => /\p{L}/u.test(c));
    // Rakamla başlayan kelimeler (2nd, 70'ler) büyük harfle başlamaz.
    const capital = first >= 0 && !/\p{N}/u.test(chars.slice(0, first).join(''));
    const mixed = !isAllCaps(w) && /\p{Lu}/u.test(w);
    let isDotted;
    const dot = () => (isDotted ??= dotted(w, field, record));
    return chars.map((c, k) => {
      if (capital && k === first) {
        if (c === 'i') return turkish(w, field, record) ? 'İ' : 'I';
        if (c === 'I') return !mixed && dot() && turkish(w, field, record) ? 'İ' : 'I';
        if (c === 'ı') return 'I';
        return c === 'İ' ? c : c.toUpperCase();
      }
      if (c === 'I') return dot() ? 'i' : 'ı';
      if (c === 'İ') return 'i';
      return c.toLowerCase();
    }).join('');
  }

  // context: aynı plağın diğer adlarından evidence() ile çıkarılan ipuçları.
  function title(text, context = evidence([])) {
    if (typeof text !== 'string' || !text) return text;
    const field = evidence([text]);
    return text.replace(WORD, (w) => word(w, field, context));
  }

  return { title, evidence };
})();
