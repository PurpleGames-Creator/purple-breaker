(function initializeSupabaseClient() {
  const SUPABASE_URL = "https://hefayilffszrczxhnpii.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlZmF5aWxmZnN6cmN6eGhucGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDI5NDEsImV4cCI6MjA4NzUxODk0MX0.qUsuQOIZzdlFLXtR-i1d9TX5c3P9QKPdhv34QGt4V_k";

  // 接続完了を待つ側が await するための Promise（接続成否に関わらず resolve する）
  let resolveReady;
  window.supabaseReadyPromise = new Promise(function (resolve) {
    resolveReady = resolve;
  });

  const init = () => {
    try {
      if (typeof supabase !== "undefined" && supabase.createClient) {
        window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Supabase connected.");
      } else {
        console.warn("Supabase library not found. Running in offline mode.");
        window.supabaseClient = null;
      }
    } catch (e) {
      console.error("Supabase init error:", e);
      window.supabaseClient = null;
    }
    if (typeof resolveReady === "function") {
      resolveReady();
      resolveReady = null;
    }
  };

  // ライブラリの読み込みを待つために少し遅延させる
  if (document.readyState === "complete") {
    setTimeout(init, 100);
  } else {
    window.addEventListener("load", init);
  }
})();
