// Adları "Her Kelimenin İlk Harfi Büyük" biçimine getirir: yabancı plaklarda
// İngilizce, yerli plaklarda Türkçe kurallarla.
//
// Plağın dili şarkıcıya göre belirlenir: şarkıcının adında Türkçe ipuçları (ğ, ş
// harfleri; Türkçe adlar ve kelimeler) varsa plak yerli, yabancı ipuçları (q, w, x,
// é gibi harfler; th, ck, sh, -ing gibi harf grupları; yabancı adlar ve kelimeler)
// varsa yabancıdır. Addan anlaşılmıyorsa albüm ve şarkı adlarına bakılır; yabancı
// ipuçları ağır basmıyorsa plak yerli sayılır. Plağın bütün adları (şarkılar, tür,
// plak şirketi) aynı dilin kuralıyla yazılır.
//
// İngilizce: a, an, the, and, of, in, on, to… gibi kısa kelimeler küçük yazılır
// (ilk ve son kelime hariç); I küçülünce i olur.
// Türkçe: ve, ile, ya, veya, ki, de/da bağlaçları ve mı/mi soru eki küçük yazılır
// (ilk kelime hariç). Büyük harfle yazılmış I'nın küçüğü ı mı i mi, bilinen
// kelimelerde sözlükten, diğerlerinde ses uyumundan ve plağın diğer adlarından
// bulunur. Doğru yazılmış (büyük-küçük karışık) kelimelerde harfin kendisi bellidir.
const TextCase = (() => {
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
  const list = (s) => s.trim().split(/\s+/);

  // Sık geçen yabancı kelimeler. Türkçede de kelime olanlar (her, at, as, boy, his,
  // oh, hey, can, on, son, of, be, ton, un, para, sol, il, el, mi, de, da, ne, ya…) yok.
  const FOREIGN_WORDS = new Set(list(`
    the and you your yours my me mine i i'm i'll i've i'd it it's is am are was were been to in into with
    without from for all this that these those what what's when where why who how which there here then than
    so up down out over under about after again ain't always any baby back bad because before best better
    between blue bring call can't change city come cry dance dancing day days dear did do does don't done dream
    dreams eyes face fall feel feeling find fire fly forever friend friends girl girls give go going gone good
    got gonna gotta happy have he heart heaven hello help high hold home honey hurt just keep kiss know last
    leave let let's life light like little long look lost love loved lover lovers loving lucky made make man
    mind miss mister more morning mother need never new night nights no not nothing now old one only our over
    people please power rain rock roll run sad said say see shake she should show sing sky some song songs
    soul stay still stop street summer sun sunshine sweet take talk tell that's they thing things think time
    times together tonight too true try turn wait walk want wanna way we well will wind winter woman women
    won't world would yeah yes yesterday young you're king queen lady christmas moon star stars dark wild
    child free boys till until two three pink
    john paul george ringo michael elvis frank bob david james peter mary diana tina whitney stevie marvin
    aretha billy billie joe jimmy jimi jim tom rod elton freddie mick keith roger neil eric dean sammy johnny
    chuck richard simon carly cher donna gloria barbra ella louis miles charlie jackson bowie prince beatles
    stones floyd zeppelin purple sabbath eagles abba boney smokie madonna presley lennon mccartney dylan sinatra
    je tu nous vous les des une mon amour coeur chanson toujours jamais rien avec dans pour sous qui que quoi
    plus belle beau vie nuit jour soleil monde enfant enfants mademoiselle madame monsieur oui non c'est j'ai
    l'amour lo gli una uno che mio mia tuo tua amore cuore notte sole mare bella bello ciao canzone volare
    sono io con per della nel nella dolce vita tutto tutti più sempre questo quando di los las amor corazón
    por vida noche bésame mucho cielo quiero besos tengo siempre nunca die das und ich du nicht liebe mein
    meine ein eine ist mit für wie wir sie dich mich nacht herz lied lieder`));
  // Plak etiketleri: kelimenin kendisi yabancıdır ama bulunduğu adı yabancı yapmaz
  // (ALTIN YILLAR VOL. 2, AYRILIK (LIVE), THE BEST OF EMEL SAYIN).
  const TAGS = new Set(list(`vol volume live remix mix edit radio extended version instrumental feat featuring ft
    best greatest hits original soundtrack edition collection part side the of and single stereo mono special
    deluxe remastered remaster demo bonus intro medley`));

  // Türkçe sözlük: şarkı ve plak adlarında sık geçen kelimeler, adlar ve kökler
  // (ekleriyle de tanınır: GÖZLERİMDEN → göz, SEVİYORUM → sev). Yazılışları I'ların
  // ı mı i mi olduğunu da söyler (KIZIM → Kızım, BIRAZ → Biraz).
  const TR_WORDS = list(`
    ben sen biz siz onlar bunlar şunlar bana sana bize size beni seni bizi sizi benim senin bizim sizin
    kendi kendim kendin hepsi herkes hiç hep bir iki üç dört beş altı yedi sekiz dokuz yirmi otuz kırk elli
    altmış yetmiş seksen doksan yüz bin milyon ilk neden niçin niye nasıl nerede nereye nereden hangi kaç
    ama fakat çünkü eğer belki sanki hani bile ancak yine gene artık şimdi daha çok pek gibi için kadar değil
    var yok evet hayır ile veya yahut ise işte öyle böyle şöyle bunu şunu onu buna şuna ona burada orada
    aşk sevda sevgi sevgili gönül gönl kalp yürek canan yar yâr dost arkadaş hasret özlem vuslat sıla ayrılık
    ayrı yalnız yalnızlık kader kısmet dert keder gam hüzün sitem vefa vefasız hayal rüya umut ümit mutlu
    mutluluk gözyaşı göz kaş saç dudak ten ruh öpücük buse sevinç neşe kahır acı çile feryat figan aman eyvah
    vah gidi
    gel git gid kal dön bak gör sor söyle anla bil sev ağla gül yan yak yaz oku iste unut bekle ara bul düşün
    sus kork yaşa dayan inan küs darıl kır yık yıkıl ver sar dinle uyu uyan koş otur yürü düş bit başla
    kapa tut getir götür çık gir dur yap çal oyna özle sevin üzül kaç kov bağla çöz değiş vur dök sil sakla
    ayrıl kavuş buluş dokun söz
    gece gün gündüz sabah akşam öğle bugün yarın dün zaman saat yıl hafta mevsim bahar kış güz sonbahar
    ilkbahar deniz dağ ova yayla nehir ırmak göl dere yağmur kar rüzgar rüzgâr fırtına güneş yıldız bulut gök
    toprak taş çiçek lale menekşe papatya karanfil zambak sümbül ağaç orman yaprak kuş bülbül turna kartal
    kuzu ateş ışık karanlık gölge dünya hayat ömür ölüm cennet cehennem kıyamet
    anne baba kardeş abla ağabey abi oğul oğl kız kadın adam erkek çocuk bebek gelin damat nine dede hanım
    bey efendi ağa paşa sultan şah padişah dilber güzel yiğit aşık âşık derviş insan
    istanbul ankara izmir bursa adana konya sivas erzurum kars trabzon rize antep urfa diyarbakır mardin
    malatya elazığ harput çanakkale edirne kırşehir topkapı boğaziçi üsküdar kadıköy beyoğlu galata anadolu
    türkiye rumeli kıbrıs yemen bağdat kerkük karadeniz akdeniz
    şarkı türkü ezgi nağme saz bağlama kanun ney davul zurna halay horon zeybek oyun hava uzun kısa müzik
    plak kaset beste güfte makam fasıl gazel ilahi marş sanat halk arabesk fantezi taverna
    kara siyah beyaz ak kırmızı sarı yeşil mavi mor pembe gri turuncu altın gümüş eski yeni genç yaşlı küçük
    büyük ufak uzak yakın derin yüksek tatlı sıcak soğuk deli divane mecnun leyla mahzun garip yorgun kırık
    yaralı hasta zalim vefalı sevimli cilveli nazlı şirin tek
    kapı pencere köy şehir yol sokak mahalle bahçe köprü liman gemi tren araba mektup haber selam merhaba
    elveda hoşça güle veda dua allah tanrı kul hata hatasız günah bayram düğün kına mendil yemeni yüzük küpe
    çeşme değirmen harman tarla bağ bostan kervan gurbet memleket vatan asker nöbet kahve çay rakı şarap
    meyhane kadeh sarhoş sigara duman ocak yuva aile kainat şiir şair masal hikâye efsane destan
    sezen ajda barış cem zeki orhan müslüm ferdi emel bülent tarkan sertab nilüfer erkin fikret neşet ibrahim
    mahsun kayahan ahmet mehmet mustafa ali hasan hüseyin ayten muazzez selda zerrin tülay nükhet hande
    sibel sezer zehra ilhan irem ayşe fatma hülya belkıs bergen nazan nazım hikmet cahit kemal erol edip
    akbayram alpman aksu pekkan karaca manço gencebay gürses tayfur sayın müren ertaş tatlıses koray kızılay
    özdemir yılmaz kaya demir çelik şahin aydın öztürk arslan aslan doğan kılıç yıldırım özkan erdem akın
    uçar polat koç abacı sevim ferhan şenses burak özkök güllü kibariye mazhar fuat özer yeşim nesrin
    seyyal hakan tuncay tanju okan ilkay emin melike demirağ leman seda aysel ziya taner esin engin selçuk
    grup moğollar berkay dalgıç dilek semiha ruhi veysel mahzuni şerif karaböcek gündeş yaşar coşkun zeynep
    besen ışın türkan şükrü ercan saygın selami
    mazi aziz cahil nikâh kıl şık ıssız allahaısmarladık mihriban arif timur nida sipahi kırmızıgül aldinç
    kitap hakikat hakiki talihsiz sahil rakip şahit nasip yarabbi hicaz hicazkâr kiralık semiramis ziynet
    hayli zalim kalbi itiraz ihtimal semiha mediha feriha rabia yankı`);
  // İki harfli kökler yalnızca ekleriyle tanınır (OLDU, ALDIM, ETTİ, DEDİ, ELLER).
  const SHORT_ROOTS = list('ol al et de ye iç aç uç el ay su öl');
  const SUFFIXES = list(`lar ler im um üm in un ün i u ü imiz umuz ümüz iniz unuz ünüz m n si su sü yi yu yü
    nin nun nün a e ya ye na ne da de ta te dan den tan ten nda nde ndan nden la le yla yle ki ken yken ca ce
    ça çe ci cu cü çi çu çü lik luk lük li lu lü siz suz süz sin sun sün siniz sunuz sünüz dir dur dür tir
    tur tür di du dü ti tu tü dik duk dük tik tuk tük diğ duğ düğ tiğ tuğ tüğ dim dum düm tim tum tüm din dun
    dün tin tun tün mis mus müs miş muş müş yor iyor uyor üyor yorum yorsun yoruz yorsunuz yorlar ecek acak
    eceğ acağ liğ luğ lüğ mek mak me ma mez maz sa se ir ar er ur ür r y iz uz üz lim lum lüm cik cuk cük`);
  // Ek gelince yumuşayan son ünsüzler (KALBİM → kalp, GİDİYORUM → git, YÜREĞİM → yürek).
  const MUTATE = { b: 'p', d: 't', c: 'ç', ğ: 'k', g: 'k' };

  const lower = (s) => s.replace(/İ/g, 'i').toLowerCase().replace(/’/g, "'");
  // ı/i ve şapka farkı olmadan, sözlükte aramak için (KADIN, Kadın → kadin).
  const fold = (s) => lower(s).replace(/ı/g, 'i').replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u');
  const isAllCaps = (w) => /\p{Lu}/u.test(w) && !/\p{Ll}/u.test(w);
  const hasHiatus = (l) => /[aeıouöüâîû]i|i[aeıouöüâîû]/.test(l);

  const DICT = new Map();
  TR_WORDS.forEach((w) => { if (!DICT.has(fold(w))) DICT.set(fold(w), w); });
  const SHORT = new Set(SHORT_ROOTS);

  // Kelime sözlükteki bir Türkçe kelimenin ekli hali mi? { root: sözlükteki yazılışı,
  // length: kökün kelimedeki harf sayısı } ya da null.
  const rootCache = new Map();
  function turkishRoot(w) {
    if (rootCache.has(w)) return rootCache.get(w);
    const f = fold(w.replace(/['’].*$/u, '')); // İSTANBUL'DA → istanbul
    let found = null;
    if (/^\p{L}+$/u.test(f)) {
      const find = (s, depth) => {
        if (depth === 0 || s.length >= 3) {
          const hit = DICT.get(s) ?? (depth > 0 && MUTATE[s.at(-1)] ? DICT.get(s.slice(0, -1) + MUTATE[s.at(-1)]) : undefined);
          if (hit) return { root: hit, length: s.length };
        }
        if (depth > 0 && s.length === 2 && SHORT.has(s) && f.length - s.length >= 2) return { root: s, length: 2 };
        if (depth === 4 || s.length < 3) return null;
        for (const suffix of SUFFIXES) {
          if (s.length - suffix.length >= 2 && s.endsWith(suffix)) {
            const r = find(s.slice(0, -suffix.length), depth + 1);
            if (r) return r;
          }
        }
        return null;
      };
      found = find(f, 0);
    }
    rootCache.set(w, found);
    return found;
  }

  function isForeign(w) {
    const l = lower(w);
    return FOREIGN_WORDS.has(l) || TAGS.has(l.replace(/\.$/, '')) || FOREIGN_LETTERS.test(l)
      || FOREIGN_PARTS.test(l.replace(/'/g, '')) || (!TR_LETTERS.test(w) && hasHiatus(l) && !turkishRoot(w));
  }

  // Kelimenin dil puanı: Türkçe ve yabancı ipuçları. ı ve İ sayılmaz: büyük
  // harfle yazılmış adda I olarak dururlar ve düzeltince ortaya çıkarlar; puan,
  // dolayısıyla plağın dili, düzeltmeden sonra değişmemeli. ç, ö, ü Almanca ve
  // Fransızcada da olduğundan yarım puandır (MÖTLEY CRÜE).
  function score(w) {
    const l = lower(w);
    if (TAGS.has(l.replace(/\.$/, ''))) return { tr: 0, en: 0 };
    let tr = 0;
    let en = 0;
    if (/[ğĞşŞ]/.test(w)) tr += 3;
    else if (/[çÇöÖüÜâÂîÎûÛ]/.test(w)) tr += 0.5;
    if (turkishRoot(w)) tr += 2;
    if (FOREIGN_LETTERS.test(l)) en += 3;
    if (FOREIGN_WORDS.has(l)) en += 2;
    else if (!/[ğĞşŞ]/.test(w)) {
      const plain = fold(w).replace(/'/g, '');
      // Türkçe kelimeler ünsüz + y ile ya da çift ünsüzle bitmez (LONELY, KISS, BELL).
      if (FOREIGN_PARTS.test(plain) || hasHiatus(l) || /[^aeiouy]y$|([^aeiou])\1$/.test(plain)) en += 1;
    }
    return { tr, en };
  }

  // Bir metin grubundaki ipuçları:
  //  dotless: büyük harfli bir kelimede İ var, yani yazan İ ile I'yı ayırıyor (I = ı).
  //  foreign: etiket olmayan yabancı kelime sayısı; turkish: Türkçe harfli kelime sayısı.
  //  tr, en: Türkçe ve yabancı dil puanları.
  function evidence(texts) {
    const words = texts.flatMap((t) => (typeof t === 'string' ? t.match(WORD) || [] : []))
      .filter((w) => /\p{L}/u.test(w));
    const ev = {
      dotless: words.some((w) => isAllCaps(w) && w.includes('İ')),
      foreign: words.filter((w) => isForeign(w) && !TAGS.has(lower(w))).length,
      turkish: words.filter((w) => TR_LETTERS.test(w)).length,
      tr: 0,
      en: 0,
    };
    words.forEach((w) => {
      const s = score(w);
      ev.tr += s.tr;
      ev.en += s.en;
    });
    return ev;
  }

  // Adı açıkça Türkçe ya da yabancı olan şarkıcının dili; belli değilse null.
  function singerLanguage(ev) {
    if (ev.tr >= 2 && ev.tr > ev.en) return 'tr';
    if (ev.en >= 2 && ev.en > ev.tr) return 'en';
    return null;
  }

  // Karma plaklarda sanatçı yerine yazılanlar: dil şarkıları söyleyenlerden anlaşılır.
  const VARIOUS = /^(?:various(?: artists)?|v\.? ?a\.?|cesitli(?: sanatcilar)?|karisik|karma|derleme|compilation)$/;
  const isVarious = (artist) => VARIOUS.test(fold(artist).replace(/ç/g, 'c').replace(/ş/g, 's').trim());

  // Bir plağın ipuçları ve dili. songs: şarkıların adları ve söyleyenleri. Dil
  // şarkıcının adından bulunur; karma plakta (Çeşitli Sanatçılar) sanatçı ve albüm
  // adından. Bunlar bir şey söylemiyorsa plağın bütün adlarına bakılır; yabancı
  // ipuçları ağır basmıyorsa Türkçe.
  function context(artist, album, songs = []) {
    const all = evidence([artist, album, ...songs]);
    const various = typeof artist !== 'string' || !artist.trim() || isVarious(artist);
    const own = singerLanguage(evidence(various ? [artist, album] : [artist]));
    return { ...all, various, lang: own ?? (all.en >= 2 && all.en > all.tr ? 'en' : 'tr') };
  }

  // Bir şarkının ipuçları. Söyleyeninin adı ayrıca yazılmış ve dili belliyse o dil;
  // karma plakta söyleyenin adı bir şey söylemiyorsa şarkının adı da dikkate alınır.
  // Yoksa plağın dili.
  function forSinger(ctx, singer, song) {
    if (typeof singer !== 'string' || !singer.trim()) return ctx;
    const lang = singerLanguage(evidence([singer]))
      ?? (ctx.various ? singerLanguage(evidence([singer, song])) : null);
    return lang && lang !== ctx.lang ? { ...ctx, lang } : ctx;
  }

  function vowelClass(c) {
    const l = c === 'İ' ? 'i' : c.toLowerCase();
    if ('aıouâû'.includes(l)) return 'back';
    if ('eiöüî'.includes(l)) return 'front';
    return null;
  }

  // Ses uyumuna uymayan sık kelimeler ve adlar: içlerindeki I'lar i okunur.
  const DOTTED_WORDS = new Set(list(`hadi haydi biraz hafif kitap sahil tamirci ali nuri sabri fahri hayri kadri
    bahri kadir halil ibrahim hatice klasik latin classical musical hani sanki dahi daima`));
  // Bu köklere gelen ekler de ince okunur (KALBIMDE → Kalbimde, SAATI → Saati).
  const FRONT_STEMS = /^(?:kalb|saat|hayal|mavi|hangi|dakik|a?acayip|hapsi|sahi[bp])/;
  // Ses uyumuna göre i olması gereken ama ı ile yazılan kökler (BOZKIR → Bozkır).
  const BACK_STEMS = /^(?:bozkır)/;

  function knownDotted(w) {
    const plain = lower(w.replace(/I/g, 'i'));
    return DOTTED_WORDS.has(plain.replace(/'.*$/, '')) || FRONT_STEMS.test(plain);
  }
  const knownDotless = (w) => BACK_STEMS.test(lower(w.replace(/I/g, 'ı')));

  // Sözlükte bulunan kökteki I'ların noktalı olup olmadığı: Map(harf sırası → true/false).
  function rootDots(w, chars) {
    const found = turkishRoot(w);
    if (!found) return null;
    const spelled = Array.from(found.root);
    const dots = new Map();
    for (let k = 0; k < found.length && k < spelled.length; k++) {
      if (chars[k] === 'I') {
        if (spelled[k] === 'ı') dots.set(k, false);
        else if (spelled[k] === 'i' || spelled[k] === 'î') dots.set(k, true);
      }
    }
    return dots;
  }

  // Ses uyumuna uymayan ekler hep i ile yazılır: -(y)abil- (OLABILIR → Olabilir)
  // ve -ki (KAPIDAKI → Kapıdaki, YARINKI → Yarınki). Bu I'ların yerleri.
  function suffixDotted(chars) {
    const w = chars.join('');
    const at = new Set();
    for (const m of w.matchAll(/[AE]Y?BIL/g)) at.add(m.index + m[0].length - 2);
    for (const m of w.matchAll(/[\p{L}'’][DT][AE]KI(?![^NL])|[NMH]KI(?![^NL])/gu)) at.add(m.index + m[0].length - 1);
    return at;
  }
  // Kalın ünlüden sonraki I'yı e'li son hece izliyorsa ad alıntıdır, i okunur
  // (SAFIYE, HAMIYET, MAKINE, ANIDEN); Türkçe eklerde ı'dan sonra e gelmez.
  const FINAL_E = /^[^AEIİOÖUÜÂÎÛ'’]E[MNT]?$/u;
  // Soru eki: ünlüsü yalnızca I olduğundan önceki kelimeye uyar (HAZIR MISIN → Hazır mısın).
  const PARTICLE = /^MI(?:SIN(?:IZ)?|YIM|YIZ|DIR|Y?DI[MNK]?|Y?DINIZ|YMIŞ)?$/u;

  // Ses uyumu: belirsiz I'dan önceki ilk ünlü kalınsa (a, ı) ı, inceyse i
  // (KADIN → Kadın, SEVDIĞIM → Sevdiğim). Türkçede o/u'dan sonra ı gelmez;
  // gelen i'dir (RUHI, MELODI, ELEKTRONIK). Önünde ünlü yoksa kelimenin diğer
  // ünlülerine bakılır; içinde ince ünlü varsa i (MINARECI → Minareci), yalnızca
  // kalın ünlü varsa ı (YILLAR → Yıllar). Kelimenin ilk harfi I ise kalın ünlü
  // ipucu sayılmaz: İNSAN, İSYAN gibi i ile başlayanlar, IRMAK gibi ı ile
  // başlayanlardan çok. "-IYOR" ekinin ünlüleri hep aynı olduğundan sayılmaz.
  // Sözlükten bilinen I'lar ünlü sayılır. İpucu yoksa null.
  // firstDot: kelimenin ilk harfi I ise onun için verilen karar (İTİRAZ → İtiraz).
  function harmonyAt(chars, k, dots, firstDot) {
    const fixed = suffixDotted(chars);
    if (fixed.has(k)) return true;
    for (let j = k - 1; j >= 0; j--) {
      if (chars[j] === 'I') {
        if (fixed.has(j)) return true;
        if (dots?.has(j)) return dots.get(j);
        if (j === 0 && firstDot !== undefined) return firstDot;
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
  // prev: aynı alanda bir önceki kelimenin düzeltilmiş hali; dots: rootDots().
  function dottedAt(w, chars, k, field, record, prev, dots) {
    if (knownDotted(w)) return true;
    if (knownDotless(w)) return false;
    if (dots?.has(k)) return dots.get(k);
    if (w.includes('İ')) return false; // yazan İ ile I'yı ayırıyor
    if (isVowel(chars[k - 1]) || isVowel(chars[k + 1])) return true;
    if (isForeign(w)) return true;
    if (PARTICLE.test(w) && prev && endsFront(prev) !== null) return endsFront(prev);
    const firstDot = k > 0 && chars[0] === 'I' ? dottedAt(w, chars, 0, field, record, prev, dots) : undefined;
    const harmony = harmonyAt(chars, k, dots, firstDot);
    if (TR_LETTERS.test(w) && harmony !== null) return harmony;
    // Alan kendi kelimeleriyle yabancıysa (DALIDA & MILVA) i.
    if (field.foreign > field.turkish) return true;
    if (harmony !== null) return harmony;
    // Yazan başka yerde İ kullanmışsa tek ünlüsü I olan kelimede de I = ı.
    if (field.dotless || record.dotless) return false;
    return true;
  }

  // Noktalı i ile başlayan kelime Türkçe mi (İ) yoksa yabancı mı (I)?
  function turkish(w, field, record) {
    if (TR_LETTERS.test(w) || turkishRoot(w)) return true;
    if (isForeign(w)) return false;
    if (field.turkish !== field.foreign) return field.turkish > field.foreign;
    if (record.turkish !== record.foreign) return record.turkish > record.foreign;
    return true;
  }

  // Türkçe kurallarla bir kelime.
  function turkishWord(w, field, record, prev) {
    if (ROMAN.test(w)) return w;
    const chars = Array.from(w);
    const first = chars.findIndex((c) => /\p{L}/u.test(c));
    // Rakamla başlayan kelimeler (2nd, 70'ler) büyük harfle başlamaz.
    const capital = first >= 0 && !/\p{N}/u.test(chars.slice(0, first).join(''));
    const mixed = !isAllCaps(w) && /\p{Lu}/u.test(w);
    const dots = w.includes('I') ? rootDots(w, chars) : null;
    const dot = (k) => dottedAt(w, chars, k, field, record, prev, dots);
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

  // İngilizce kurallarla bir kelime: I küçülünce i, i büyüyünce I.
  function englishWord(w) {
    if (ROMAN.test(w)) return w;
    const chars = Array.from(w);
    const first = chars.findIndex((c) => /\p{L}/u.test(c));
    const capital = first >= 0 && !/\p{N}/u.test(chars.slice(0, first).join(''));
    return chars.map((c, k) => {
      if (capital && k === first) return c === 'ı' ? 'I' : c.toUpperCase();
      return c === 'İ' ? 'i' : c.toLowerCase();
    }).join('');
  }

  // Küçük yazılan kısa kelimeler. İngilizcede tanıtıcılar, bağlaçlar ve kısa edatlar
  // (Smoke on the Water, Lucy in the Sky with Diamonds); up, off, out gibi fiile
  // bağlananlar büyük kalır (Wake Me Up Before You Go-Go).
  const EN_MINOR = new Set(list('a an the and but or nor for of at by in to as on per via vs v from into with onto upon'));
  const TR_MINOR = new Set(list('ve ile ya veya yahut ki de da'));
  const TR_QUESTION = /^(?!müdür$)m[ıiuü](?:y?[ıiuü]m|s[ıiuü]n(?:[ıiuü]z)?|y[ıiuü]z|yd[ıiuü][mnk]?|yd[ıiuü]n[ıiuü]z|ym[ıiuü]ş|d[ıiuü]r)?$/u;
  // Yeni bir bölüm başlatan işaretler: parantez, iki nokta, tire, eğik çizgi…
  const BREAK = /[:;()[\]{}/–—!?.]|\s-|-\s/;

  // ctx: aynı plağın context() ile çıkarılan ipuçları ve dili.
  function title(text, ctx = context('', '')) {
    if (typeof text !== 'string' || !text) return text;
    const { lang } = ctx;
    // Parantez içindeki etiketler (REMIX, CANLI) alanın ipuçlarını değiştirmez.
    const own = evidence([text.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')]);
    const tokens = [...text.matchAll(WORD)];
    let out = '';
    let pos = 0;
    let prev = '';
    tokens.forEach((m, i) => {
      const raw = m[0];
      const before = text.slice(pos, m.index);
      const after = text.slice(m.index + raw.length, tokens[i + 1]?.index ?? text.length);
      const starts = i === 0 || BREAK.test(before);
      const ends = i === tokens.length - 1 || BREAK.test(after);
      let w = lang === 'en' ? englishWord(raw) : turkishWord(raw, own, ctx, prev);
      if (!starts) {
        const small = lang === 'en' ? w.toLowerCase() : w.toLocaleLowerCase('tr');
        if (lang === 'en' ? !ends && EN_MINOR.has(small) : TR_MINOR.has(small) || TR_QUESTION.test(small)) w = small;
      }
      out += before + w;
      pos = m.index + raw.length;
      prev = w;
    });
    return out + text.slice(pos);
  }

  return { title, context, forSinger };
})();
