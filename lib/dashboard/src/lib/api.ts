export async function api(url: string) {
    try {
        const apiKey = localStorage.getItem('apiKey');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) {
            headers['X-Api-Key'] = apiKey;
        }
        const r = await fetch(url, { headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    } catch (e) {
        console.error(`API error (${url}):`, e);
        throw e;
    }
}
