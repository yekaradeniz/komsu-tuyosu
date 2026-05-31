const API_BASE = 'https://graph.facebook.com/v21.0';

// Instagram'in spam/integrity koruma kodlari.
// Bu hatalar gelince retry YAPMIYORUZ, cunku retry block'u uzatir.
const ACTION_BLOCK_SUBCODES = new Set([2207051]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

export class ActionBlockError extends Error {
  constructor(message, errorBody) {
    super(message);
    this.name = 'ActionBlockError';
    this.errorBody = errorBody;
  }
}

function isActionBlock(errorBody) {
  if (!errorBody) return false;
  const sub = errorBody.error_subcode;
  const code = errorBody.code;
  return ACTION_BLOCK_SUBCODES.has(sub) || RATE_LIMIT_CODES.has(code);
}

async function backoff(attempt) {
  const ms = Math.min(60000, 2000 * Math.pow(2, attempt));
  console.log(`Retry ${attempt + 1} ${ms}ms sonra...`);
  await new Promise(r => setTimeout(r, ms));
}

async function apiCall(url, params, { method = 'POST', maxRetries = 3 } = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(u.toString(), { method });
    } catch (networkErr) {
      console.error(`Network error (attempt ${attempt + 1}):`, networkErr.message);
      if (attempt >= maxRetries) throw networkErr;
      await backoff(attempt);
      continue;
    }

    // Defansif JSON parse: CDN/proxy bazen HTML hata sayfasi dondurur
    let json;
    try {
      json = await res.json();
    } catch (parseErr) {
      console.error(`JSON parse hatasi (attempt ${attempt + 1}, HTTP ${res.status}):`, parseErr.message);
      // 5xx + parse hatasi = transient, retry et
      if (res.status >= 500 && attempt < maxRetries) {
        await backoff(attempt);
        continue;
      }
      throw new Error(`Instagram API gecersiz JSON dondurdu (HTTP ${res.status})`);
    }

    if (res.ok) return json;

    const errorBody = json.error;
    console.error(`Instagram API error (attempt ${attempt + 1}):`, JSON.stringify(json));

    if (errorBody && isActionBlock(errorBody)) {
      throw new ActionBlockError(errorBody.message || 'Action blocked', errorBody);
    }

    // 4xx client error: retry yapma
    if (res.status >= 400 && res.status < 500) {
      throw new Error(errorBody?.message || res.statusText);
    }

    // 5xx server error: retry
    if (attempt >= maxRetries) {
      throw new Error(errorBody?.message || res.statusText);
    }
    await backoff(attempt);
  }
}

async function apiPost(url, params) {
  return apiCall(url, params, { method: 'POST' });
}

async function apiGet(url, params) {
  return apiCall(url, params, { method: 'GET', maxRetries: 2 });
}

async function waitUntilReady(mediaId, accessToken, maxWaitMs = 120000) {
  const interval = 5000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const data = await apiGet(`${API_BASE}/${mediaId}`, {
      fields: 'status_code',
      access_token: accessToken
    });
    const code = data.status_code;
    console.log(`  Media ${mediaId} status_code: ${code}`);
    if (code === 'FINISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') throw new Error(`Media ${mediaId} status: ${code}`);
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Media ${mediaId} not ready after ${maxWaitMs}ms`);
}

export async function checkTokenHealth({ igUserId, accessToken }) {
  const data = await apiGet(`${API_BASE}/${igUserId}`, {
    fields: 'id,username',
    access_token: accessToken
  });
  return { id: data.id, username: data.username };
}

export async function fetchLatestMedia({ igUserId, accessToken }) {
  const data = await apiGet(`${API_BASE}/${igUserId}/media`, {
    fields: 'id,timestamp',
    limit: '1',
    access_token: accessToken
  });
  return data.data?.[0] ?? null;
}

/**
 * Son N gonderiyi caption + timestamp ile getirir.
 * Caption tabanli cift-post tespiti / publish sonrasi dogrulama icin kullanilir.
 */
export async function fetchRecentMedia({ igUserId, accessToken, limit = 10 }) {
  const data = await apiGet(`${API_BASE}/${igUserId}/media`, {
    fields: 'id,timestamp,caption',
    limit: String(limit),
    access_token: accessToken
  });
  return data.data ?? [];
}

export async function postToInstagram({ igUserId, accessToken, imageUrl, caption }) {
  const { id: containerId } = await apiPost(`${API_BASE}/${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken
  });
  const { id: postId } = await apiPost(`${API_BASE}/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken
  });
  return { postId, containerId };
}

export async function postReelToInstagram({ igUserId, accessToken, videoUrl, caption }) {
  const { id: containerId } = await apiPost(`${API_BASE}/${igUserId}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: 'true',
    access_token: accessToken
  });

  await waitUntilReady(containerId, accessToken, 300000);

  const { id: postId } = await apiPost(`${API_BASE}/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken
  });
  return { postId, containerId };
}

export async function postCarouselToInstagram({ igUserId, accessToken, imageUrls, caption }) {
  const childIds = [];
  for (const imageUrl of imageUrls) {
    const { id } = await apiPost(`${API_BASE}/${igUserId}/media`, {
      image_url: imageUrl,
      is_carousel_item: 'true',
      access_token: accessToken
    });
    childIds.push(id);
  }

  for (const childId of childIds) {
    await waitUntilReady(childId, accessToken);
  }

  const { id: containerId } = await apiPost(`${API_BASE}/${igUserId}/media`, {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
    access_token: accessToken
  });

  await waitUntilReady(containerId, accessToken);

  const { id: postId } = await apiPost(`${API_BASE}/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken
  });

  return { postId, containerId };
}
