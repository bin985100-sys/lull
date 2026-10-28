import {build} from 'esbuild';
import assert from 'node:assert/strict';
await build({entryPoints:['supabase/functions/lull-youtube/index.ts'],outfile:'work/google-edge.mjs',bundle:true,platform:'node',format:'esm'});
const {handleGoogle}=await import('../work/google-edge.mjs');
const config={url:'https://supabase.invalid',anonKey:'public-fixture',serviceKey:'service-fixture',googleClient:'google-client-fixture',googleSecret:'google-secret-fixture'};
let connection=null,identity='google-owner',googleToken='google-access',refreshDenied=false,expiredAccess=false,conflict=false;
const calls=[];
const user={id:'verified-owner',identities:[{provider:'google',identity_data:{sub:'google-owner'}}]};
const network=async(raw,options={})=>{
  const url=new URL(raw);calls.push({url,options});
  if(url.pathname==='/auth/v1/user')return options.headers.Authorization==='Bearer valid-lull'?Response.json(user):Response.json({}, {status:401});
  if(url.hostname==='openidconnect.googleapis.com')return options.headers.Authorization==='Bearer discord-token'?Response.json({}, {status:401}):Response.json({sub:identity});
  if(url.pathname.includes('/rest/v1/rpc/')){
    assert.equal(options.headers.Authorization,'Bearer service-fixture');
    const args=JSON.parse(options.body);assert.equal(args.p_user_id,'verified-owner','Never trust a client-supplied user ID');
    if(url.pathname.endsWith('_get'))return Response.json(connection);
    if(url.pathname.endsWith('_save')){
      if(conflict){connection={...connection,access_token:'newer-device-access'};return Response.json(false);}
      connection={google_sub:args.p_google_sub,access_token:args.p_access_token,refresh_token:args.p_refresh_token||connection?.refresh_token,expires_at:args.p_expires_at,revision:(connection?.revision??0)+1};return Response.json(true);
    }
    if(url.pathname.endsWith('_delete')){connection=null;return new Response(null,{status:204});}
  }
  if(url.hostname==='oauth2.googleapis.com'&&url.pathname==='/token'){
    assert.equal(options.body.get('client_secret'),'google-secret-fixture');
    assert.equal(options.body.get('refresh_token'),'google-refresh');
    return refreshDenied?Response.json({error:'invalid_grant',private:'must not escape'}, {status:400}):Response.json({access_token:'refreshed-google',expires_in:3600});
  }
  if(url.hostname==='oauth2.googleapis.com'&&url.pathname==='/revoke')return new Response(null,{status:200});
  if(url.hostname==='www.googleapis.com'){
    assert.ok(['/youtube/v3/videos','/youtube/v3/playlists','/youtube/v3/playlistItems'].includes(url.pathname));
    assert.notEqual(options.headers.Authorization,'Bearer valid-lull');assert.notEqual(options.headers.Authorization,'Bearer discord-token');
    if(expiredAccess&&options.headers.Authorization==='Bearer google-access')return Response.json({}, {status:401});
    googleToken=options.headers.Authorization;return Response.json({items:[{id:'music000001'}]});
  }
  throw new Error('Unexpected destination '+url);
};
const request=(body,auth='valid-lull',origin='https://app.lull.website')=>handleGoogle(new Request('https://edge.invalid',{method:'POST',headers:{Origin:origin,...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)}),config,network);
assert.equal((await request({action:'status'},'')).status,401);assert.equal(calls.length,0);
assert.equal((await request({action:'status'},'wrong')).status,401);assert.equal(calls.length,1);
assert.equal((await request({action:'status'},'valid-lull','https://foreign.invalid')).status,403);
const unconfigured=await handleGoogle(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Bearer valid-lull','Content-Type':'application/json'},body:JSON.stringify({action:'connect',accessToken:'google-access'})}),{...config,googleSecret:''},network);
assert.equal(unconfigured.status,503);assert.equal(connection,null);
assert.equal((await request({action:'connect',accessToken:'discord-token'})).status,403);assert.equal(connection,null);
identity='other-google-owner';assert.equal((await request({action:'connect',accessToken:'google-access'})).status,403);assert.equal(connection,null);
identity='google-owner';
assert.deepEqual(await (await request({action:'connect',accessToken:'google-access',refreshToken:'google-refresh',userId:'foreign-owner'})).json(),{connected:true});
const safeStatus=await(await request({action:'status'})).text();assert.equal(safeStatus,'{"connected":true}');assert.ok(!safeStatus.includes('token'));
const query={action:'request',resource:'videos',params:{part:'snippet',myRating:'like'}};
assert.equal((await request(query)).status,200);assert.equal(googleToken,'Bearer google-access');
connection.expires_at=new Date(0).toISOString();assert.equal((await request(query)).status,200);assert.equal(googleToken,'Bearer refreshed-google');
connection.access_token='google-access';connection.expires_at=new Date(Date.now()+3600000).toISOString();expiredAccess=true;
assert.equal((await request(query)).status,200);assert.equal(googleToken,'Bearer refreshed-google');expiredAccess=false;
connection.expires_at=new Date(0).toISOString();conflict=true;
assert.equal((await request(query)).status,200);assert.equal(googleToken,'Bearer newer-device-access');conflict=false;
assert.equal((await request({...query,resource:'https://foreign.invalid/steal'})).status,400);
assert.equal((await request({...query,params:{access_token:'stolen'}})).status,400);
refreshDenied=true;connection.expires_at=new Date(0).toISOString();
const denied=await request(query);assert.equal(denied.status,409);assert.deepEqual(await denied.json(),{error:'google_reconnect_required'});refreshDenied=false;
assert.equal((await request({action:'disconnect'})).status,200);assert.equal(connection,null);
assert.equal((await request(query)).status,409);
console.log('Google connection: Auth boundary, identity/token isolation, private credentials, refresh, 401 retry, stale refresh conflict, endpoint restrictions and revocation passed');
