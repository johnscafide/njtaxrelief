Deno.serve(() => new Response("Release relay disabled", { status: 410, headers: { "Cache-Control": "no-store" } }));
