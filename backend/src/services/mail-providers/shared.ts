/** POSTs a JSON body and throws a descriptive error on a non-2xx answer. */
export async function postJson(
  url: string,
  init: { headers: Record<string, string>; body: unknown },
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    body: JSON.stringify(init.body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Mail provider answered ${response.status}: ${detail.slice(0, 300)}`);
  }
}
