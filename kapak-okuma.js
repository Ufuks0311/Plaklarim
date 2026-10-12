// Kapak fotoğrafından plak bilgilerini okur (Claude görsel tanıma).
// API anahtarı yalnızca bu cihazda, tarayıcının yerel deposunda tutulur.
const CoverReader = (() => {
  const KEY_STORAGE = 'plaklarim.anthropicKey';
  const MODEL = 'claude-opus-5-5';
  let clientPromise;

  function getKey() {
    try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
  }
  function setKey(key) {
    try {
      if (key) localStorage.setItem(KEY_STORAGE, key);
      else localStorage.removeItem(KEY_STORAGE);
    } catch { /* gizli sekmede depolama kapalı olabilir */ }
    clientPromise = null;
  }

  async function client() {
    if (!clientPromise) {
      clientPromise = import('./vendor/anthropic-sdk.min.js').then(({ default: Anthropic }) => ({
        Anthropic,
        api: new Anthropic({ apiKey: getKey(), dangerouslyAllowBrowser: true }),
      }));
    }
    return clientPromise;
  }

  const track = {
    type: 'object',
    properties: {
      no: { type: 'string' },
      title: { type: 'string' },
      artist: { type: 'string' },
    },
    required: ['no', 'title', 'artist'],
    additionalProperties: false,
  };
  const SCHEMA = {
    type: 'object',
    properties: {
      artist: { type: 'string' },
      album: { type: 'string' },
      year: { type: 'string' },
      label: { type: 'string' },
      sideA: { type: 'array', items: track },
      sideB: { type: 'array', items: track },
    },
    required: ['artist', 'album', 'year', 'label', 'sideA', 'sideB'],
    additionalProperties: false,
  };

  const PROMPTS = {
    front: 'Bu bir plağın ön kapak fotoğrafı. Kapakta yazan sanatçı ve albüm adını oku; '
      + 'görünüyorsa yılı ve plak şirketini de ekle.',
    back: 'Bu bir plağın arka kapak fotoğrafı. A yüzü ve B yüzündeki şarkıları kapakta '
      + 'yazdığı sırayla çıkar; görünüyorsa sanatçı, albüm adı, yıl ve plak şirketini de ekle.',
  };
  const RULES = 'Kurallar: Yazıları kapakta göründüğü gibi, Türkçe karakterleri koruyarak yaz. '
    + 'Görünmeyen ya da emin olmadığın alanları boş bırak, tahmin etme. '
    + 'Şarkı numarasını kapakta yazdığı gibi yaz (A1, B2, 1, 2…); yazmıyorsa boş bırak. '
    + 'Şarkının söyleyenini yalnızca her şarkı için ayrı sanatçı yazıyorsa (karma plak) doldur, '
    + 'yoksa boş bırak. Yüzler ayrılmamışsa şarkıları sırayla A yüzüne koy.';

  // Servisin döndürdüğü asıl hata metni (ör. "Your credit balance is too low…").
  const apiMessage = (err) => err?.error?.error?.message || err?.message || '';
  const isCreditError = (err) => err?.status === 400 && /credit balance/i.test(apiMessage(err));

  // kind: 'front' | 'back'. Okunan bilgileri SCHEMA biçiminde döndürür.
  async function read(kind, blob) {
    const { Anthropic, api } = await client();
    const dataUrl = await blobToDataUrl(blob);
    const [, mediaType, data] = dataUrl.match(/^data:(.+?);base64,(.*)$/);
    const request = {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: `${PROMPTS[kind]}\n\n${RULES}` },
        ],
      }],
    };
    let response;
    try {
      try {
        response = await api.beta.messages.create({
          ...request,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });
      } catch (err) {
        // Yedek model özelliği bu hesapta açık değilse onsuz bir kez daha dene.
        if (!(err instanceof Anthropic.BadRequestError) || isCreditError(err)) throw err;
        console.warn('Yedek modelsiz tekrar deneniyor:', apiMessage(err));
        response = await api.messages.create(request);
      }
    } catch (err) {
      console.error(err);
      if (err instanceof Anthropic.AuthenticationError) throw new Error('API anahtarı geçersiz.');
      if (err instanceof Anthropic.PermissionDeniedError) throw new Error('API anahtarının bu işleme izni yok.');
      if (err instanceof Anthropic.RateLimitError) throw new Error('Çok fazla istek; biraz sonra tekrar dene.');
      if (err instanceof Anthropic.APIConnectionError) throw new Error('İnternet bağlantısı yok.');
      if (isCreditError(err)) {
        throw new Error('Anthropic hesabında kredi yok. console.anthropic.com → Billing kısmından kredi yükleyince çalışır.');
      }
      if (err instanceof Anthropic.APIError) throw new Error(`Okuma servisi hata verdi (${err.status}): ${apiMessage(err)}`);
      throw err;
    }
    if (response.stop_reason === 'refusal') throw new Error('Bu görsel okunamadı.');
    const text = response.content.find((b) => b.type === 'text');
    if (!text) throw new Error('Kapaktan bilgi çıkarılamadı.');
    return JSON.parse(text.text);
  }

  return { getKey, setKey, read, hasKey: () => Boolean(getKey()) };
})();
