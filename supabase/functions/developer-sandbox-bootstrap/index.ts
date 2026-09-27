Deno.serve(()=>new Response(JSON.stringify({error:'Retired. Use watchdog-test-auth.'}),{status:410,headers:{'content-type':'application/json','cache-control':'no-store'}}));
