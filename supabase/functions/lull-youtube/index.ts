type Config = { url: string; anonKey: string; serviceKey: string; googleClient: string; googleSecret: string };
type Connection = { google_sub: string; access_token: string; refresh_token?: string; expires_at: string; revision: number };
type Identity = { provider: string; identity_data?: { sub?: string } };
class RequestFailure extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const origins = new Set(['https://app.lull.website','https://lull.website','https://www.lull.website','https://localhost','http://localhost','capacitor://localhost','http://127.0.0.1:5189','http://127.0.0.1:5173','null']);
const resources: Record<string, Set<string>> = {
  videos: new Set(['part','myRating','id','maxResults','pageToken']),
  playlists: new Set(['part','mine','maxResults','pageToken']),
  playlistItems: new Set(['part','playlistId','maxResults','pageToken'])
};

/** All privileged work follows a live Auth user check, even behind gateway JWT validation. */
export async function handleGoogle(req: Request, config: Config, request: typeof fetch = fetch) {
  const origin = req.headers.get('Origin');
  const headers = new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'});
  if (origin && origins.has(origin)) headers.set('Access-Control-Allow-Origin',origin);
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body),{status,headers});
  if (origin && !origins.has(origin)) return answer(403,{error:'origin_denied'});
  if (req.method==='OPTIONS') {
    headers.set('Access-Control-Allow-Methods','POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers','authorization, apikey, content-type, x-client-info');
    return new Response(null,{status:204,headers});
  }
  if (req.method!=='POST') return answer(405,{error:'method_not_allowed'});
  const authorization=req.headers.get('Authorization')??'';
  if (!authorization.startsWith('Bearer ')) return answer(401,{error:'unauthorized'});
  const timed = (url: string, init: RequestInit = {}) => request(url,{...init,signal:AbortSignal.timeout(10000)});
  try {
    const userResponse=await timed(config.url+'/auth/v1/user',{headers:{apikey:config.anonKey,Authorization:authorization}});
    if(!userResponse.ok)return answer(401,{error:'unauthorized'});
    const user=await userResponse.json() as {id?:string;identities?:Identity[]};
    if(!user.id)return answer(401,{error:'unauthorized'});
    const raw=await req.text();if(raw.length>40000)return answer(413,{error:'request_too_large'});
    let body: Record<string,unknown>;
    try {body=JSON.parse(raw);}catch{return answer(400,{error:'invalid_json'});}
    if(!body||typeof body!=='object'||Array.isArray(body))return answer(400,{error:'invalid_json'});
    const rpc=async <T,>(name:string,args:Record<string,unknown>):Promise<T>=>{
      const response=await timed(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.serviceKey,Authorization:'Bearer '+config.serviceKey,'Content-Type':'application/json'},body:JSON.stringify(args)});
      if(!response.ok)throw new RequestFailure(503,'connection_store_unavailable');
      const text=await response.text();return (text?JSON.parse(text):null) as T;
    };
    const get=()=>rpc<Connection|null>('lull_google_connection_get',{p_user_id:user.id});
    const linked=(sub:string)=>user.identities?.some(i=>i.provider==='google'&&i.identity_data?.sub===sub);
    const save=(sub:string,access:string,refresh:string|null,expires:number,revision:number|null=null)=>rpc<boolean>('lull_google_connection_save',{
      p_user_id:user.id,p_google_sub:sub,p_access_token:access,p_refresh_token:refresh,
      p_expires_at:new Date(Date.now()+expires*1000).toISOString(),p_expected_revision:revision
    });
    if(body.action==='connect'){
      if(!config.googleClient||!config.googleSecret||/^[a-f0-9]{64}$/i.test(config.googleSecret))throw new RequestFailure(503,'google_credentials_unavailable');
      if(typeof body.accessToken!=='string'||!body.accessToken||body.accessToken.length>16384)return answer(400,{error:'invalid_google_token'});
      if(body.refreshToken!=null&&(typeof body.refreshToken!=='string'||body.refreshToken.length>16384))return answer(400,{error:'invalid_google_token'});
      const identityResponse=await timed('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+body.accessToken}});
      if(!identityResponse.ok)return answer(403,{error:'invalid_google_identity'});
      const identity=await identityResponse.json() as {sub?:string};
      if(!identity.sub||!linked(identity.sub))return answer(403,{error:'google_identity_mismatch'});
      await save(identity.sub,body.accessToken,(body.refreshToken as string)||null,3000);
      return answer(200,{connected:true});
    }
    const connection=await get();
    if(body.action==='status')return answer(200,{connected:!!connection&&!!linked(connection.google_sub)});
    if(body.action==='disconnect'){
      if(connection){
        const revoked=await timed('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:connection.refresh_token||connection.access_token})});
        if(!revoked.ok&&revoked.status!==400)throw new RequestFailure(503,'google_temporarily_unavailable');
      }
      await rpc('lull_google_connection_delete',{p_user_id:user.id});
      return answer(200,{connected:false});
    }
    if(body.action!=='request')return answer(400,{error:'invalid_action'});
    if(!connection||!linked(connection.google_sub))return answer(409,{error:'google_reconnect_required'});
    if(typeof body.resource!=='string'||!Object.hasOwn(resources,body.resource))return answer(400,{error:'invalid_resource'});
    if(!body.params||typeof body.params!=='object'||Array.isArray(body.params))return answer(400,{error:'invalid_params'});
    const params=new URLSearchParams();
    for(const [key,value] of Object.entries(body.params)){
      if(!resources[body.resource].has(key)||typeof value!=='string'||value.length>4096)return answer(400,{error:'invalid_params'});
      params.set(key,value);
    }
    // Only the three read-only YouTube endpoints are reachable; no arbitrary URL or method.
    let credential=connection;
    const refresh=async()=>{
      if(!config.googleClient||!config.googleSecret||/^[a-f0-9]{64}$/i.test(config.googleSecret))throw new RequestFailure(503,'google_credentials_unavailable');
      if(!credential.refresh_token)throw new RequestFailure(409,'google_reconnect_required');
      const response=await timed('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:credential.refresh_token,client_id:config.googleClient,client_secret:config.googleSecret})});
      if(!response.ok){
        if(response.status===400||response.status===401)throw new RequestFailure(409,'google_reconnect_required');
        throw new RequestFailure(503,'google_temporarily_unavailable');
      }
      const token=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number};
      if(!token.access_token)throw new RequestFailure(503,'google_temporarily_unavailable');
      const lifetime=Math.max(30,Math.min(3600,Number(token.expires_in)||3600)-60);
      const stored=await save(credential.google_sub,token.access_token,token.refresh_token||null,lifetime,credential.revision);
      // A new sign-in on another device wins over this older refresh response.
      if(!stored){const current=await get();if(!current||!linked(current.google_sub))throw new RequestFailure(409,'google_reconnect_required');credential=current;}
      else credential={...credential,access_token:token.access_token,refresh_token:token.refresh_token||credential.refresh_token,expires_at:new Date(Date.now()+lifetime*1000).toISOString(),revision:credential.revision+1};
    };
    if(Date.parse(credential.expires_at)<Date.now()+30000)await refresh();
    const url='https://www.googleapis.com/youtube/v3/'+body.resource+'?'+params;
    let response=await timed(url,{headers:{Authorization:'Bearer '+credential.access_token}});
    if(response.status===401){await refresh();response=await timed(url,{headers:{Authorization:'Bearer '+credential.access_token}});}
    if(response.status===401)throw new RequestFailure(409,'google_reconnect_required');
    if(response.status===403)throw new RequestFailure(403,'youtube_access_denied');
    if(!response.ok)throw new RequestFailure(503,'youtube_temporarily_unavailable');
    return answer(200,await response.json());
  }catch(error){
    // Never return provider responses, credentials or service keys in errors.
    return error instanceof RequestFailure?answer(error.status,{error:error.code}):answer(503,{error:'connection_temporarily_unavailable'});
  }
}

declare const Deno: {env:{get(key:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
if(typeof Deno!=='undefined')Deno.serve(req=>handleGoogle(req,{
  url:Deno.env.get('SUPABASE_URL')??'',anonKey:Deno.env.get('SUPABASE_ANON_KEY')??'',serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
  googleClient:Deno.env.get('LULL_GOOGLE_CLIENT_ID')??'',googleSecret:Deno.env.get('LULL_GOOGLE_CLIENT_SECRET')??''
}));
