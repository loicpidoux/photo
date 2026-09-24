const VALID_SCRATCH_PAGES = ['home', 'chomage', 'gastromaniac-sa', 'av-de-cour-42', '2020', 'colonnes', 'apropos', 'contact'];

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page') || 'home';

  if (!VALID_SCRATCH_PAGES.includes(page)) {
    return new Response(JSON.stringify({ error: 'invalid page' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const main = await env.SCRATCH_KV.get('scratch-image-' + page);
  const delta = await env.SCRATCH_KV.get('scratch-delta-' + page);
  return new Response(JSON.stringify({ main: main || null, delta: delta || null }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=10'
    }
  });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const page = body.page || 'home';

  if (!VALID_SCRATCH_PAGES.includes(page)) {
    return new Response('invalid page', { status: 400 });
  }

  if (body.type === 'main' && body.dataUrl && body.dataUrl.startsWith('data:image/png')) {
    await env.SCRATCH_KV.put('scratch-image-' + page, body.dataUrl);
    await env.SCRATCH_KV.delete('scratch-delta-' + page);
  }

  if (body.type === 'delta' && body.dataUrl && body.dataUrl.startsWith('data:image/png')) {
    await env.SCRATCH_KV.put('scratch-delta-' + page, body.dataUrl);
  }

  return new Response('ok');
}
