export async function onRequestGet({ env }) {
  const data = await env.SCRATCH_KV.get('scratch-image');
  if (!data) {
    return new Response('', { status: 204 });
  }
  return new Response(data, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestPost({ request, env }) {
  const dataUrl = await request.text();
  if (dataUrl && dataUrl.startsWith('data:image/png')) {
    await env.SCRATCH_KV.put('scratch-image', dataUrl);
  }
  return new Response('ok');
}
