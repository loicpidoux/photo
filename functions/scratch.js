const VALID_SCRATCH_PAGES = ['home', 'chomage', 'gastromaniac-sa', 'av-de-cour-42', '2020', 'colonnes', 'apropos', 'contact'];
const VALID_TYPES = ['main', 'delta'];

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page') || 'home';
  const type = url.searchParams.get('type');

  if (!VALID_SCRATCH_PAGES.includes(page)) {
    return new Response('invalid page', { status: 400 });
  }
  if (!VALID_TYPES.includes(type)) {
    return new Response('invalid type', { status: 400 });
  }

  const data = await env.SCRATCH_KV.get('scratch-' + type + '-' + page, 'arrayBuffer');

  if (!data) {
    return new Response(null, { status: 204 });
  }

  return new Response(data, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=10'
    }
  });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page') || 'home';
  const type = url.searchParams.get('type');

  if (!VALID_SCRATCH_PAGES.includes(page)) {
    return new Response('invalid page', { status: 400 });
  }
  if (!VALID_TYPES.includes(type)) {
    return new Response('invalid type', { status: 400 });
  }

  const data = await request.arrayBuffer();

  if (!data || data.byteLength === 0) {
    return new Response('empty body', { status: 400 });
  }

  await env.SCRATCH_KV.put('scratch-' + type + '-' + page, data);

  if (type === 'main') {
    await env.SCRATCH_KV.delete('scratch-delta-' + page);
  }

  return new Response('ok');
}
