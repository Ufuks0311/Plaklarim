// Adları "Her Kelimenin İlk Harfi Büyük, Gerisi Küçük" biçimine getirir.
//
// Zor olan tek şey i harfidir: büyük harfle yazılmış "KADIN"daki I küçülünce ı,
// "BILLIE"deki I küçülünce i olmalı; küçük yazılmış "istanbul" İ ile, "indie"
// I ile başlamalı. Doğru yazılmış (büyük-küçük karışık) kelimelerde harfin
// kendisi bellidir ve değiştirilmez. Belirsiz harfler için sırasıyla kelimenin
// kendisine, aynı alandaki diğer kelimelere, plağın diğer adlarına ve Türkçe
// ses uyumuna bakılır. Tek bir İngilizce kelime (VOL., LIVE) ya da yabancı bir
// plak şirketi adı Türkçe adları bozmasın diye yabancılık çoğunlukla ölçülür.
const TextCase = (() => {
  // Kelime: harf, rakam ve kesme işareti dizisi (Don't, Rock'n'roll tek kelime).
  const WORD = /[\p{L}\p{M}\p{N}'’]+/gu;
  // Roma rakamları (II, IV, XII…) büyük harfle kalır; tek "I" İngilizce zamir de olabilir.
  const ROMAN = /^(?=[IVX]{2,}$)X{0,3}(?:IX|IV|V?I{0,3})$/;
  const TR_LETTERS = /[ğĞışŞİçÇöÖüÜâÂîÎûÛ]/;
  // Türkçede bulunmayan harfler ve harf grupları: İngilizce, Fransızca, Almanca…
  // Sondaki "-s" çoğul eki (ANIMALS, HITS) de yabancılık işaretidir (Türkçede DERS, ŞANS, RAKS gibi r/n/k'den sonra gelir).
  const FOREIGN_LETTERS = /[qwxäßéèêàëïôùñåøæ]/i;
  const FOREIGN_PARTS = /th|ck|ch|ph|sh|sc|ee|oo|ea|ou|oi|ei|ie|eu|ght|(?:ing|tion|ness|ic|[bcdfghjlmptvyz]s)$/;
  // Türkçede de kelime olanlar (her, at, boy, his, oh, as, hey) listede yok.
  const EN_WORDS = new Set(("the of and you your my me i i'm it it's is to in with from for all are be this that "
    + "what when don't can't won't we she they our by or not no yes come go get let do so up "
    + "down out over into one two three world life man woman girl girls boys heart soul love lover live night "
    + "time baby song songs greatest hits best side part vol feat featuring remix version edition original "
    + "soundtrack collection sweet little big old new day days way home light dark moon star stars fire rain dream "
    + "dreams summer winter christmas king queen lady mister miss till until wild child free sing yeah").split(' '));

  const lower = (s) => s.replace(/İ/g, 'i').toLowerCase().replace(/’/g, "'");
  const isAllCaps = (w) => /\p{Lu}/u.test(w) && !/\p{Ll}/u.test(w);

  function isForeign(w) {
    const l = lower(w);
    return EN_WORDS.has(l) || FOREIGN_LETTERS.test(l) || FOREIGN_PARTS.test(l.replace(/'/g, ''));
  }

  // Bir metin grubundaki ipuçları:
  //  dotless: büyük harfli bir kelimede İ var, yani yazan İ ile I'yı ayırıyor (I = ı).
  //  foreign / turkish: yabancı ya da Türkçe harf içeren kelime sayısı; words: tüm kelimeler.
  function evidence(texts) {
    const words = texts.flatMap((t) => (typeof t === 'string' ? t.match(WORD) || [] : []))
      .filter((w) => /\p{L}/u.test(w));
    return {
      dotless: words.some((w) => isAllCaps(w) && w.includes('İ')),
      foreign: words.filter(isForeign).length,
      turkish: words.filter((w) => TR_LETTERS.test(w)).length,
      words: words.length,
    };
  }
  // Kelimelerin en az üçte biri yabancıysa ve Türkçe kelimelerden fazlaysa yabancı ad sayılır.
  const isEnglish = (ev) => ev.foreign > ev.turkish && ev.foreign * 3 >= ev.words;

  function vowelClass(c) {
    const l = c === 'İ' ? 'i' : c.toLowerCase();
    if ('aıouâû'.includes(l)) return 'back';
    if ('eiöüî'.includes(l)) return 'front';
    return null;
  }

  // Ses uyumuna uymayan sık kelimeler ve adlar: içlerindeki I'lar i okunur.
  const DOTTED_WORDS = new Set(('hadi haydi biraz hafif kitap sahil tamirci ali nuri sabri fahri hayri kadri bahri '
    + 'kadir halil ibrahim hatice').split(' '));
  // Bu köklere gelen ekler de ince okunur (KALBIMDE → Kalbimde, SAATI → Saati).
  const FRONT_STEMS = /^(?:kalb|saat|hayal)/;

  // Ses uyumu: belirsiz I'dan önceki ilk ünlü kalınsa (a, ı, o, u) ı, inceyse i
  // (KADIN → Kadın, SEVDIĞIM → Sevdiğim). Önünde ünlü yoksa kelimenin diğer
  // ünlülerine bakılır; içinde ince ünlü varsa i (MINARECI → Minareci), yalnızca
  // kalın ünlü varsa ı (YILLAR → Yıllar). Kelimenin ilk harfi I ise kalın ünlü
  // ipucu sayılmaz: İNSAN, İSYAN gibi i ile başlayanlar, IRMAK gibi ı ile
  // başlayanlardan çok. "-IYOR" ekinin ünlüleri hep aynı olduğundan sayılmaz.
  // İpucu yoksa null.
  function knownDotted(w) {
    const plain = lower(w.replace(/I/g, 'i'));
    return DOTTED_WORDS.has(plain.replace(/'.*$/, '')) || FRONT_STEMS.test(plain);
  }

  function harmonyAt(chars, k) {
    for (let j = k - 1; j >= 0; j--) {
      if (chars[j] === 'I') continue;
      const v = vowelClass(chars[j]);
      if (v) return v === 'front';
    }
    const rest = Array.from(chars.join('').replace(/IYOR\p{L}*$/iu, '')).filter((c) => c !== 'I').map(vowelClass);
    if (rest.includes('front')) return true;
    const initial = chars.slice(0, k).every((c) => !/\p{L}/u.test(c));
    if (rest.includes('back') && !initial) return false;
    return null;
  }

  // Büyük harfli kelimenin k. harfindeki I noktalı mı (i/İ) yoksa noktasız mı (ı/I)?
  // Kelimenin kendisi, sonra alanı, sonra plağın diğer adları; ipucu yoksa ses uyumu.
  // Ses uyumu da bir şey söylemiyorsa, yazan başka yerde İ kullanmışsa ı, yoksa i.
  function dottedAt(w, chars, k, field, record) {
    if (knownDotted(w)) return true;
    if (w.includes('İ')) return false;
    if (isForeign(w)) return true;
    const harmony = harmonyAt(chars, k);
    if (TR_LETTERS.test(w) && harmony !== null) return harmony;
    if (isEnglish(field)) return true;
    if (field.turkish > field.foreign && harmony !== null) return harmony;
    if (isEnglish(record)) return true;
    if (harmony !== null) return harmony;
    return !(field.dotless || record.dotless);
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
    const dot = (k) => dottedAt(w, chars, k, field, record);
    return chars.map((c, k) => {
      if (capital && k === first) {
        if (c === 'i') return turkish(w, field, record) ? 'İ' : 'I';
        if (c === 'I') return !mixed && dot(k) && turkish(w, field, record) ? 'İ' : 'I';
        if (c === 'ı') return 'I';
        return c === 'İ' ? c : c.toUpperCase();
      }
      if (c === 'I') return dot(k) ? 'i' : 'ı';
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

  // Plak şirketi ve tür adları çoğunlukla yabancıdır (Columbia, Klasik/Classical);
  // kendi kelimelerinde ipucu yoksa yabancı sayılırlar.
  const FOREIGN_NAME = evidence(['the']);

  return { title, evidence, FOREIGN_NAME };
})();
