const RANKING_TABLE = "breaker_scores";

async function waitForSupabaseConnection(maxWaitMs = 5000) {
  if (window.supabaseReadyPromise) {
    await window.supabaseReadyPromise;
  }
  const client = await getSupabaseClientWithRetry(maxWaitMs, 100);
  return { connected: !!client };
}
if (typeof window !== "undefined") {
  window.waitForSupabaseConnection = waitForSupabaseConnection;
}

async function getSupabaseClientWithRetry(maxWaitMs = 5000, intervalMs = 100) {
  const start = Date.now();
  if (window.supabaseClient) return window.supabaseClient;

  while (Date.now() - start < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (window.supabaseClient) return window.supabaseClient;
  }

  console.warn("Supabaseクライアントが指定時間内に初期化されませんでした。オフラインモードで動作します。");
  return null;
}

/**
 * @param {{ nickname: string, score: number }} params
 * @returns {Promise<{ data: any, error: any } | { error: null, skipped: true }>}
 */
async function submitScore({ nickname, score }) {
  const client = await getSupabaseClientWithRetry();
  if (!client) {
    console.warn("Supabaseクライアントが未初期化のため、スコア送信をスキップします。");
    return { error: null, skipped: true };
  }

  const { data, error } = await client
    .from(RANKING_TABLE)
    .insert({ nickname, score })
    .select()
    .single();

  return { data, error };
}

/**
 * @param {"daily" | "monthly" | "all"} range
 * @returns {Promise<{ data: any[], error: any, skipped?: boolean }>}
 */
async function fetchRanking(range) {
  const client = await getSupabaseClientWithRetry();
  if (!client) {
    console.warn("Supabaseクライアントが未初期化のため、ランキング取得をスキップします。");
    return { data: [], error: null, skipped: true };
  }

  const now = new Date();
  let fromDate = null;
  if (range === "daily") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === "monthly") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  let query = client
    .from(RANKING_TABLE)
    .select("*")
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(500);

  if (fromDate) {
    query = query.gte("created_at", fromDate.toISOString());
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data)) return { data: [], error, skipped: false };

  // 同一ニックネームは最高スコアのみ残す
  const bestByName = data.reduce((acc, row) => {
    const name = String(row.nickname ?? "").trim();
    if (!name) return acc;
    const sc = Number(row.score ?? 0);
    if (!acc[name] || sc > Number(acc[name].score ?? 0)) acc[name] = row;
    return acc;
  }, {});

  const deduped = Object.values(bestByName)
    .sort((a, b) => {
      const diff = Number(b.score ?? 0) - Number(a.score ?? 0);
      if (diff !== 0) return diff;
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    })
    .slice(0, 100);

  return { data: deduped, error: null };
}
