/* ================= UI: dialogue ================= */
let dlgQ=null,dlgBlip=0;
function setMode(m){
  G.mode=m;ew.dataset.mode=m;
  if(m!=='play')$('ctxb').style.display='none';
  if(m==='play')refreshObjective();
}
function startDlg(pages,opts){
  if(!pages||!pages.length){if(opts&&opts.end)opts.end();return;}
  dlgQ={pages,i:0,shown:0,opts:opts||{},prev:G.mode==='dialog'?'play':G.mode,choicesShown:false};
  setMode('dialog');
  renderDlgPage();
}
function renderDlgPage(){
  const pg=dlgQ.pages[dlgQ.i];
  $('dlgN').textContent=pg.n||'';
  $('dlgT').textContent='';
  dlgQ.shown=0;dlgQ.choicesShown=false;
  $('dlgC').style.display='none';$('dlgC').innerHTML='';
  $('dlgA').style.display='none';
}
function updDlg(dt){
  if(!dlgQ)return;
  const pg=dlgQ.pages[dlgQ.i];
  if(dlgQ.shown<pg.t.length){
    const prev=Math.floor(dlgQ.shown);
    dlgQ.shown=Math.min(pg.t.length,dlgQ.shown+dt*56);
    if(Math.floor(dlgQ.shown)!==prev){
      $('dlgT').textContent=pg.t.slice(0,Math.floor(dlgQ.shown));
      if(++dlgBlip%4===0)sfx('blip');
    }
  }else{
    $('dlgT').textContent=pg.t;
    const last=dlgQ.i===dlgQ.pages.length-1;
    if(last&&dlgQ.opts.choices){
      if(!dlgQ.choicesShown){
        dlgQ.choicesShown=true;
        const c=$('dlgC');c.style.display='flex';
        for(const ch of dlgQ.opts.choices){
          const b=document.createElement('div');b.className='dopt';b.textContent=ch.t;
          b.addEventListener('pointerdown',ev=>{ev.stopPropagation();sfx('blip');closeDlg(ch);});
          c.appendChild(b);
        }
      }
    }else $('dlgA').style.display='block';
  }
}
function advDlg(){
  if(!dlgQ)return;
  const pg=dlgQ.pages[dlgQ.i];
  if(dlgQ.shown<pg.t.length){dlgQ.shown=pg.t.length;$('dlgT').textContent=pg.t;return;}
  const last=dlgQ.i===dlgQ.pages.length-1;
  if(last){
    if(dlgQ.opts.choices)return; // must pick an option
    closeDlg(null);
  }else{dlgQ.i++;renderDlgPage();sfx('blip');}
}
function closeDlg(sel){
  const q=dlgQ;dlgQ=null;
  setMode(q.prev==='dialog'?'play':(q.prev||'play'));
  if(sel&&sel.f)sel.f();
  if(q.opts.end)q.opts.end();
}
/* ================= toasts / objective ================= */
function toast(msg){
  const box=$('toasts');
  while(box.children.length>2)box.firstChild.remove();
  const el=document.createElement('div');el.className='toast';el.textContent=msg;
  box.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),400);},2600);
}
function refreshObjective(){
  const t=objectiveText();
  $('objt').textContent=t;
  $('obj').classList.toggle('has',!!t);
}
function updCtxBtn(){
  const b=$('ctxb');
  if(G.mode==='play'&&G.inter){b.style.display='flex';$('ctxt').textContent=G.inter.label;}
  else b.style.display='none';
}
/* ================= fades ================= */
function fadeOut(cb,ms){
  ms=ms||350;const f=$('fade');
  f.style.transition='opacity '+(ms/1000)+'s ease';f.style.opacity=1;
  setTimeout(cb,ms+40);
}
function fadeIn(ms){
  ms=ms||450;const f=$('fade');
  f.style.transition='opacity '+(ms/1000)+'s ease';f.style.opacity=0;
}
function fadeFlash(){fadeOut(()=>fadeIn(500),320);}
/* ================= map ================= */
let mapSel=null;
function openMap(){setMode('map');$('mtrav').style.display='none';renderMap();}
function tri(g,x,y,s){g.beginPath();g.moveTo(x,y-s);g.lineTo(x+s,y+s);g.lineTo(x-s,y+s);g.closePath();g.fill();}
function diam(g,x,y,s){g.beginPath();g.moveTo(x,y-s);g.lineTo(x+s,y);g.lineTo(x,y+s);g.lineTo(x-s,y);g.closePath();g.fill();}
function renderMap(){
  const mc=$('mapcv');
  const size=Math.min(VW*.92,VH-150);
  mc.width=Math.round(size*DPR);mc.height=Math.round(size*DPR);
  mc.style.width=size+'px';mc.style.height=size+'px';
  const g=mc.getContext('2d');
  g.setTransform(DPR,0,0,DPR,0,0);
  g.fillStyle='#161311';g.fillRect(0,0,size,size);
  const cs=size/EGRID;
  for(let y=0;y<EGRID;y++)for(let x=0;x<EGRID;x++){
    if(!G.explored[x+y*EGRID])continue;
    g.fillStyle=COLB[baseTileAt(x*ECELL+4,y*ECELL+4)];
    g.fillRect(x*cs,y*cs,cs+.5,cs+.5);
  }
  const ic=p=>({x:p.tx/WORLD*size,y:p.ty/WORLD*size});
  G.mapNodes=[];
  for(const p of POIS){
    const seen=flag('seen:'+p.id),{x,y}=ic(p);
    if(p.k==='tower'){
      const on=flag('tower:'+p.id);
      g.fillStyle=on?'#9fd8ff':'#ffb35c';tri(g,x,y,5);
      if(on)G.mapNodes.push({x,y,p,name:p.name,d:'Wayfarer tower — travel point'});
    }else if(p.k==='vil'&&seen){
      g.fillStyle='#f2e9d8';g.fillRect(x-3.5,y-2.5,7,6);
      g.fillStyle='#e8894a';g.beginPath();g.moveTo(x-5,y-2.5);g.lineTo(x,y-8);g.lineTo(x+5,y-2.5);g.closePath();g.fill();
      G.mapNodes.push({x,y,p,name:p.name,d:'Village — rest, trade, travel'});
    }else if(p.k==='shrine'&&(seen||flag('shrine:'+p.id))){
      const done=flag('shrine:'+p.id);
      g.fillStyle=done?'#9fd8ff':'#617286';diam(g,x,y,4.5);
      if(done)G.mapNodes.push({x,y,p,name:'Ancient Shrine',d:'Trial passed — travel point'});
    }else if(p.k==='ruins'&&G.mq>=2){
      const dead=flag('warden:'+p.id);
      g.fillStyle=dead?'#6a6458':'#e05b4b';
      g.beginPath();g.arc(x,y,4.4,0,TAU);g.fill();
      g.fillStyle='#161311';g.fillRect(x-2.5,y-1.5,2,2);g.fillRect(x+.5,y-1.5,2,2);
    }else if(p.k==='cit'&&(G.mq>=2||seen)){
      g.fillStyle='#b78ad2';
      g.beginPath();g.moveTo(x-6,y+5);g.lineTo(x-6,y-3);g.lineTo(x-3,y-1);g.lineTo(x,y-7);g.lineTo(x+3,y-1);g.lineTo(x+6,y-3);g.lineTo(x+6,y+5);g.closePath();g.fill();
    }else if(p.k==='stone'&&flag('stone:'+p.id)){
      g.fillStyle='#8d8577';g.fillRect(x-1.5,y-3,3,6);
    }
  }
  for(const t of questTargets()){
    const x=t.x/(WORLD*TILE)*size,y=t.y/(WORLD*TILE)*size;
    g.fillStyle='#ffd66e';
    g.save();g.translate(x,y);g.rotate(.4);
    for(let i=0;i<2;i++){g.fillRect(-6,-1.2,12,2.4);g.rotate(Math.PI/2);}
    g.restore();
  }
  const px=G.p.x/(WORLD*TILE)*size,py=G.p.y/(WORLD*TILE)*size;
  g.save();g.translate(px,py);g.rotate(G.p.face+Math.PI/2);
  g.fillStyle='#fff';g.strokeStyle='#161311';g.lineWidth=1.5;
  g.beginPath();g.moveTo(0,-7);g.lineTo(5,6);g.lineTo(0,3);g.lineTo(-5,6);g.closePath();g.fill();g.stroke();
  g.restore();
  g.strokeStyle='rgba(242,233,216,.2)';g.lineWidth=1;g.strokeRect(.5,.5,size-1,size-1);
}
function mapTap(ev){
  const mc=$('mapcv'),r=mc.getBoundingClientRect();
  const x=ev.clientX-r.left,y=ev.clientY-r.top;
  let best=null,bd=20;
  for(const n of G.mapNodes||[]){
    const d=hyp(n.x-x,n.y-y);
    if(d<bd){bd=d;best=n;}
  }
  if(best){
    mapSel=best;
    $('mtravN').textContent=best.name;
    $('mtravD').textContent=best.d;
    $('mtrav').style.display='block';
  }else $('mtrav').style.display='none';
}
function travelTo(p){
  $('mtrav').style.display='none';
  setMode('play');
  sfx('travel');
  fadeOut(()=>{
    G.p.x=p.tx*TILE+12;G.p.y=p.ty*TILE+44;
    G.p.act='';G.p.vx=0;G.p.vy=0;G.p.kbx=0;G.p.kby=0;
    G.cam.x=G.p.x;G.cam.y=G.p.y;G.lum.x=G.p.x;G.lum.y=G.p.y-30;
    G.pr=[];G.boss=null;
    if(G.trial)failTrial('The shrine releases you.');
    reveal(p.tx,p.ty,3);
    autosave();
    fadeIn(500);
  },380);
}
/* ================= pause sheet ================= */
function openPause(){setMode('pause');buildPause();autosave();}
let eraseArm=false;
function buildPause(){
  const p=G.p;
  let h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'+
    '<div style="font-size:19px;font-weight:800;letter-spacing:.08em">EMBERWILD</div>'+
    '<div class="chip eq" data-act="resume">Resume ▸</div></div>';
  h+='<div id="pstats">'+
    '<span><i>♥</i>'+(Math.round(p.hp/4*10)/10)+' / '+(p.maxhp/4)+'</span>'+
    '<span><i>⚡</i>'+Math.round(p.maxst)+'</span>'+
    '<span><i>◉</i>'+G.coins+'</span>'+
    '<span><i>➶</i>'+G.arrows+'</span>'+
    (G.pouch?'<span><i>●</i>'+G.bombs+'</span>':'')+
    '<span><i>✦</i>'+G.orbs+' orbs</span>'+
    (G.shards?'<span><i>♦</i>'+G.shards+'/4 shards</span>':'')+'</div>';
  h+='<div class="ph">Weapons</div><div class="chips">';
  for(const w of G.wpns)
    h+='<div class="chip'+(G.wpn===w?' eq':'')+'" data-wpn="'+w+'">'+WPN[w].n+' <small>· dmg '+WPN[w].d+'</small></div>';
  if(G.bow)h+='<div class="chip">Old Bow <small>· dmg 4 · '+G.arrows+' arrows</small></div>';
  h+='</div>';
  const foods=Object.keys(G.food).filter(k=>G.food[k]>0);
  h+='<div class="ph">Food — tap to eat</div><div class="chips">';
  if(!foods.length)h+='<div class="chip" style="opacity:.5">Pockets empty — forage, hunt, shake trees</div>';
  for(const f of foods)
    h+='<div class="chip" data-food="'+f+'">'+FOODS[f].n+' ×'+G.food[f]+' <small>· +'+(FOODS[f].h/4)+'♥</small></div>';
  h+='</div>';
  h+='<div class="ph">Quests</div>';
  for(const q of questLog())
    h+='<div class="qrow'+(q.done?' qdone':'')+'"><b>'+q.t+'</b><span>'+q.d+'</span></div>';
  h+='<div class="ph">Settings</div><div class="chips">'+
    '<div class="chip" data-act="audio">Sound: '+(G.audio?'On':'Off')+'</div>'+
    '<div class="chip" data-act="fx">Effects: '+(G.lowfx?'Battery saver':'Full')+'</div>'+
    '<div class="chip" data-act="erase">'+(eraseArm?'Tap again to erase journey':'New game (erase)')+'</div></div>';
  h+='<div class="ph">How to play</div><div class="helpt">'+
    'Touch — left half: move (joystick appears) · ⚔ tap: attack, hold: charge a spin · ↷ tap: dodge-roll, hold: sprint · ➶ hold to aim, release to loose · dodge at the last instant to slow time.<br>'+
    'Keys — WASD move · J attack · K roll/sprint · L bow · B bomb · E interact · M map · Esc menu.<br><br>'+
    'Climb rock and swim by walking into it — both burn stamina (the green ring). Towers chart the map and become travel points. Shrines grant Spirit Orbs; a village statue trades 4 orbs for a heart or deeper stamina. Campfires cook food and pass the time. The wild autosaves — '+
    (storageOK?'your journey is kept on this device.':'this session only (storage unavailable here).')+'</div>';
  const el=$('pausin');el.innerHTML=h;
  el.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();const act=b.dataset.act;
    if(act==='resume'){eraseArm=false;setMode('play');}
    else if(act==='audio'){G.audio=!G.audio;if(G.audio)ensureAC();buildPause();}
    else if(act==='fx'){G.lowfx=!G.lowfx;resize();buildPause();}
    else if(act==='erase'){
      if(!eraseArm){eraseArm=true;buildPause();}
      else{eraseArm=false;store.del();resetState();setMode('title');
        $('tCont').style.display='none';fadeIn(400);}
    }
  }));
  el.querySelectorAll('[data-wpn]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();G.wpn=b.dataset.wpn;sfx('pick');buildPause();
  }));
  el.querySelectorAll('[data-food]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();const f=b.dataset.food;
    if(G.p.hp>=G.p.maxhp){toast('Hearts already full');return;}
    if(G.food[f]>0){G.food[f]--;G.p.hp=Math.min(G.p.maxhp,G.p.hp+FOODS[f].h);
      sfx('heal');buildPause();}
  }));
}
/* ================= save / load ================= */
function expEncode(){
  let s='';
  for(let i=0;i<G.explored.length;i+=8){
    let b=0;
    for(let j=0;j<8;j++)b|=(G.explored[i+j]?1:0)<<j;
    s+=String.fromCharCode(b);
  }
  return btoa(s);
}
function expDecode(str){
  try{
    const s=atob(str);
    for(let i=0;i<s.length;i++){
      const b=s.charCodeAt(i);
      for(let j=0;j<8&&i*8+j<G.explored.length;j++)G.explored[i*8+j]=(b>>j)&1;
    }
  }catch(e){}
}
function saveData(){
  return JSON.stringify({v:1,px:Math.round(G.p.x),py:Math.round(G.p.y),
    hp:G.p.hp,maxhp:G.p.maxhp,st:Math.round(G.p.st),maxst:G.p.maxst,
    coins:G.coins,arrows:G.arrows,bombs:G.bombs,orbs:G.orbs,shards:G.shards,
    wpn:G.wpn,wpns:G.wpns,bow:G.bow,pouch:G.pouch,food:G.food,
    mq:G.mq,q:G.q,flags:G.flags,stats:G.stats,dayT:G.dayT,dayN:G.dayN,
    healed:G.healed,lastSafe:G.lastSafe,audio:G.audio,exp:expEncode()});
}
function autosave(){
  if(!G.p||G.mq<0)return;
  store.set(saveData());
  const el=$('saved');el.style.opacity=.85;
  setTimeout(()=>{el.style.opacity=0;},900);
}
function loadSave(){
  const raw=store.get();
  if(!raw)return false;
  try{
    const d=JSON.parse(raw);
    if(d.v!==1||typeof d.px!=='number')return false;
    G.healed=!!d.healed;clearWorldCache();
    G.p=newPlayer(d.px,d.py);
    G.p.hp=d.hp;G.p.maxhp=d.maxhp;G.p.st=d.st;G.p.maxst=d.maxst;
    G.coins=d.coins||0;G.arrows=d.arrows||0;G.bombs=d.bombs||0;
    G.orbs=d.orbs||0;G.shards=d.shards||0;
    G.wpn=d.wpn||'rusty';G.wpns=d.wpns||['rusty'];G.bow=!!d.bow;G.pouch=!!d.pouch;
    G.food=d.food||{};G.mq=(typeof d.mq==='number')?d.mq:0;G.q=d.q||{};
    G.flags=d.flags||{};G.stats=Object.assign(G.stats,d.stats||{});
    G.dayT=d.dayT||.3;G.dayN=d.dayN||1;G.lastSafe=d.lastSafe||null;
    if(typeof d.audio==='boolean')G.audio=d.audio;
    expDecode(d.exp||'');
    G.cam.x=G.p.x;G.cam.y=G.p.y;G.lum.x=G.p.x;G.lum.y=G.p.y-30;
    return true;
  }catch(e){return false;}
}
function resetState(){
  G.flags={};G.q={};G.mq=-1;
  G.stats={chests:0,shrines:0,stones:0,kills:0,deaths:0,steps:0};
  G.explored=new Uint8Array(EGRID*EGRID);
  G.ents=[];G.pr=[];G.px=[];G.ft=[];G.drops=[];
  G.camps=new Map();G.trial=null;G.boss=null;G.cutBush=new Set();
  G.coins=0;G.arrows=0;G.bombs=0;G.orbs=0;G.shards=0;
  G.wpn='rusty';G.wpns=['rusty'];G.bow=false;G.pouch=false;G.food={apple:2};
  G.healed=false;G.dayT=.30;G.dayN=1;G.hurtT=0;G.slow=0;G.freeze=0;
  clearWorldCache();
  const sx=SP.spawn.tx*TILE+12,sy=SP.spawn.ty*TILE+12;
  G.p=newPlayer(sx,sy);
  G.cam.x=sx;G.cam.y=sy;G.lum.x=sx;G.lum.y=sy-30;
  G.lastSafe={x:sx,y:sy};
  refreshObjective();
}
/* ================= death / ending / intro ================= */
function die(){
  if(G.mode==='dead')return;
  G.stats.deaths++;
  if(G.trial)failTrial('The trial releases you.');
  G.boss=null;G.deadT=0;
  setMode('dead');sfx('roar');
}
function respawn(){
  fadeOut(()=>{
    const s=G.lastSafe||{x:SP.spawn.tx*TILE+12,y:SP.spawn.ty*TILE+12};
    G.p.x=s.x;G.p.y=s.y;G.p.hp=G.p.maxhp;G.p.st=G.p.maxst;
    G.p.iv=1.5;G.p.act='';G.p.exh=false;G.p.vx=0;G.p.vy=0;G.p.kbx=0;G.p.kby=0;
    for(const e of G.ents)if(e.t!=='npc')e.dead=true;
    G.camps.forEach(c=>c.spawned=false);
    G.pr=[];G.cam.x=s.x;G.cam.y=s.y;G.lum.x=s.x;G.lum.y=s.y-30;
    setMode('play');autosave();fadeIn(600);
  },420);
}
function endingStart(){
  G.freeze=1.2;
  const f=$('fade');
  f.style.background='#f6edd9';
  fadeOut(()=>{
    G.healed=true;clearWorldCache();
    G.ents=G.ents.filter(e=>e.t==='npc');
    G.pr=[];G.px=[];G.boss=null;
    setTimeout(()=>{
      fadeIn(1600);
      setTimeout(()=>{f.style.background='#000';},1700);
      startDlg([
        {n:'',t:'The shards leave your pack like birds remembering a window. Gold seams close across the broken crown, and the violet dark drains out of the world like a tide going home.'},
        {n:'The Ember King',t:'…Snow-flowers. A sapling. The sand road. Mist on the lake at dawn. I asked the crown to take one grief — and it took every joy that ever touched it.'},
        {n:'The Ember King',t:'You carried them back to me, wanderer. All of them. Rest now, wherever you like. The wild owes you a hundred mornings.'},
        {n:'Lumen',t:'The meadows are turning GREEN — look, LOOK! …I remember him now. I remember laughing. Thank you for carrying me home.'},
        {n:'',t:'The Ember Crown is whole. The blight is meadow. Emberwild is healed — and all of it is yours to wander.'},
        {n:'',t:'Your tale: '+G.dayN+' day'+(G.dayN>1?'s':'')+' · '+G.stats.shrines+' shrines · '+G.stats.chests+' chests · '+G.stats.stones+' stones read · '+G.stats.kills+' foes · '+G.stats.deaths+' falls. It is written in the grass.'}],
        {end(){toast('Free roam — the healed wild awaits');refreshObjective();autosave();}});
    },900);
  },1400);
}
const INTRO=[
  'Long ago, the Ember Crown kept the balance of the wild.',
  'Then came the Sundering. The crown shattered, its King fell hollow, and a violet blight crept over the land.',
  'A hundred years passed. The wild endured — patient, and unbowed.',
  'And this morning, on a hill of soft grass… you woke.'];
const LUMEN_INTRO=[
  {n:'Lumen',t:'Oh! Oh — you\'re awake! I am Lumen, a spark of the old crown. I\'ve waited beside you for… mm. Longer than numbers go.'},
  {n:'Lumen',t:'I can\'t remember what you were. But I remember what you carried: hope. And a sword! I kept it polished.'},
  {n:'Lumen',t:'See that gold light? Emberhearth village. Elder Maren remembers more than anyone alive — let\'s start there. The wild is yours, wanderer. All of it. But start there!'}];
function introAdv(){
  if(G.introT<.5)return;
  G.introI++;G.introT=0;sfx('blip');
  if(G.introI>=INTRO.length){
    setMode('play');
    startDlg(LUMEN_INTRO,{end(){G.mq=0;refreshObjective();autosave();}});
  }
}
/* ================= HUD / render composition ================= */
function drawHUD(){
  if(G.mode==='title'||G.mode==='intro')return;
  const p=G.p;
  const hn=Math.round(p.maxhp/4);
  for(let i=0;i<hn;i++){
    const x=22+(i%10)*20,y=24+Math.floor(i/10)*19;
    const q=clamp(p.hp-i*4,0,4)/4;
    const pu=(p.hp<=4&&Math.sin(G.vt*7)>0)?1.18:1;
    ctx.save();ctx.translate(x,y);ctx.scale(pu,pu);
    heartPath(0,-4,15);ctx.fillStyle='rgba(16,14,13,.62)';ctx.fill();
    if(q>0){ctx.save();heartPath(0,-4,15);ctx.clip();
      ctx.fillStyle=q<1?'#c74a3c':'#e05b4b';
      ctx.fillRect(-9,-10,18*q,24);ctx.restore();}
    heartPath(0,-4,15);ctx.strokeStyle='rgba(242,233,216,.55)';ctx.lineWidth=1.2;ctx.stroke();
    ctx.restore();
  }
  const cy=24+Math.floor((hn-1)/10)*19+22;
  ctx.font='700 12px -apple-system,system-ui,sans-serif';
  ctx.textAlign='left';ctx.textBaseline='middle';
  let cx0=16;
  const counter=(draw,val)=>{
    draw(cx0+6,cy);
    ctx.fillStyle='#f2e9d8';
    ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=3;
    ctx.fillText(String(val),cx0+15,cy+.5);
    ctx.shadowBlur=0;
    cx0+=15+ctx.measureText(String(val)).width+16;
  };
  counter((x,y)=>{dotc(x,y,5.5,'#e8b04a');dotc(x-1.2,y-1.2,2,'#f6d47c');},G.coins);
  if(G.bow)counter((x,y)=>{ctx.save();ctx.translate(x,y);ctx.rotate(-.7);
    rr(-5,-1,10,2,1,'#c9b48f');ctx.fillStyle='#8d8577';
    ctx.beginPath();ctx.moveTo(5,-2.6);ctx.lineTo(8,0);ctx.lineTo(5,2.6);ctx.fill();ctx.restore();},G.arrows);
  if(G.pouch)counter((x,y)=>{dotc(x,y,5,'#3a3f4a');dotc(x-1.4,y-1.6,1.5,'#5c6a7a');},G.bombs);
  if(G.orbs>0)counter((x,y)=>{dotc(x,y,5,'rgba(159,216,255,.9)');dotc(x,y,2,'#e8f4ff');},G.orbs);
  if(G.shards>0)counter((x,y)=>{ctx.fillStyle='#ffb35c';
    ctx.beginPath();ctx.moveTo(x,y-5.5);ctx.lineTo(x+4,y);ctx.lineTo(x,y+5.5);ctx.lineTo(x-4,y);ctx.closePath();ctx.fill();},G.shards+'/4');
  // stamina wheel by the hero
  if(p.st<p.maxst-.5||p.exh){
    const sx=(p.x-G.cam.x)*ZM+VW/2,sy=(p.y-G.cam.y)*ZM+VH/2-36;
    ctx.lineWidth=4.5;ctx.lineCap='round';
    ctx.strokeStyle='rgba(16,14,13,.45)';
    ctx.beginPath();ctx.arc(sx,sy,15,0,TAU);ctx.stroke();
    const fr=clamp(p.st/p.maxst,0,1);
    ctx.strokeStyle=p.exh?(Math.sin(G.vt*12)>0?'#e05b4b':'#7a5450'):(fr<.3?'#e8b04a':'#8fce6a');
    ctx.beginPath();ctx.arc(sx,sy,15,-Math.PI/2,-Math.PI/2+fr*TAU);ctx.stroke();
  }
  // boss bar
  if(G.boss&&G.boss.e&&!G.boss.e.dead&&G.boss.e.hp>0&&G.boss.e.aggro){
    const w=Math.min(430,VW*.66),x0=VW/2-w/2,y0=68;
    ctx.textAlign='center';ctx.font='800 11px -apple-system,system-ui,sans-serif';
    ctx.fillStyle='#f2e9d8';ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=4;
    ctx.fillText(G.boss.name.toUpperCase(),VW/2,y0-8);
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(16,14,13,.66)';
    ctx.beginPath();ctx.roundRect(x0,y0,w,9,4.5);ctx.fill();
    ctx.fillStyle='#e05b4b';
    ctx.beginPath();ctx.roundRect(x0+1.5,y0+1.5,(w-3)*clamp(G.boss.e.hp/G.boss.e.mhp,0,1),6,3);ctx.fill();
  }
  // trial status
  if(G.trial){
    ctx.textAlign='center';ctx.font='800 13px -apple-system,system-ui,sans-serif';
    ctx.fillStyle='#bfe3ff';ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=4;
    ctx.fillText(G.trial.kind==='blades'
      ?'TRIAL OF BLADES — WAVE '+G.trial.wave+'/3'
      :'TRIAL OF SPARKS — '+G.trial.sparks.filter(s=>s.got).length+'/6 · '+Math.ceil(G.trial.t)+'s',
      VW/2,78);
    ctx.shadowBlur=0;
  }
  // floating joystick
  if(joy.active){
    ctx.strokeStyle='rgba(242,233,216,.3)';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(joy.ox,joy.oy,46,0,TAU);ctx.stroke();
    ctx.fillStyle='rgba(242,233,216,.28)';
    ctx.beginPath();ctx.arc(joy.ox+joy.dx,joy.oy+joy.dy,22,0,TAU);ctx.fill();
  }
  // hurt vignette
  if(G.hurtT>0){
    const gr=ctx.createRadialGradient(VW/2,VH/2,Math.min(VW,VH)*.32,VW/2,VH/2,Math.max(VW,VH)*.7);
    gr.addColorStop(0,'rgba(224,91,75,0)');
    gr.addColorStop(1,'rgba(224,91,75,'+(.5*G.hurtT)+')');
    ctx.fillStyle=gr;ctx.fillRect(0,0,VW,VH);
  }
  if(G.mode==='dead'){
    ctx.fillStyle='rgba(14,8,8,'+clamp(G.deadT*.9,0,.78)+')';
    ctx.fillRect(0,0,VW,VH);
    if(G.deadT>.5){
      ctx.textAlign='center';ctx.fillStyle='#f2e9d8';
      ctx.font='800 22px -apple-system,system-ui,sans-serif';
      ctx.fillText('The wild reclaims you…',VW/2,VH*.42);
      if(G.deadT>1.1){
        ctx.font='600 13px -apple-system,system-ui,sans-serif';
        ctx.fillStyle='rgba(242,233,216,.72)';
        ctx.fillText('Tap to rise at the last fire you knew',VW/2,VH*.42+30);
      }
    }
  }
}
function lightPass(){
  const t=G.dayT;
  let na=0;
  if(t>.66)na=Math.min(.58,(t-.66)/.12*.58);
  else if(t<.08)na=.58*(1-t/.08);
  if(na>0){ctx.fillStyle='rgba(10,16,42,'+na+')';ctx.fillRect(0,0,VW,VH);}
  const da=Math.max(0,1-Math.abs(t-.70)/.06)*.16+Math.max(0,1-Math.abs(t-.075)/.05)*.12;
  if(da>0){ctx.fillStyle='rgba(232,110,60,'+da+')';ctx.fillRect(0,0,VW,VH);}
  if(G.rain>0){
    ctx.fillStyle='rgba(30,40,60,.14)';ctx.fillRect(0,0,VW,VH);
    ctx.strokeStyle='rgba(190,215,240,.30)';ctx.lineWidth=1;
    ctx.beginPath();
    const n=G.lowfx?24:54;
    for(let i=0;i<n;i++){
      const sp=600+(i%5)*90;
      const x=((i*97.3+G.vt*sp*.22)%(VW+60))-30;
      const y=((i*151.7+G.vt*sp)%(VH+60))-30;
      ctx.moveTo(x,y);ctx.lineTo(x-3,y+11);
    }
    ctx.stroke();
  }
}
function drawIntro(){
  ctx.fillStyle='#080706';ctx.fillRect(0,0,VW,VH);
  if(!G.lowfx)for(let i=0;i<14;i++){
    const y=VH-((i*89.7+G.vt*26+i*i*7)%(VH+40));
    const x=(i*137.3)%VW+Math.sin(G.vt+i)*20;
    dotc(x,y,1.4,'rgba(232,137,74,'+(.14+(i%3)*.09)+')');
  }
  const line=INTRO[Math.min(G.introI,INTRO.length-1)];
  const a=clamp(G.introT/.9,0,1);
  ctx.globalAlpha=a;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#f2e9d8';
  ctx.font='600 17px Georgia,serif';
  const words=line.split(' ');let rows=[''],ri=0;
  for(const w of words){
    if((rows[ri]+' '+w).length>44){ri++;rows[ri]='';}
    rows[ri]=(rows[ri]+' '+w).trim();
  }
  rows.forEach((r,i)=>ctx.fillText(r,VW/2,VH*.44+i*28-(rows.length-1)*14));
  ctx.globalAlpha=.55;
  ctx.font='600 11px -apple-system,system-ui,sans-serif';
  if(G.introT>1.1)ctx.fillText('tap to continue',VW/2,VH*.44+rows.length*28+16);
  ctx.globalAlpha=1;
}
function render(vdt){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='#0c0b0a';ctx.fillRect(0,0,cv.width,cv.height);
  if(!G.p||!SP){return;}
  if(G.mode==='intro'){ctx.setTransform(DPR,0,0,DPR,0,0);drawIntro();return;}
  const S=ZM*DPR;
  const shx=(Math.random()-.5)*G.shake*DPR,shy=(Math.random()-.5)*G.shake*DPR;
  ctx.setTransform(S,0,0,S,cv.width/2-G.cam.x*S+shx,cv.height/2-G.cam.y*S+shy);
  drawWorld();
  drawTrial();
  drawDrops();
  drawEnts();
  drawPr();
  drawPx(vdt);
  drawFt(vdt);
  drawLumen();
  drawBeams();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  lightPass();
  drawHUD();
}
/* ================= input ================= */
function markTouch(){if(!G.kbSeen)ew.classList.add('touch');$('kbh').style.display='none';}
function bindBtn(el,down,up){
  el.addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();
    markTouch();ensureAC();
    el.classList.add('on');
    try{el.setPointerCapture(e.pointerId);}catch(err){}
    if(down)down();
  });
  const release=e=>{e&&e.stopPropagation();el.classList.remove('on');if(up)up();};
  el.addEventListener('pointerup',release);
  el.addEventListener('pointercancel',release);
}
function bindInputs(){
  bindBtn($('bA'),()=>{inp.aP=true;inp.aH=true;},()=>{inp.aH=false;inp.aR=true;});
  bindBtn($('bB'),()=>{inp.rH=true;inp.rT=G.vt;},()=>{if(G.vt-inp.rT<=.22)inp.rP=true;inp.rH=false;});
  bindBtn($('bW'),()=>{inp.bowH=true;},()=>{inp.bowH=false;inp.bowR=true;});
  bindBtn($('bG'),()=>{inp.bombP=true;},null);
  bindBtn($('ctxb'),()=>{inp.intP=true;},null);
  $('bMap').addEventListener('pointerdown',e=>{e.stopPropagation();markTouch();if(G.mode==='play')openMap();});
  $('bMenu').addEventListener('pointerdown',e=>{e.stopPropagation();markTouch();if(G.mode==='play')openPause();});
  $('mapx').addEventListener('pointerdown',e=>{e.stopPropagation();if(G.mode==='map')setMode('play');});
  $('mapcv').addEventListener('pointerdown',e=>{e.stopPropagation();mapTap(e);});
  $('mtgo').addEventListener('pointerdown',e=>{e.stopPropagation();if(mapSel)travelTo(mapSel.p);});
  $('mtno').addEventListener('pointerdown',e=>{e.stopPropagation();$('mtrav').style.display='none';});
  $('pausov').addEventListener('pointerdown',e=>{if(e.target===$('pausov'))setMode('play');});
  // floating joystick — left half of the screen
  const jz=$('jz');
  jz.addEventListener('pointerdown',e=>{
    e.preventDefault();markTouch();ensureAC();
    if(joy.active)return;
    joy.active=true;joy.id=e.pointerId;
    joy.ox=e.clientX;joy.oy=e.clientY;joy.dx=0;joy.dy=0;
    try{jz.setPointerCapture(e.pointerId);}catch(err){}
  });
  jz.addEventListener('pointermove',e=>{
    if(!joy.active||e.pointerId!==joy.id)return;
    let dx=e.clientX-joy.ox,dy=e.clientY-joy.oy;
    const l=hyp(dx,dy);
    if(l>46){dx=dx/l*46;dy=dy/l*46;}
    joy.dx=dx;joy.dy=dy;
    const dz=l<9?0:1;
    inp.mx=dz*dx/46;inp.my=dz*dy/46;
  });
  const jend=e=>{
    if(e.pointerId!==joy.id)return;
    joy.active=false;joy.id=-1;inp.mx=0;inp.my=0;
  };
  jz.addEventListener('pointerup',jend);
  jz.addEventListener('pointercancel',jend);
  // dialogue box itself also advances (it covers the adv layer)
  $('dlg').addEventListener('pointerdown',e=>{
    e.preventDefault();if(G.mode==='dialog')advDlg();
  });
  // tap-to-advance layer (dialogue / intro / death)
  $('adv').addEventListener('pointerdown',e=>{
    e.preventDefault();markTouch();ensureAC();
    if(G.mode==='dialog')advDlg();
    else if(G.mode==='intro')introAdv();
    else if(G.mode==='dead'&&G.deadT>1)respawn();
  });
  // title buttons
  let newArm=false;
  $('tCont').addEventListener('pointerdown',e=>{
    e.preventDefault();markTouch();ensureAC();
    fadeOut(()=>{setMode('play');refreshObjective();fadeIn(600);},300);
  });
  $('tNew').addEventListener('pointerdown',e=>{
    e.preventDefault();markTouch();ensureAC();
    if(store.get()&&!newArm){newArm=true;$('tNew').textContent='Erase saved journey — tap again';return;}
    newArm=false;store.del();resetState();
    fadeOut(()=>{setMode('intro');G.introI=0;G.introT=0;fadeIn(600);},350);
  });
  // desktop: click the world to slash toward the cursor
  cv.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&G.mode==='play'){
      ensureAC();
      const wx=(e.clientX-VW/2)/ZM+G.cam.x,wy=(e.clientY-VH/2)/ZM+G.cam.y;
      G.p.face=angTo(G.p.x,G.p.y,wx,wy);
      inp.aP=true;inp.aH=true;
    }
  });
  cv.addEventListener('pointerup',e=>{
    if(e.pointerType==='mouse'){inp.aH=false;inp.aR=true;}
  });
  // keyboard
  const GKEYS=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','j','k','l','b','e','m','i','p','z','enter','escape','shift'];
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(GKEYS.includes(k))e.preventDefault();
    if(e.repeat)return;
    keys[k]=true;
    ensureAC();
    if(G.mode==='title'){
      if(k==='enter'){(store.get()?$('tCont'):$('tNew')).dispatchEvent(new PointerEvent('pointerdown'));}
      return;
    }
    if(G.mode==='intro'){if(k==='e'||k==='enter'||k===' ')introAdv();return;}
    if(G.mode==='dead'){if(G.deadT>1)respawn();return;}
    if(G.mode==='dialog'){if(k==='e'||k==='enter'||k===' '||k==='j'||k==='z')advDlg();return;}
    if(G.mode==='map'){if(k==='m'||k==='escape')setMode('play');return;}
    if(G.mode==='pause'){if(k==='escape'||k==='i'||k==='p')setMode('play');return;}
    if(G.mode!=='play')return;
    if(k==='j'||k==='z'||k===' '){inp.aP=true;inp.aH=true;}
    else if(k==='k'||k==='shift'){inp.rH=true;inp.rT=G.vt;}
    else if(k==='l'){inp.bowH=true;}
    else if(k==='b'){inp.bombP=true;}
    else if(k==='e'||k==='enter'){inp.intP=true;}
    else if(k==='m'){openMap();}
    else if(k==='i'||k==='p'||k==='escape'){openPause();}
  });
  window.addEventListener('keyup',e=>{
    const k=e.key.toLowerCase();
    keys[k]=false;
    if(k==='j'||k==='z'||k===' '){inp.aH=false;inp.aR=true;}
    else if(k==='k'||k==='shift'){if(G.vt-inp.rT<=.22)inp.rP=true;inp.rH=false;}
    else if(k==='l'){inp.bowH=false;inp.bowR=true;}
  });
  document.addEventListener('gesturestart',e=>e.preventDefault());
  document.addEventListener('dblclick',e=>e.preventDefault());
  ew.addEventListener('contextmenu',e=>e.preventDefault());
}
/* ================= resize / loop / boot ================= */
function resize(){
  VW=window.innerWidth;VH=window.innerHeight;
  DPR=G.lowfx?1:Math.min(2,window.devicePixelRatio||1);
  ZM=clamp(Math.min(VW,VH)/420,1,2.2);
  cv.width=Math.round(VW*DPR);cv.height=Math.round(VH*DPR);
  cv.style.width=VW+'px';cv.style.height=VH+'px';
  const cs=clamp(ZM*DPR,1,2);
  if(Math.abs(cs-CS)>.26||!G.atlas){
    CS=cs;buildAtlas();
    for(const c of G.chunks.values())c.canvas=null;
    canvasCount=0;
  }
}
let lastT=0,fpsA=16;
function frame(t){
  requestAnimationFrame(frame);
  if(!lastT)lastT=t;
  const dtR=Math.min(.05,(t-lastT)/1000);
  lastT=t;
  G.vt+=dtR;
  fpsA=fpsA*.96+dtR*1000*.04;
  if(!G.lowfx&&G.vt>10&&fpsA>27){G.lowfx=true;resize();}
  let scale=1;
  if(G.freeze>0){G.freeze-=dtR;scale=0;}
  else if(G.slow>0){G.slow-=dtR;scale=.32;}
  const dt=dtR*scale;
  G.shake=Math.max(0,G.shake-dtR*24);
  G.hurtT=Math.max(0,G.hurtT-dtR);
  if(G.mode==='play'){
    G.tm+=dt;
    G.dayT+=dt/DAYLEN;
    if(G.dayT>=1){G.dayT-=1;G.dayN++;}
    G.rainT-=dt;
    if(G.rainT<=0){
      if(G.rain>0){G.rain=0;G.rainT=rnd(70,150);}
      else if(Math.random()<.35){G.rain=1;G.rainT=rnd(24,50);}
      else G.rainT=rnd(40,90);
    }
    updPlayer(dt);
    for(const e of G.ents)
      if(!e.dead&&hyp(e.x-G.p.x,e.y-G.p.y)<840)updEnt(e,dt);
    G.ents=G.ents.filter(e=>!e.dead);
    updPr(dt);updDrops(dt);updTrial(dt);updLumen(dt);
    G.ensT-=dt;
    if(G.ensT<=0){G.ensT=.45;ensureSpawns();}
    G.saveT+=dtR;
    if(G.saveT>12){G.saveT=0;autosave();}
    updCtxBtn();
  }else if(G.mode==='dialog'){
    updDlg(dtR);updLumen(dtR*.5);
  }else if(G.mode==='title'){
    const sx=SP.spawn.tx*TILE+12,sy=SP.spawn.ty*TILE+12;
    G.cam.x=sx+Math.cos(G.vt*.06)*150;
    G.cam.y=sy+Math.sin(G.vt*.045)*100;
  }else if(G.mode==='dead'){
    G.deadT+=dtR;
  }else if(G.mode==='intro'){
    G.introT+=dtR;
  }
  musicTick();
  render(G.mode==='play'?dt:dtR);
}
function boot(){
  initWorld();
  resize();
  bindInputs();
  const has=loadSave();
  if(!has)resetState();
  $('tCont').style.display=has?'block':'none';
  if(!has){$('tNew').classList.remove('ghost');}
  G.introT=0;G.introI=0;G.deadT=0;
  setMode('title');
  if(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches)ew.classList.add('touch');
  else $('kbh').style.display='block';
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){autosave();if(AC)try{AC.suspend();}catch(e){}}
    else if(AC&&G.audio)try{AC.resume();}catch(e){}
  });
  window.addEventListener('pagehide',autosave);
  window.addEventListener('resize',resize);
  window.addEventListener('orientationchange',()=>setTimeout(resize,220));
  requestAnimationFrame(frame);
  setTimeout(()=>fadeIn(800),60);
}
/* hidden handle for automated end-to-end testing */
window.__EW={G,inp,keys,WPN,POIS:()=>POIS,SP:()=>SP,
  tp(x,y){G.p.x=x;G.p.y=y;G.cam.x=x;G.cam.y=y;G.p.vx=0;G.p.vy=0;},
  tpt(tx,ty){this.tp(tx*TILE+12,ty*TILE+12);},
  tileAt,flag,setFlag,mkE,killE,autosave,loadSave,resetState,setMode,advDlg,
  dlg:()=>dlgQ,fps:()=>fpsA,startTrial,objectiveText,
  killAround(r){for(const e of G.ents)if(e.t!=='npc'&&hyp(e.x-G.p.x,e.y-G.p.y)<(r||500))killE(e);},
  give(){G.coins+=200;G.arrows+=30;G.bombs+=8;G.pouch=true;G.bow=true;}};
boot();
})();
