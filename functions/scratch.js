export async function onRequestGet({ env }) {
  const main = await env.SCRATCH_KV.get('scratch-image');
  const delta = await env.SCRATCH_KV.get('scratch-delta');
  return new Response(JSON.stringify({ main: main || null, delta: delta || null }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json();

  if (body.type === 'main' && body.dataUrl && body.dataUrl.startsWith('data:image/png')) {
    await env.SCRATCH_KV.put('scratch-image', body.dataUrl);
    await env.SCRATCH_KV.delete('scratch-delta');
  }

  if (body.type === 'delta' && body.dataUrl && body.dataUrl.startsWith('data:image/png')) {
    await env.SCRATCH_KV.put('scratch-delta', body.dataUrl);
  }

  return new Response('ok');
}
