import { fmt } from './lib/util.mjs';
const data = await (await fetch('api/result.json')).json();
document.getElementById('title').textContent = data.title;
const img = new Image();
img.onload = () => { window.MAP_OK = true; draw(0); };
img.src = 'map.png';
const ctx = document.getElementById('map').getContext('2d');
function draw(t){ ctx.drawImage(img,0,0); const f=data.frames[t]; ctx.fillStyle='#ff0'; ctx.fillRect(f.x,f.y,10,10); document.getElementById('pos').textContent = fmt({name:'Red',...f}); }
document.getElementById('slider').oninput = e => draw(+e.target.value);
const x = new XMLHttpRequest(); x.open('GET','api/players?game=1'); x.onload=()=>{ document.getElementById('players').textContent = JSON.parse(x.responseText).join(','); }; x.send();
