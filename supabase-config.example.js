(function initializeSupabaseClient() {
  const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
  const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

  let resolveReady;
  window.supabaseReadyPromise = new Promise(function (resolve) {
    resolveReady = resolve;
  });

  const init = () => {
    try {
      if (typeof supabase !== "undefined" && supabase.createClient) {
        window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      } else {
        window.supabaseClient = null;
      }
    } catch (e) {
      window.supabaseClient = null;
    }
    if (typeof resolveReady === "function") {
      resolveReady();
      resolveReady = null;
    }
  };

  if (document.readyState === "complete") {
    setTimeout(init, 100);
  } else {
    window.addEventListener("load", init);
  }
})();
