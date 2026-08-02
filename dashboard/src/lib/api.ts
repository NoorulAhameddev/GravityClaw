export async function api(url: string) {
  try {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } catch (e) {
    console.error(`API error (${url}):`, e);
    throw e;
  }
}
