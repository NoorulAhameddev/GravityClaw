export async function api(url: string, options: RequestInit = {}) {
  try {
    const apiKey =
      (typeof localStorage !== 'undefined' && localStorage.getItem('gravity_api_key')) ||
      import.meta.env.VITE_API_KEY ||
      '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };
    const r = await fetch(url, { ...options, headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } catch (e) {
    console.error(`API error (${url}):`, e);
    throw e;
  }
}
