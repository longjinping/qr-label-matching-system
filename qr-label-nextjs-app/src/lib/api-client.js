export async function apiGet(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `请求失败：${response.status}`);
  }

  return payload;
}

export async function apiPost(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `请求失败：${response.status}`);
  }

  return payload;
}
