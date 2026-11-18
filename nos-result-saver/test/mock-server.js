const http=require('http'),fs=require('fs'),path=require('path');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.png':'image/png','.json':'application/json'};
const root=path.join(__dirname,'site');
module.exports=(port)=>new Promise(r=>{const s=http.createServer((q,res)=>{const u=new URL(q.url,'http://x');
 if(u.pathname==='/api/result.json'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({title:'第3試合 Skeld',frames:[{x:10,y:10},{x:80,y:50},{x:150,y:90}]}));}
 if(u.pathname==='/api/players'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(u.searchParams.get('game')==='1'?['Red','Blue','Lime']:[]));}
 const f=path.join(root,u.pathname==='/'?'index.html':u.pathname);
 fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(b);});
});s.listen(port,()=>r(s));});
