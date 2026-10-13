// İlk sürümün (12.10.2026) büyük harf kuralları, olduğu gibi. Yalnızca o sürümün
// düzelttiği kayıtlarda hangi adların sonradan elle değiştirildiğini anlamak için
// kullanılır (bkz. app.js casingSource).

// Adları "Her Kelimenin İlk Harfi Büyük, Gerisi Küçük" biçimine getirir.
//
// Zor olan tek şey i harfidir: büyük harfle yazılmış "KADIN"daki I küçülünce ı,
// "BILLIE"deki I küçülünce i olmalı; küçük yazılmış "istanbul" İ ile, "indie"
// I ile başlamalı. Doğru yazılmış (büyük-küçük karışık) kelimelerde harfin
// kendisi bellidir ve değiştirilmez. Belirsiz harfler için sırasıyla kelimenin
// kendisine, aynı alandaki diğer kelimelere, plağın diğer adlarına ve Türkçe
// ses uyumuna bakılır. VOL., LIVE, REMIX, THE BEST OF gibi etiket kelimeleri
// bir adı yabancı yapmaz.
const TextCaseV1 = (() => {
  // Kelime: harf, rakam ve kesme işareti dizisi (Don't, Rock'n'roll tek kelime).
  const WORD = /[\p{L}\p{M}\p{N}'’]+/gu;
  // Roma rakamları (II, IV, XII…) büyük harfle kalır; tek "I" İngilizce zamir de olabilir.
  const ROMAN = /^(?=[IVX]{2,}$)X{0,3}(?:IX|IV|V?I{0,3})$/;
  const TR_LETTERS = /[ğĞışŞİçÇöÖüÜâÂîÎûÛ]/;
  // Türkçede bulunmayan harfler ve harf grupları: İngilizce, Fransızca, İtalyanca…
  // Sondaki "-s" çoğul eki (ANIMALS, HITS) de yabancılık işaretidir (Türkçede DERS, ŞANS, RAKS gibi r/n/k'den sonra gelir).
  const FOREIGN_LETTERS = /[qwxäßéèêàëïôùñåøæòìáíóúãõ]/i;
  const FOREIGN_PARTS = /th|ck|ch|ph|sh|sc|ee|oo|ea|ou|oi|ei|ie|eu|ght|(?:ing|tion|ness|ic|[bcdfghjlmptvyz]s)$/;
  // Türkçede i/ı yanında başka ünlü olmaz (KADIN, DAYI); olan kelimeler yabancıdır
  // (RADIO, MARIA, MAIDEN) ya da i ile yazılan alıntılardır (AILE, ŞAIR, KAINAT).
  const isVowel = (c) => Boolean(c) && 'aeıioöuüâîûAEIİOÖUÜÂÎÛ'.includes(c);
  // Türkçede de kelime olanlar (her, at, boy, his, oh, as, hey, of, be) listede yok.
  const EN_WORDS = new Set(("the and you your my me i i'm it it's is to in with from for all are this that "
    + "what when don't can't won't we she they our by or not no yes come go get let do so up "
    + "down out over into one two three world life man woman girl girls boys heart soul love lover night "
    + "time baby song songs sweet little big old new day days way home light dark moon star stars fire rain dream "
    + "dreams summer winter christmas king queen lady mister miss till until wild child free sing yeah pink").split(' '));
  // Plak etiketleri: kelimenin kendisi yabancıdır ama bulunduğu adı yabancı yapmaz
  // (ALTIN YILLAR VOL. 2, AYRILIK (LIVE), THE BEST OF EMEL SAYIN).
  const TAGS = new Set(('vol volume live remix mix edit radio extended version instrumental feat featuring ft '
    + 'best greatest hits original soundtrack edition collection part side the of and single stereo mono '
    + 'special deluxe remastered remaster demo bonus intro medley').split(' '));

  const lower = (s) => s.replace(/İ/g, 'i').toLowerCase().replace(/’/g, "'");
  const isAllCaps = (w) => /\p{Lu}/u.test(w) && !/\p{Ll}/u.test(w);
  const hasHiatus = (l) => /[aeıouöüâîû]i|i[aeıouöüâîû]/.test(l);

  function isForeign(w) {
    const l = lower(w);
    return EN_WORDS.has(l) || TAGS.has(l.replace(/\.$/, '')) || FOREIGN_LETTERS.test(l)
      || FOREIGN_PARTS.test(l.replace(/'/g, '')) || (!TR_LETTERS.test(w) && hasHiatus(l));
  }

  // Bir metin grubundaki ipuçları:
  //  dotless: büyük harfli bir kelimede İ var, yani yazan İ ile I'yı ayırıyor (I = ı).
  //  foreign: etiket olmayan yabancı kelime sayısı; turkish: Türkçe harfli kelime sayısı.
  function evidence(texts) {
    const words = texts.flatMap((t) => (typeof t === 'string' ? t.match(WORD) || [] : []))
      .filter((w) => /\p{L}/u.test(w));
    return {
      dotless: words.some((w) => isAllCaps(w) && w.includes('İ')),
      foreign: words.filter((w) => isForeign(w) && !TAGS.has(lower(w))).length,
      turkish: words.filter((w) => TR_LETTERS.test(w)).length,
    };
  }

  function vowelClass(c) {
    const l = c === 'İ' ? 'i' : c.toLowerCase();
    if ('aıouâû'.includes(l)) return 'back';
    if ('eiöüî'.includes(l)) return 'front';
    return null;
  }

  // Ses uyumuna uymayan sık kelimeler ve adlar: içlerindeki I'lar i okunur.
  const DOTTED_WORDS = new Set(('hadi haydi biraz hafif kitap sahil tamirci ali nuri sabri fahri hayri kadri bahri '
    + 'kadir halil ibrahim hatice klasik latin classical musical hani sanki dahi daima').split(' '));
  // Bu köklere gelen ekler de ince okunur (KALBIMDE → Kalbimde, SAATI → Saati).
  const FRONT_STEMS = /^(?:kalb|saat|hayal|mavi|hangi|dakik)/;

  // Ses uyumuna göre i olması gereken ama ı ile yazılan kökler (BOZKIR → Bozkır).
  const BACK_STEMS = /^(?:bozkır)/;

  function knownDotted(w) {
    const plain = lower(w.replace(/I/g, 'i'));
    return DOTTED_WORDS.has(plain.replace(/'.*$/, '')) || FRONT_STEMS.test(plain);
  }
  const knownDotless = (w) => BACK_STEMS.test(lower(w.replace(/I/g, 'ı')));

  // Ses uyumuna uymayan ekler hep i ile yazılır: -(y)abil- (OLABILIR → Olabilir)
  // ve -ki (KAPIDAKI → Kapıdaki). Bu I'ların yerleri.
  function suffixDotted(chars) {
    const w = chars.join('');
    const at = new Set();
    for (const m of w.matchAll(/[AE]Y?BIL/g)) at.add(m.index + m[0].length - 2);
    for (const m of w.matchAll(/[\p{L}'’][DT][AE]KI(?![^NL])/gu)) at.add(m.index + m[0].length - 1);
    return at;
  }
  // Kalın ünlüden sonraki I'yı e'li son hece izliyorsa ad alıntıdır, i okunur
  // (SAFIYE, HAMIYET, MAKINE, ANIDEN); Türkçe eklerde ı'dan sonra e gelmez.
  const FINAL_E = /^[^AEIİOÖUÜÂÎÛ'’]E[MNT]?$/u;
  // Soru eki: ünlüsü yalnızca I olduğundan önceki kelimeye uyar (HAZIR MISIN → Hazır Mısın).
  const PARTICLE = /^MI(?:SIN(?:IZ)?|YIM|YIZ|DIR|Y?DI[MNK]?|Y?DINIZ|YMIŞ)?$/u;

  // Ses uyumu: belirsiz I'dan önceki ilk ünlü kalınsa (a, ı) ı, inceyse i
  // (KADIN → Kadın, SEVDIĞIM → Sevdiğim). Türkçede o/u'dan sonra ı gelmez;
  // gelen i'dir (RUHI, MELODI, ELEKTRONIK). Önünde ünlü yoksa kelimenin diğer
  // ünlülerine bakılır; içinde ince ünlü varsa i (MINARECI → Minareci), yalnızca
  // kalın ünlü varsa ı (YILLAR → Yıllar). Kelimenin ilk harfi I ise kalın ünlü
  // ipucu sayılmaz: İNSAN, İSYAN gibi i ile başlayanlar, IRMAK gibi ı ile
  // başlayanlardan çok. "-IYOR" ekinin ünlüleri hep aynı olduğundan sayılmaz.
  // İpucu yoksa null.
  function harmonyAt(chars, k) {
    const fixed = suffixDotted(chars);
    if (fixed.has(k)) return true;
    for (let j = k - 1; j >= 0; j--) {
      if (chars[j] === 'I') {
        if (fixed.has(j)) return true;
        continue;
      }
      const v = vowelClass(chars[j]);
      if (!v) continue;
      if ('OUÛouû'.includes(chars[j])) return true;
      if (v === 'back' && FINAL_E.test(chars.slice(k + 1).join(''))) return true;
      return v === 'front';
    }
    const rest = Array.from(chars.join('').replace(/IYOR\p{L}*$/iu, '')).filter((c) => c !== 'I').map(vowelClass);
    if (rest.includes('front')) return true;
    const initial = chars.slice(0, k).every((c) => !/\p{L}/u.test(c));
    if (rest.includes('back') && !initial) return false;
    return null;
  }

  // Bir kelimenin son ünlüsü ince mi? Ünlü yoksa null.
  function endsFront(w) {
    const v = Array.from(w).reverse().map(vowelClass).find(Boolean);
    return v ? v === 'front' : null;
  }

  // Büyük harfli kelimenin k. harfindeki I noktalı mı (i/İ) yoksa noktasız mı (ı/I)?
  // prev: aynı alanda bir önceki kelimenin düzeltilmiş hali.
  function dottedAt(w, chars, k, field, record, prev) {
    if (knownDotted(w)) return true;
    if (knownDotless(w)) return false;
    if (w.includes('İ')) return false; // yazan İ ile I'yı ayırıyor
    if (isVowel(chars[k - 1]) || isVowel(chars[k + 1])) return true;
    if (isForeign(w)) return true;
    if (PARTICLE.test(w) && prev && endsFront(prev) !== null) return endsFront(prev);
    const harmony = harmonyAt(chars, k);
    if (TR_LETTERS.test(w) && harmony !== null) return harmony;
    // Alan kendi kelimeleriyle yabancıysa (LADY IN SATIN) i.
    if (field.foreign > field.turkish) return true;
    // Yazan başka yerde İ kullanmışsa I'lar ı'dır; plağın geri kalanı yabancı olsa da.
    if (field.dotless || (record.dotless && !field.foreign)) return harmony ?? false;
    if (field.turkish && harmony !== null) return harmony;
    // Plağın geri kalanı yabancıysa (DALIDA, MILVA) i.
    if (record.foreign > record.turkish) return true;
    return harmony ?? true;
  }

  // Noktalı i ile başlayan kelime Türkçe mi (İ) yoksa yabancı mı (I)?
  function turkish(w, field, record) {
    if (TR_LETTERS.test(w)) return true;
    if (isForeign(w)) return false;
    if (field.turkish !== field.foreign) return field.turkish > field.foreign;
    if (record.turkish !== record.foreign) return record.turkish > record.foreign;
    return true;
  }

  function word(w, field, record, prev) {
    if (ROMAN.test(w)) return w;
    const chars = Array.from(w);
    const first = chars.findIndex((c) => /\p{L}/u.test(c));
    // Rakamla başlayan kelimeler (2nd, 70'ler) büyük harfle başlamaz.
    const capital = first >= 0 && !/\p{N}/u.test(chars.slice(0, first).join(''));
    const mixed = !isAllCaps(w) && /\p{Lu}/u.test(w);
    const dot = (k) => dottedAt(w, chars, k, field, record, prev);
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
    // Parantez içindeki etiketler (REMIX, CANLI) alanın dilini belirlemez.
    const field = evidence([text.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')]);
    let prev = '';
    return text.replace(WORD, (w) => (prev = word(w, field, context, prev)));
  }

  // Plak şirketi adları çoğunlukla yabancıdır (Philips, Capitol); kendi
  // kelimelerinde ipucu yoksa yabancı sayılırlar.
  const FOREIGN_NAME = { dotless: false, foreign: 1, turkish: 0 };

  return { title, evidence, FOREIGN_NAME };
})();
