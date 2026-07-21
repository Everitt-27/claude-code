/* ================= UI: dialogue ================= */
let dlgQ=null,dlgBlip=0;
function setMode(m){
  G.mode=m;ew.dataset.mode=m;
  if(m!=='play')$('ctxb').style.display='none';
  if(m==='play')refreshObjective();
}
function startDlg(pages,opts){
  if(!pages||!pages.length){if(opts&&opts.end)opts.end();return;}
  dlgQ={pages,i:0,shown:0,opts:opts||{},prev:G.mode==='dialog'?(dlgQ?dlgQ.prev:'play'):G.mode,choicesShown:false};
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
    if(dlgQ.opts.choices)return;
    closeDlg(null);
  }else{dlgQ.i++;renderDlgPage();sfx('blip');}
}
function closeDlg(sel){
  const q=dlgQ;dlgQ=null;
  setMode(q.prev==='dialog'?'play':(q.prev||'play'));
  if(sel&&sel.f)sel.f();
  if(q.opts.end)q.opts.end();
  if(G.mode==='pause')buildPause();
}
/* ================= toasts / objective / dynamic buttons ================= */
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
/* only show buttons the player can actually use right now */
function refreshButtons(){
  if(!window.document||!$('bA'))return;
  const slots=[[102,34],[112,120],[124,206],[36,200],[178,40]];
  const show={bB:true,bW:!!G.bow,bS:G.spells.length>0,bG:!!G.pouch,
    bP:(G.pot.hp+G.pot.mp)>0};
  let si=0;
  for(const id of['bB','bW','bS','bG','bP']){
    const el=$(id);
    if(show[id]){
      el.classList.remove('off');
      const s=slots[si++];
      el.style.right='calc('+s[0]+'px + env(safe-area-inset-right,0px))';
      el.style.bottom='calc('+s[1]+'px + env(safe-area-inset-bottom,0px))';
    }else el.classList.add('off');
  }
  const fishing=G.p&&G.p.fish&&G.p.fish.st==='bite';
  $('bAl').textContent=fishing?'HOOK!':'ATTACK';
  const sm=$('bS').querySelector('small');
  if(sm&&G.spells.length)sm.textContent=SPELLS[G.spellEq]?SPELLS[G.spellEq].n.toUpperCase():'SPELL';
  $('bPl').textContent=G.pot.hp+'♥ '+G.pot.mp+'✦';
  $('bSkill').classList.toggle('has',BRANCHES.some(b=>(G.pts[b]||0)>0));
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
/* ================= map: travel to anywhere you've discovered ================= */
let mapSel=null;
function openMap(){setMode('map');$('mtrav').style.display='none';
  if(G.inDun)renderDunMap();else renderMap();}
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
  const node=(x,y,p,name,d)=>G.mapNodes.push({x,y,p,name,d});
  for(const p of POIS){
    const seen=flag('seen:'+p.id),{x,y}=ic(p);
    if(p.k==='tower'){
      const on=flag('tower:'+p.id);
      g.fillStyle=on?'#9fd8ff':'#ffb35c';tri(g,x,y,5);
      if(on)node(x,y,p,p.name,'Wayfarer tower — travel point');
    }else if(p.k==='vil'&&seen){
      g.fillStyle='#f2e9d8';g.fillRect(x-3.5,y-2.5,7,6);
      g.fillStyle='#e8894a';g.beginPath();g.moveTo(x-5,y-2.5);g.lineTo(x,y-8);g.lineTo(x+5,y-2.5);g.closePath();g.fill();
      node(x,y,p,p.name,'Village — rest, trade, travel');
      if(flag('home:'+p.vi)){g.fillStyle='#8fce6a';g.fillRect(x+4,y-7,3,3);}
    }else if(p.k==='shrine'&&(seen||flag('shrine:'+p.id))){
      const done=flag('shrine:'+p.id);
      g.fillStyle=done?'#9fd8ff':'#617286';diam(g,x,y,4.5);
      node(x,y,p,'Ancient Shrine',done?'Trial passed — travel point':'Undiscovered trial — travel point');
    }else if(p.k==='fire'&&seen){
      g.fillStyle='#e8894a';g.beginPath();g.arc(x,y,2.6,0,TAU);g.fill();
      node(x,y,p,'Campfire','Wayside camp — travel point');
    }else if(p.k==='dock'&&seen){
      g.fillStyle='#bfe3ff';g.fillRect(x-1.2,y-5,2.4,8);g.beginPath();g.arc(x,y+3,3.4,.2,Math.PI-.2);g.fill();
      node(x,y,p,p.name,'Harbour — travel point');
    }else if(p.k==='camp'&&seen&&flag('camp:'+p.id)){
      g.fillStyle='#8d8577';g.beginPath();g.moveTo(x-4,y+3);g.lineTo(x,y-4);g.lineTo(x+4,y+3);g.closePath();g.fill();
      node(x,y,p,'Cleared Camp','Broken camp — travel point');
    }else if(p.k==='ruins'&&G.mq>=2){
      const dead=flag('warden:'+p.id);
      g.fillStyle=dead?'#6a6458':'#e05b4b';
      g.beginPath();g.arc(x,y,4.4,0,TAU);g.fill();
      g.fillStyle='#161311';g.fillRect(x-2.5,y-1.5,2,2);g.fillRect(x+.5,y-1.5,2,2);
      if(seen)node(x,y,p,p.name,dead?'Silent ruins — travel point':'A Warden broods here — travel point');
    }else if(p.k==='cit'&&(G.mq>=2||seen)){
      g.fillStyle='#b78ad2';
      g.beginPath();g.moveTo(x-6,y+5);g.lineTo(x-6,y-3);g.lineTo(x-3,y-1);g.lineTo(x,y-7);g.lineTo(x+3,y-1);g.lineTo(x+6,y-3);g.lineTo(x+6,y+5);g.closePath();g.fill();
      if(seen)node(x,y,p,'Sunken Citadel','The hollow heart — travel point');
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
  if(G.boat){
    g.fillStyle='#f2e9d8';
    g.fillRect(G.boat.x/(WORLD*TILE)*size-2,G.boat.y/(WORLD*TILE)*size-2,4,4);
  }
  const px=G.p.x/(WORLD*TILE)*size,py=G.p.y/(WORLD*TILE)*size;
  g.save();g.translate(px,py);g.rotate(G.p.face+Math.PI/2);
  g.fillStyle='#fff';g.strokeStyle='#161311';g.lineWidth=1.5;
  g.beginPath();g.moveTo(0,-7);g.lineTo(5,6);g.lineTo(0,3);g.lineTo(-5,6);g.closePath();g.fill();g.stroke();
  g.restore();
  g.strokeStyle='rgba(242,233,216,.2)';g.lineWidth=1;g.strokeRect(.5,.5,size-1,size-1);
}
function mapTap(ev){
  if(G.inDun)return;
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
    if(G.p.mount)dismount();
    G.p.x=p.tx*TILE+12;G.p.y=p.ty*TILE+44;
    G.p.act='';G.p.vx=0;G.p.vy=0;G.p.kbx=0;G.p.kby=0;G.p.fish=null;
    G.cam.x=G.p.x;G.cam.y=G.p.y;G.lum.x=G.p.x;G.lum.y=G.p.y-30;
    G.pr=[];G.boss=null;
    if(G.horse){G.horse.x=G.p.x+22;G.horse.y=G.p.y+10;}
    if(G.trial)failTrial('The shrine releases you.');
    ensureTeam();
    reveal(p.tx,p.ty,3);
    autosave();
    fadeIn(500);
  },380);
}
/* ================= skill tree ================= */
function openSkills(){setMode('skills');buildSkills();}
function buildSkills(){
  const el=$('skillin');
  let h='<div class="ovh"><b>SKILLS — GROW HOW YOU LIVE</b><div class="chip eq" data-a="close">Done ▸</div></div>';
  h+='<div style="font-size:12px;line-height:1.5;color:rgba(242,233,216,.6);margin-bottom:12px">The wild remembers what you practice. Each path earns its own points — spend them only there. No two wanderers grow alike.</div>';
  for(const br of BRANCHES){
    const info=BRINFO[br],lvl=lvlFor(G.xp[br]),pts=G.pts[br]||0;
    const cur=XPLVL[Math.min(lvl,XPLVL.length-1)],next=XPLVL[Math.min(lvl+1,XPLVL.length-1)];
    const fr=lvl>=XPLVL.length-1?1:clamp((G.xp[br]-cur)/Math.max(1,next-cur),0,1);
    h+='<div class="brcol"><div class="brh"><b style="color:'+info.c+'">'+info.n+' · Rank '+lvl+
      (pts?' · <span style="color:#ffd66e">'+pts+' point'+(pts>1?'s':'')+'</span>':'')+
      '</b><span>from '+info.src+'</span></div>';
    h+='<div class="xpbar"><i style="width:'+(fr*100)+'%;background:'+info.c+'"></i></div><div class="skrow">';
    for(const id in SKILLS){
      const s=SKILLS[id];if(s.br!==br)continue;
      const own=hasSkill(id);
      const prev=Object.keys(SKILLS).find(k=>SKILLS[k].br===br&&SKILLS[k].tier===s.tier-1);
      const needLvl=s.tier===1?1:(s.tier===2?2:4);
      const can=!own&&lvl>=needLvl&&pts>0&&(!prev||hasSkill(prev));
      h+='<div class="skcard'+(own?' own':(can?' can':''))+'" data-sk="'+id+'"><b>'+s.n+'</b>'+s.d+
        (own||can?'':' · needs rank '+needLvl)+'</div>';
    }
    h+='</div></div>';
  }
  el.innerHTML=h;
  el.querySelector('[data-a="close"]').addEventListener('pointerdown',ev=>{ev.stopPropagation();setMode('play');});
  el.querySelectorAll('[data-sk]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();
    if(learnSkill(b.dataset.sk))buildSkills();
    else sfx('err');
  }));
}
/* ================= crafting / smithing ================= */
function openCraft(){setMode('craft');buildCraft();}
function recipeName(rec){
  if(rec.n)return rec.n;
  if(rec.k.startsWith('A:'))return ARM[rec.k.slice(2)].n;
  return WPN[rec.k].n;
}
function recipeDesc(rec){
  if(rec.k.startsWith('A:'))return 'Armor · def '+ARM[rec.k.slice(2)].def;
  if(rec.k.startsWith('I:'))return 'Supplies';
  const w=WPN[rec.k];
  return w.t+' · dmg '+w.d+(w.rc>4?' · long reach':'')+(w.spd>1.2?' · fast':(w.spd<.8?' · heavy':''));
}
function buildCraft(){
  const el=$('craftin');
  let h='<div class="ovh"><b>'+(hasSkill('smith')?'FIELD SMITHING':'THE FORGE')+'</b><div class="chip eq" data-a="close">Done ▸</div></div>';
  h+='<div id="pstats"><span><i>🪵</i>'+G.mat.wood+' wood</span><span><i>⛏</i>'+G.mat.ore+' ore</span>'+
     '<span><i>🟫</i>'+G.mat.leather+' leather</span><span><i>◉</i>'+G.coins+' coins</span></div>';
  h+='<div class="ph">Craft</div>';
  RECIPES.forEach((rec,i)=>{
    const ok=canAfford(rec);
    const cost=[rec.w?rec.w+' wood':'',rec.o?rec.o+' ore':'',rec.l?rec.l+' leather':'',rec.c?rec.c+'c':''].filter(Boolean).join(' + ');
    h+='<div class="recrow"><div><b>'+recipeName(rec)+'</b><span>'+recipeDesc(rec)+' · '+cost+'</span></div>'+
      '<div class="chip'+(ok?' eq':'')+'" data-cr="'+i+'" style="'+(ok?'':'opacity:.4')+'">Craft</div></div>';
  });
  const worn=[];
  G.inv.w.forEach((w,i)=>{if(w.dur<w.mx)worn.push({inst:w,i,arm:0});});
  G.inv.a.forEach((a,i)=>{if(a.dur<a.mx&&ARM[a.k].def>0)worn.push({inst:a,i,arm:1});});
  if(worn.length){
    h+='<div class="ph">Repair — 1 '+'ore (weapons) / leather or ore (armor)</div>';
    worn.forEach((w,j)=>{
      const n=w.arm?aDef(w.inst).n:wDef(w.inst).n;
      h+='<div class="recrow"><div><b>'+n+'</b><div class="durbar"><i style="width:'+Math.max(0,w.inst.dur)+'%;background:'+(w.inst.dur<25?'#e05b4b':'#8fce6a')+'"></i></div></div>'+
        '<div class="chip eq" data-rep="'+j+'">Repair</div></div>';
    });
    el.dataset.worn='1';
  }
  const ups=G.inv.w.map((w,i)=>({w,i})).filter(x=>x.w.up<(hasSkill('master')?5:3));
  if(ups.length){
    h+='<div class="ph">Upgrade — 2 ore + coins</div>';
    ups.slice(0,6).forEach(u=>{
      h+='<div class="recrow"><div><b>'+wDef(u.w).n+' +'+u.w.up+'</b><span>→ +'+(u.w.up+1)+' dmg · 2 ore + '+(20*(u.w.up+1))+'c</span></div>'+
        '<div class="chip eq" data-up="'+u.i+'">Upgrade</div></div>';
    });
  }
  el.innerHTML=h;
  el.querySelector('[data-a="close"]').addEventListener('pointerdown',ev=>{ev.stopPropagation();setMode('play');});
  el.querySelectorAll('[data-cr]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();
    if(doCraft(RECIPES[+b.dataset.cr]))buildCraft();
  }));
  const wornList=worn;
  el.querySelectorAll('[data-rep]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();
    const w=wornList[+b.dataset.rep];
    if(w&&repairInst(w.inst,!!w.arm))buildCraft();
  }));
  el.querySelectorAll('[data-up]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();
    if(upgradeInst(G.inv.w[+b.dataset.up]))buildCraft();
  }));
}
/* ================= pause sheet ================= */
function openPause(){setMode('pause');buildPause();autosave();}
let eraseArm=false;
function gearDlg(inst,isArm){
  const ch=[];
  if(isArm){
    if(G.inv.a[G.eqA]!==inst)ch.push({t:'Wear it',f(){G.eqA=G.inv.a.indexOf(inst);sfx('pick');}});
  }else{
    if(G.inv.w[G.eqM]!==inst)ch.push({t:'Equip — main hand',f(){
      const i=G.inv.w.indexOf(inst);
      if(G.eqO===i)G.eqO=-1;
      G.eqM=i;sfx('pick');}});
    const oneHand=['sword','dagger','axe'].includes(wDef(inst).t);
    if(oneHand&&G.inv.w[G.eqO]!==inst&&G.inv.w[G.eqM]!==inst)
      ch.push({t:'Equip — off hand (dual wield)',f(){G.eqO=G.inv.w.indexOf(inst);sfx('pick');}});
    if(G.inv.w[G.eqO]===inst)ch.push({t:'Lower off-hand',f(){G.eqO=-1;sfx('pick');}});
  }
  if(inst.dur<inst.mx&&(isArm?aDef(inst).def>0:true))
    ch.push({t:'Repair ('+(isArm?'1 leather/ore':'1 ore')+')',f(){repairInst(inst,isArm);}});
  ch.push({t:'Back',f(){}});
  const n=RARN[inst.rar||0]+instName(inst)+(inst.up?' +'+inst.up:'');
  const aff=[];
  if(inst.pre)aff.push(PREFIX[inst.pre].n);
  if(inst.suf)aff.push(SUFFIX[inst.suf].n);
  startDlg([{n,t:(isArm?'Defense '+(aDef(inst).def+affix(inst,'def')):'Damage '+wDmg(inst)+' · '+wDef(inst).t)+
    ' · condition '+Math.max(0,Math.round(inst.dur))+'%'+(aff.length?' · '+aff.join(', '):'')}],
    {choices:ch.slice(0,5)});
}
function buildPause(){
  const p=G.p;
  const arm=eqArm();
  let h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'+
    '<div style="font-size:19px;font-weight:800;letter-spacing:.08em">EMBERWILD</div>'+
    '<div class="chip eq" data-act="resume">Resume ▸</div></div>';
  h+='<div id="pstats">'+
    '<span><i>♥</i>'+(Math.round(p.hp/4*10)/10)+' / '+(totHp()/4)+'</span>'+
    (G.hlvl>0?'<span><i>✧</i>Lv '+G.hlvl+'</span>':'')+
    '<span><i>⚡</i>'+Math.round(p.maxst)+'</span>'+
    (G.spells.length?'<span><i>✦</i>'+Math.round(G.mana)+'/'+maxMana()+' mana</span>':'')+
    '<span><i>🛡</i>def '+(arm?aDef(arm).def:0)+'</span>'+
    '<span><i>⚔</i>dmg '+wDmg(eqMain())+(eqOff()?' + '+wDmg(eqOff()):'')+'</span>'+
    '<span><i>◉</i>'+G.coins+'</span></div>';
  h+='<div class="chips" style="margin-top:8px">'+
    '<div class="chip eq" data-act="skills">☆ Skills'+(BRANCHES.some(b=>G.pts[b]>0)?' •':'')+'</div>'+
    (G.scrolls>0?'<div class="chip" data-act="scroll">📜 Read Return Scroll</div>':'')+
    (canCraftHere()?'<div class="chip eq" data-act="craft">⚒ Smithing</div>':'<div class="chip" style="opacity:.45">⚒ Smithing — find a forge or learn Blacksmith</div>')+
    '</div>';
  h+='<div class="ph">Weapons — tap to equip / dual wield / repair</div><div class="chips">';
  G.inv.w.forEach((w,i)=>{
    const eq=i===G.eqM?' · MAIN':(i===G.eqO?' · OFF':'');
    h+='<div class="chip'+(eq?' eq':'')+'" data-wi="'+i+'" style="border-color:'+instColor(w)+'66">'+
      '<span style="color:'+instColor(w)+'">'+instName(w)+'</span>'+(w.up?' +'+w.up:'')+
      '<small>'+eq+'</small><div class="durbar"><i style="width:'+Math.max(0,w.dur)+'%;background:'+(w.dur<25?'#e05b4b':'#8fce6a')+'"></i></div></div>';
  });
  if(!G.inv.w.length)h+='<div class="chip" style="opacity:.5">Bare fists — craft or find a weapon</div>';
  h+='</div><div class="ph">Armor</div><div class="chips">';
  G.inv.a.forEach((a,i)=>{
    h+='<div class="chip'+(i===G.eqA?' eq':'')+'" data-ai="'+i+'" style="border-color:'+instColor(a)+'66">'+
      '<span style="color:'+instColor(a)+'">'+instName(a)+'</span>'+
      '<small> · def '+aDef(a).def+'</small><div class="durbar"><i style="width:'+Math.max(0,a.dur)+'%;background:'+(a.dur<25?'#e05b4b':'#8fce6a')+'"></i></div></div>';
  });
  h+='</div><div class="ph">Materials & Supplies</div><div id="pstats">'+
    '<span><i>🪵</i>'+G.mat.wood+'</span><span><i>⛏</i>'+G.mat.ore+'</span><span><i>🟫</i>'+G.mat.leather+'</span>'+
    (G.bow?'<span><i>➶</i>'+G.arrows+'</span>':'')+
    (G.pouch?'<span><i>●</i>'+G.bombs+'</span>':'')+
    (G.rod?'<span><i>🎣</i>rod</span>':'')+
    '<span><i>🧪</i>'+G.pot.hp+'♥ '+G.pot.mp+'✦</span>'+
    (G.scrolls?'<span><i>📜</i>'+G.scrolls+'</span>':'')+
    '<span><i>✦</i>'+G.orbs+' orbs</span>'+
    (G.shards?'<span><i>♦</i>'+G.shards+'/4</span>':'')+'</div>';
  if(G.spells.length){
    h+='<div class="ph">Spells — tap to ready</div><div class="chips">';
    for(const s of G.spells)
      h+='<div class="chip'+(G.spellEq===s?' eq':'')+'" data-sp="'+s+'" style="border-color:'+SPELLS[s].c+'55">'+SPELLS[s].n+'<small> · '+SPELLS[s].mp+' mana</small></div>';
    h+='</div>';
  }
  const foods=Object.keys(G.food).filter(k=>G.food[k]>0);
  h+='<div class="ph">Food — tap to eat</div><div class="chips">';
  if(!foods.length)h+='<div class="chip" style="opacity:.5">Pockets empty — forage, hunt, fish</div>';
  for(const f of foods)
    h+='<div class="chip" data-food="'+f+'">'+FOODS[f].n+' ×'+G.food[f]+' <small>· +'+(FOODS[f].h/4)+'♥</small></div>';
  h+='</div>';
  if(G.team.length){
    h+='<div class="ph">Company ('+G.team.length+'/4) — talk to them in the field to gear or dismiss</div>';
    for(const m of G.team){
      const e=G.ents.find(x=>x.t==='ally'&&x.key===m.key);
      h+='<div class="qrow"><b>'+ALLYDEF[m.key].n+'</b><span>'+ALLYDEF[m.key].cls+
        (m.w?' · carries '+wDef(m.w).n:'')+(e&&e.down?' · DOWN':'')+'</span></div>';
    }
  }
  const props=[];
  SP.vils.forEach((v,i)=>{if(flag('home:'+i))props.push('Home in '+v.name);});
  SP.vils.forEach((v,i)=>{if(flag('land:'+i))props.push('Farmland near '+v.name);});
  if(G.horse)props.push('Ember the horse');
  if(G.boat)props.push('A sailing boat');
  if(props.length){
    h+='<div class="ph">Holdings</div>';
    for(const pr of props)h+='<div class="qrow"><b>'+pr+'</b></div>';
  }
  h+='<div class="ph">Quests</div>';
  for(const q of questLog())
    h+='<div class="qrow'+(q.done?' qdone':'')+'"><b>'+q.t+'</b><span>'+q.d+'</span></div>';
  h+='<div class="ph">Settings</div><div class="chips">'+
    '<div class="chip" data-act="audio">Sound: '+(G.audio?'On':'Off')+'</div>'+
    '<div class="chip" data-act="fx">Effects: '+(G.lowfx?'Battery saver':'Full')+'</div>'+
    '<div class="chip" data-act="erase">'+(eraseArm?'Tap again to erase journey':'New game (erase)')+'</div></div>';
  h+='<div class="ph">How to play</div><div class="helpt">'+
    'Touch — left half: move · ⚔ tap: combo, hold: spin · ↷ tap: dodge-roll, hold: sprint · dodge at the last instant to slow time. Buttons appear as you earn their gear.<br>'+
    'Keys — WASD move · J attack · K roll/sprint · L bow · V spell · B bomb · E interact · T skills · M map · Esc menu.<br><br>'+
    'The wild remembers what you practice: fighting, sneaking, crafting and talking each grow their own skill path. Weapons slowly wear with use — repair them with ore at any forge (or anywhere, once you learn Blacksmith), or lose them forever. Trust is earned and spent: villagers with high trust give discounts, secrets, and up to four will fight at your side. Homes, farmland, horses and boats are for sale if your pockets are deep. '+
    (storageOK?'Your journey autosaves on this device.':'Autosave is session-only here (storage unavailable).')+'</div>';
  const el=$('pausin');el.innerHTML=h;
  el.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();const act=b.dataset.act;
    if(act==='resume'){eraseArm=false;setMode('play');}
    else if(act==='skills'){openSkills();}
    else if(act==='craft'){if(canCraftHere())openCraft();}
    else if(act==='scroll'){setMode('play');useScroll();}
    else if(act==='audio'){G.audio=!G.audio;if(G.audio)ensureAC();buildPause();}
    else if(act==='fx'){G.lowfx=!G.lowfx;resize();buildPause();}
    else if(act==='erase'){
      if(!eraseArm){eraseArm=true;buildPause();}
      else{eraseArm=false;store.del();resetState();setMode('title');
        $('tCont').style.display='none';fadeIn(400);}
    }
  }));
  el.querySelectorAll('[data-wi]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();gearDlg(G.inv.w[+b.dataset.wi],false);
  }));
  el.querySelectorAll('[data-ai]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();gearDlg(G.inv.a[+b.dataset.ai],true);
  }));
  el.querySelectorAll('[data-sp]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();G.spellEq=b.dataset.sp;sfx('pick');refreshButtons();buildPause();
  }));
  el.querySelectorAll('[data-food]').forEach(b=>b.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();const f=b.dataset.food;
    if(G.p.hp>=G.p.maxhp){toast('Hearts already full');return;}
    if(G.food[f]>0){G.food[f]--;G.p.hp=Math.min(G.p.maxhp,G.p.hp+FOODS[f].h);
      sfx('heal');buildPause();}
  }));
}
/* ================= save / load (v2, migrates v1) ================= */
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
  const sx=G.inDun&&G.dun?G.dun.surfX:G.p.x,sy=G.inDun&&G.dun?G.dun.surfY:G.p.y;
  return JSON.stringify({v:2,px:Math.round(sx),py:Math.round(sy),
    hp:G.p.hp,maxhp:G.p.maxhp,st:Math.round(G.p.st),maxst:G.p.maxst,
    coins:G.coins,arrows:G.arrows,bombs:G.bombs,orbs:G.orbs,shards:G.shards,
    invW:G.inv.w,invA:G.inv.a,eqM:G.eqM,eqO:G.eqO,eqA:G.eqA,
    mat:G.mat,xp:G.xp,pts:G.pts,skills:G.skills,
    spells:G.spells,spellEq:G.spellEq,mana:Math.round(G.mana),
    trust:G.trust,team:G.team,horse:G.horse,boat:G.boat,rod:G.rod,
    bow:G.bow,pouch:G.pouch,food:G.food,
    mq:G.mq,q:G.q,flags:G.flags,stats:G.stats,dayT:G.dayT,dayN:G.dayN,
    pot:G.pot,scrolls:G.scrolls,hxp:G.hxp,hlvl:G.hlvl,
    hardcore:G.hardcore,origin:G.origin,
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
    if((d.v!==1&&d.v!==2)||typeof d.px!=='number')return false;
    G.healed=!!d.healed;clearWorldCache();
    G.p=newPlayer(d.px,d.py);
    G.p.hp=d.hp;G.p.maxhp=d.maxhp;G.p.st=d.st;G.p.maxst=d.maxst;
    G.coins=d.coins||0;G.arrows=d.arrows||0;G.bombs=d.bombs||0;
    G.orbs=d.orbs||0;G.shards=d.shards||0;
    if(d.v===2){
      G.inv.w=Array.isArray(d.invW)?d.invW:[mkInst('rusty')];
      G.inv.a=Array.isArray(d.invA)&&d.invA.length?d.invA:[{k:'cloth',dur:100,mx:100,up:0}];
      G.eqM=typeof d.eqM==='number'?d.eqM:0;
      G.eqO=typeof d.eqO==='number'?d.eqO:-1;
      G.eqA=typeof d.eqA==='number'?d.eqA:0;
      G.mat=Object.assign({wood:0,ore:0,leather:0},d.mat||{});
      G.xp=Object.assign({},G.xp,d.xp||{});
      G.pts=Object.assign({},G.pts,d.pts||{});
      G.skills=d.skills||{};
      G.spells=d.spells||[];G.spellEq=d.spellEq||(G.spells[0]||'');
      G.mana=typeof d.mana==='number'?d.mana:50;
      G.trust=d.trust||{};G.team=Array.isArray(d.team)?d.team:[];
      G.horse=d.horse||null;G.boat=d.boat||null;G.rod=!!d.rod;
      G.pot=Object.assign({hp:0,mp:0},d.pot||{});
      G.scrolls=d.scrolls||0;G.hxp=d.hxp||0;G.hlvl=d.hlvl||0;
      G.hardcore=!!d.hardcore;G.origin=d.origin||'';
    }else{ /* migrate v1 → instances */
      const wpns=Array.isArray(d.wpns)?d.wpns:['rusty'];
      G.inv.w=wpns.map(k=>mkInst(k));
      G.inv.a=[{k:'cloth',dur:100,mx:100,up:0}];
      G.eqM=Math.max(0,wpns.indexOf(d.wpn||'rusty'));
      G.eqO=-1;G.eqA=0;
      G.mat={wood:0,ore:0,leather:0};
      G.skills={};G.spells=[];G.spellEq='';G.mana=50;
      G.trust={};G.team=[];G.horse=null;G.boat=null;G.rod=false;
      G.pot={hp:1,mp:0};G.scrolls=0;G.hxp=0;G.hlvl=0;G.hardcore=false;G.origin='';
    }
    G.bow=!!d.bow;G.pouch=!!d.pouch;
    G.food=d.food||{};G.mq=(typeof d.mq==='number')?d.mq:0;G.q=d.q||{};
    G.flags=d.flags||{};G.stats=Object.assign(G.stats,d.stats||{});
    G.dayT=d.dayT||.3;G.dayN=d.dayN||1;G.lastSafe=d.lastSafe||null;
    if(typeof d.audio==='boolean')G.audio=d.audio;
    expDecode(d.exp||'');
    G.eqM=clamp(G.eqM,-1,G.inv.w.length-1);
    if(G.eqO>=G.inv.w.length)G.eqO=-1;
    G.eqA=clamp(G.eqA,0,G.inv.a.length-1);
    G.cam.x=G.p.x;G.cam.y=G.p.y;G.lum.x=G.p.x;G.lum.y=G.p.y-30;
    refreshButtons();
    return true;
  }catch(e){return false;}
}
function resetState(){
  G.flags={};G.q={};G.mq=-1;
  G.stats={chests:0,shrines:0,stones:0,kills:0,deaths:0,steps:0,fish:0,hunts:0,crafted:0};
  G.explored=new Uint8Array(EGRID*EGRID);
  G.ents=[];G.pr=[];G.px=[];G.ft=[];G.drops=[];
  G.camps=new Map();G.trial=null;G.boss=null;G.cutBush=new Set();
  G.coins=0;G.arrows=0;G.bombs=0;G.orbs=0;G.shards=0;
  G.inv={w:[mkInst('rusty')],a:[{k:'cloth',dur:100,mx:100,up:0}]};
  G.eqM=0;G.eqO=-1;G.eqA=0;
  G.mat={wood:0,ore:0,leather:0};
  G.xp={};G.pts={};BRANCHES.forEach(b=>{G.xp[b]=0;G.pts[b]=0;});
  G.skills={};G.spells=[];G.spellEq='';G.mana=50;G.manaCd=0;
  G.trust={};G.team=[];G.horse=null;G.boat=null;G.rod=false;
  G.pot={hp:1,mp:0};G.scrolls=0;G.hxp=0;G.hlvl=0;G.hardcore=false;G.origin='';
  G.inDun=false;G.dun=null;G.portal=null;G.pburn=0;G.chill=0;
  G.brokenUrns=new Set();G.takenGold=new Set();
  G.bow=false;G.pouch=false;G.food={apple:2};
  G.healed=false;G.dayT=.30;G.dayN=1;G.hurtT=0;G.slow=0;G.freeze=0;
  clearWorldCache();
  const sx=SP.spawn.tx*TILE+12,sy=SP.spawn.ty*TILE+12;
  G.p=newPlayer(sx,sy);
  G.cam.x=sx;G.cam.y=sy;G.lum.x=sx;G.lum.y=sy-30;
  G.lastSafe={x:sx,y:sy};
  refreshObjective();refreshButtons();
}
/* ================= death / ending / intro ================= */
function die(){
  if(G.mode==='dead')return;
  G.stats.deaths++;
  if(G.trial)failTrial('The trial releases you.');
  G.boss=null;G.deadT=0;
  if(G.p.mount)dismount();
  setMode('dead');sfx('roar');
}
function hardcoreEnd(){
  store.del();
  fadeOut(()=>{
    resetState();
    $('tCont').style.display='none';
    setMode('title');
    toast('The tale ends where it ends. Hardcore keeps no drafts.');
    fadeIn(800);
  },600);
}
function respawn(){
  fadeOut(()=>{
    if(G.inDun){G.inDun=false;G.dun=null;}
    G.portal=null;G.pburn=0;G.chill=0;
    const s=G.lastSafe||{x:SP.spawn.tx*TILE+12,y:SP.spawn.ty*TILE+12};
    G.p.x=s.x;G.p.y=s.y;G.p.hp=totHp();G.p.st=totSt();
    G.p.iv=1.5;G.p.act='';G.p.exh=false;G.p.vx=0;G.p.vy=0;G.p.kbx=0;G.p.kby=0;
    G.mana=maxMana();
    for(const e of G.ents)if(e.t!=='npc'&&e.t!=='ally')e.dead=true;
    for(const e of G.ents)if(e.t==='ally'){e.down=false;e.hp=e.mhp;}
    G.camps.forEach(c=>c.spawned=false);
    G.pr=[];G.cam.x=s.x;G.cam.y=s.y;
    ensureTeam();
    setMode('play');autosave();fadeIn(600);
  },420);
}
function endingStart(){
  G.freeze=1.2;
  const f=$('fade');
  f.style.background='#f6edd9';
  fadeOut(()=>{
    G.healed=true;clearWorldCache();
    G.ents=G.ents.filter(e=>e.t==='npc'||e.t==='ally');
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
        {n:'',t:'Your tale: '+G.dayN+' day'+(G.dayN>1?'s':'')+' · '+G.stats.shrines+' shrines · '+G.stats.chests+' chests · '+G.stats.kills+' foes · '+G.stats.crafted+' things forged · '+G.stats.fish+' fish · '+G.stats.deaths+' falls. It is written in the grass.'}],
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
/* ================= HUD / render ================= */
/* ---- Diablo-style HUD furniture ---- */
const QTITLES=['The Waking Hill','Eyes Above the Wild','The Shattered Crown','The Sunken Gate','The Hollow King','The Healed Wild'];
const GOLD='#c8a35a',PARCH='#e8dcc0';
let SAT=0,SAB=0;
let znCache='',znT=-9;
function zoneName(){
  if(G.vt-znT<1&&znCache)return znCache;
  znT=G.vt;
  if(G.inDun&&G.dun)return znCache='The Barrow · Depth '+G.dun.depth;
  let best=null,bd=1e9;
  for(const p of POIS){
    if(!p.name)continue;
    const d=hyp(p.tx*TILE+12-G.p.x,p.ty*TILE+12-G.p.y);
    if(d<bd){bd=d;best=p;}
  }
  if(best&&bd<200)return znCache=best.name;
  const t=tileAt(Math.floor(G.p.x/TILE),Math.floor(G.p.y/TILE));
  return znCache=
    t===T_DESERT||t===T_CACTUS?'The Shifting Waste'
    :t===T_SNOW||t===T_STREE?'Frostreach'
    :t===T_SWAMP||t===T_SWATER?'The Mire'
    :t===T_ROCK?'The Grey Crags'
    :t===T_FGRASS||t===T_TREE?'The Deepwood'
    :t===T_SAND?'The Strand'
    :WATERT(t)?'Open Water'
    :t===T_ASH||t===T_BLIGHT?'The Sunken Blight'
    :'The Emberwild';
}
function clockStr(){
  const h24=(G.dayT*24+6)%24;
  let hh=Math.floor(h24);
  const mm=Math.floor((h24-hh)*60),ap=hh<12?'AM':'PM';
  hh=hh%12;if(hh===0)hh=12;
  return hh+':'+(mm<10?'0':'')+mm+' '+ap;
}
/* live minimap in a gilt parchment frame */
let mmCv=null,mmG=null,mmT=-9,mmDun=false;
function drawMiniMap(x,y,w){
  const px=Math.round(w*DPR);
  if(!mmCv){mmCv=document.createElement('canvas');mmG=mmCv.getContext('2d');}
  if(mmCv.width!==px){mmCv.width=px;mmCv.height=px;mmT=-9;}
  if(G.vt-mmT>.45||mmDun!==G.inDun){
    mmT=G.vt;mmDun=G.inDun;
    const g=mmG,S=px;
    g.setTransform(1,0,0,1,0,0);
    g.fillStyle='#12100a';g.fillRect(0,0,S,S);
    if(G.inDun&&G.dun){
      const cs=S/DUNW;
      for(let ty2=0;ty2<DUNW;ty2++)for(let tx2=0;tx2<DUNW;tx2++)
        if(dunTileAt(tx2,ty2)===T_STONE){g.fillStyle='#575062';g.fillRect(tx2*cs,ty2*cs,cs+.5,cs+.5);}
      for(const pr of G.dun.props){
        const qx=pr.x/(DUNW*TILE)*S,qy=pr.y/(DUNW*TILE)*S;
        if(pr.t==='stairsD'){g.fillStyle='#ffd66e';g.fillRect(qx-2,qy-2,5,5);}
        else if(pr.t==='stairsU'){g.fillStyle='#9fd8ff';g.fillRect(qx-2,qy-2,5,5);}
        else if(pr.t==='torch'){g.fillStyle='#c8763c';g.fillRect(qx-1,qy-1,2,2);}
      }
    }else{
      const R=13,pcx=Math.floor(G.p.x/TILE/ECELL),pcy=Math.floor(G.p.y/TILE/ECELL);
      const cs=S/(R*2+1);
      for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){
        const cx2=pcx+i,cy2=pcy+j;
        if(cx2<0||cy2<0||cx2>=EGRID||cy2>=EGRID)continue;
        if(!G.explored[cx2+cy2*EGRID])continue;
        const t=baseTileAt(cx2*ECELL+4,cy2*ECELL+4);
        g.fillStyle=WATERT(t)?'#4e6675':(t===T_ROCK?'#7e786c':(t===T_SAND||t===T_DESERT?'#b5a67f'
          :(t===T_SNOW||t===T_STREE?'#c2cbd2':(t===T_ASH||t===T_BLIGHT?'#5d5157':'#9aa077'))));
        g.fillRect((i+R)*cs,(j+R)*cs,cs+.6,cs+.6);
      }
      const mark=(tx2,ty2,c,r2)=>{
        const ix=tx2/ECELL-pcx,iy=ty2/ECELL-pcy;
        if(Math.abs(ix)>R||Math.abs(iy)>R)return;
        g.save();g.translate((ix+R)*cs,(iy+R)*cs);g.rotate(Math.PI/4);
        g.fillStyle=c;g.fillRect(-r2,-r2,r2*2,r2*2);g.restore();
      };
      for(const p of POIS){
        if(p.k==='vil'&&flag('seen:v'+p.vi))mark(p.tx,p.ty,'#e0c060',3);
        else if(p.k==='tower'&&flag('tower:'+p.id))mark(p.tx,p.ty,'#7fb8d8',2.5);
        else if(p.k==='delve'&&hyp(p.tx*TILE-G.p.x,p.ty*TILE-G.p.y)<1400)mark(p.tx,p.ty,'#8f65ad',2.5);
      }
      for(const t of questTargets())mark(Math.floor(t.x/TILE),Math.floor(t.y/TILE),'#ffd66e',3);
    }
    g.fillStyle='rgba(203,190,150,.13)';g.fillRect(0,0,S,S);
    const eg=g.createRadialGradient(S/2,S/2,S*.3,S/2,S/2,S*.72);
    eg.addColorStop(0,'rgba(0,0,0,0)');eg.addColorStop(1,'rgba(8,6,3,.55)');
    g.fillStyle=eg;g.fillRect(0,0,S,S);
  }
  ctx.drawImage(mmCv,0,0,mmCv.width,mmCv.height,x,y,w,w);
  if(G.inDun&&G.dun){
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.arc(x+G.p.x/(DUNW*TILE)*w,y+G.p.y/(DUNW*TILE)*w,2.4,0,TAU);ctx.fill();
  }else{
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.arc(x+w/2,y+w/2,2.4,0,TAU);ctx.fill();
  }
  ctx.strokeStyle='rgba(10,8,5,.9)';ctx.lineWidth=4;ctx.strokeRect(x-2,y-2,w+4,w+4);
  ctx.strokeStyle='#8a744a';ctx.lineWidth=1.3;ctx.strokeRect(x-3.5,y-3.5,w+7,w+7);
  ctx.strokeStyle='rgba(200,163,90,.35)';ctx.lineWidth=1;ctx.strokeRect(x-.5,y-.5,w+1,w+1);
  G.mmRect={x,y,w};
}
/* liquid-filled glass orb in a dark metal socket */
function drawOrb(x,y,r,frac,cLo,cHi,glow){
  ctx.save();
  ctx.fillStyle='rgba(8,6,4,.82)';
  ctx.beginPath();ctx.arc(x,y,r+3,0,TAU);ctx.fill();
  ctx.beginPath();ctx.arc(x,y,r-.5,0,TAU);ctx.clip();
  ctx.fillStyle='#100c0a';ctx.fillRect(x-r,y-r,r*2,r*2);
  const top=y+r-clamp(frac,0,1)*2*r;
  const g2=ctx.createLinearGradient(0,top,0,y+r);
  g2.addColorStop(0,cHi);g2.addColorStop(1,cLo);
  ctx.fillStyle=g2;
  ctx.beginPath();
  ctx.moveTo(x-r,y+r);ctx.lineTo(x-r,top);
  for(let i=0;i<=8;i++)ctx.lineTo(x-r+i/4*r,top+Math.sin(G.vt*2.1+i*1.25)*1.4);
  ctx.lineTo(x+r,y+r);ctx.closePath();ctx.fill();
  if(glow){ctx.globalCompositeOperation='lighter';
    ctx.fillStyle='rgba(255,110,70,'+glow.toFixed(3)+')';
    ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
    ctx.globalCompositeOperation='source-over';}
  ctx.fillStyle='rgba(255,255,255,.13)';
  ctx.beginPath();ctx.ellipse(x-r*.3,y-r*.42,r*.36,r*.2,-.5,0,TAU);ctx.fill();
  ctx.restore();
  ctx.lineWidth=2.6;ctx.strokeStyle='#15100c';
  ctx.beginPath();ctx.arc(x,y,r+1.4,0,TAU);ctx.stroke();
  ctx.lineWidth=1.2;ctx.strokeStyle='#8a744a';
  ctx.beginPath();ctx.arc(x,y,r+3,0,TAU);ctx.stroke();
  ctx.strokeStyle='rgba(255,235,190,.16)';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(x,y,r-.6,0,TAU);ctx.stroke();
}
/* party frame: portrait, name, red bar */
function drawAllyFrame(x,y,e,look,name){
  ctx.fillStyle='rgba(12,10,7,.72)';
  ctx.beginPath();ctx.roundRect(x,y,30,30,5);ctx.fill();
  const skin=look.skin||'#d6ad84';
  ctx.save();
  ctx.beginPath();ctx.roundRect(x+1,y+1,28,28,4);ctx.clip();
  dotc(x+15,y+18,8.5,skin);
  if(look.hood){ctx.fillStyle=look.hood;
    ctx.beginPath();ctx.arc(x+15,y+16,9.6,Math.PI*.9,Math.PI*2.1);ctx.fill();}
  else{ctx.fillStyle=look.hair||'#4a3826';
    ctx.beginPath();ctx.arc(x+15,y+14.5,8.8,Math.PI*.85,Math.PI*2.15);ctx.fill();}
  dotc(x+12.3,y+18.5,1,'#241c16');dotc(x+17.7,y+18.5,1,'#241c16');
  ctx.restore();
  ctx.strokeStyle='#6b5836';ctx.lineWidth=1.2;
  ctx.beginPath();ctx.roundRect(x+.5,y+.5,29,29,5);ctx.stroke();
  ctx.font='700 10px Georgia,serif';ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=3;
  ctx.fillStyle=PARCH;ctx.fillText(name,x+37,y+9);
  ctx.shadowBlur=0;
  ctx.fillStyle='rgba(10,8,6,.75)';ctx.fillRect(x+37,y+16,54,5);
  const fr=e?clamp(e.hp/e.mhp,0,1):0;
  ctx.fillStyle=e&&e.down?'#5a2320':'#a32c20';
  ctx.fillRect(x+37,y+16,54*fr,5);
  ctx.strokeStyle='rgba(138,116,74,.5)';ctx.lineWidth=1;
  ctx.strokeRect(x+36.5,y+15.5,55,6);
  if(e&&e.down){ctx.fillStyle='#e05b4b';ctx.font='700 8px Georgia,serif';
    ctx.fillText('DOWN',x+37,y+26);}
}
function drawHUD(){
  if(G.mode==='title'||G.mode==='intro')return;
  const p=G.p;
  /* ---- top-right: zone · day · clock, minimap, quest tracker ---- */
  const MW=Math.min(112,Math.round(VW*.3));
  const mx0=VW-12-MW,my0=SAT+30;
  ctx.textAlign='right';ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=4;
  ctx.font='700 12px Georgia,serif';
  ctx.fillStyle=PARCH;
  ctx.fillText(zoneName()+' — Day '+G.dayN+' · '+clockStr(),VW-12,SAT+16);
  ctx.shadowBlur=0;
  drawMiniMap(mx0,my0,MW);
  const qs=objectiveText();
  if(qs){
    let qy=my0+MW+18;
    const qt=QTITLES[G.mq]||'';
    ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=3;
    if(qt){
      ctx.font='700 12.5px Georgia,serif';
      ctx.fillStyle=GOLD;
      ctx.save();ctx.translate(VW-12-ctx.measureText(qt).width-11,qy);
      ctx.rotate(Math.PI/4);ctx.fillRect(-3,-3,6,6);ctx.restore();
      ctx.fillText(qt,VW-12,qy);
      qy+=15;
    }
    ctx.font='600 11px Georgia,serif';
    ctx.fillStyle='rgba(240,232,212,.92)';
    const words=qs.split(' ');let line='';
    for(const w of words){
      const t2=line?line+' '+w:w;
      if(ctx.measureText(t2).width>MW+56){ctx.fillText(line,VW-12,qy);qy+=13;line=w;}
      else line=t2;
    }
    if(line)ctx.fillText(line,VW-12,qy);
    ctx.shadowBlur=0;
  }
  /* ---- top-left: counters below the round buttons ---- */
  ctx.font='700 12px Georgia,serif';
  ctx.textAlign='left';ctx.textBaseline='middle';
  let cy=SAT+72;
  let cx0=16;
  const counter=(draw,val)=>{
    draw(cx0+6,cy);
    ctx.fillStyle=PARCH;
    ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=3;
    ctx.fillText(String(val),cx0+15,cy+.5);
    ctx.shadowBlur=0;
    cx0+=15+ctx.measureText(String(val)).width+16;
    if(cx0>VW-170-MW){cx0=16;cy+=20;}
  };
  counter((x,y)=>{dotc(x,y,5.5,'#c99b3f');dotc(x-1.2,y-1.2,2,'#e0c060');},G.coins);
  if(G.scrolls>0)counter((x,y)=>{rr(x-4,y-4,8,7,1.5,'#d8ccae');dotc(x,y+4,1.4,'#9fd8ff');},G.scrolls);
  if(G.bow)counter((x,y)=>{ctx.save();ctx.translate(x,y);ctx.rotate(-.7);
    rr(-5,-1,10,2,1,'#b3a180');ctx.fillStyle='#8d8577';
    ctx.beginPath();ctx.moveTo(5,-2.6);ctx.lineTo(8,0);ctx.lineTo(5,2.6);ctx.fill();ctx.restore();},G.arrows);
  if(G.pouch)counter((x,y)=>{dotc(x,y,5,'#3a3f4a');dotc(x-1.4,y-1.6,1.5,'#5c6a7a');},G.bombs);
  if(G.orbs>0)counter((x,y)=>{dotc(x,y,5,'rgba(159,216,255,.9)');dotc(x,y,2,'#e8f4ff');},G.orbs);
  if(G.shards>0)counter((x,y)=>{ctx.fillStyle='#d09a4f';
    ctx.beginPath();ctx.moveTo(x,y-5.5);ctx.lineTo(x+4,y);ctx.lineTo(x,y+5.5);ctx.lineTo(x-4,y);ctx.closePath();ctx.fill();},G.shards+'/4');
  cy+=20;
  ctx.font='700 10.5px Georgia,serif';
  if(G.pburn>0){ctx.fillStyle='#ff9a4a';ctx.fillText('burning',16,cy);cy+=14;}
  if(G.chill>0){ctx.fillStyle='#9fd8ff';ctx.fillText('chilled',16,cy);cy+=14;}
  const m=eqMain();
  if(m&&m.dur<25){
    ctx.fillStyle=Math.sin(G.vt*8)>0?'#e05b4b':'#a05436';
    ctx.fillText('⚠ '+wDef(m).n+' failing',16,cy);cy+=14;
  }
  /* ---- party frames ---- */
  let py2=cy+10;
  for(const mem of G.team){
    const a=ALLYDEF[mem.key];if(!a)continue;
    const e=G.ents.find(e2=>e2.t==='ally'&&e2.key===mem.key);
    drawAllyFrame(16,py2,e,a.look||{},a.n);
    py2+=38;
  }
  /* ---- bottom: health orb · XP · resource orb ---- */
  if(G.mode==='play'||G.mode==='dialog'||G.mode==='dead'){
    const ob=VH-SAB-46;
    const hpf=p.hp/totHp();
    drawOrb(40,ob,25,hpf,'#5a120c','#c03528',hpf<.3?(.10+.08*Math.sin(G.vt*7)):0);
    if(G.pot.hp>0){
      ctx.font='700 10px Georgia,serif';ctx.textAlign='center';
      ctx.fillStyle=PARCH;
      ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=3;
      ctx.fillText(G.pot.hp,63,ob+20);
      ctx.shadowBlur=0;
    }
    if(G.spells.length)drawOrb(VW-40,ob,22,G.mana/maxMana(),'#2a1640','#7a3fa8',0);
    else drawOrb(VW-40,ob,22,p.st/p.maxst,'#1e3318','#5d8a3f',0);
    const xw=Math.max(90,Math.min(160,VW-280));
    const xx=VW/2-xw/2,xy=VH-SAB-16;
    ctx.fillStyle='rgba(8,6,4,.8)';
    ctx.beginPath();ctx.roundRect(xx-2,xy-2,xw+4,8,3);ctx.fill();
    const nxt=HXPL(G.hlvl+1),cur=HXPL(G.hlvl);
    const xf=clamp((G.hxp-cur)/Math.max(1,nxt-cur),0,1);
    const xg=ctx.createLinearGradient(xx,0,xx+xw,0);
    xg.addColorStop(0,'#8a6a2e');xg.addColorStop(1,'#e0c060');
    ctx.fillStyle=xg;ctx.fillRect(xx,xy,xw*xf,4);
    for(let i=1;i<4;i++){ctx.fillStyle='rgba(10,8,5,.9)';ctx.fillRect(xx+xw*i/4-1,xy-1,2,6);}
    ctx.strokeStyle='rgba(138,116,74,.6)';ctx.lineWidth=1;
    ctx.strokeRect(xx-2.5,xy-2.5,xw+5,9);
    ctx.font='700 9.5px Georgia,serif';ctx.textAlign='center';
    ctx.fillStyle=GOLD;
    ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=3;
    ctx.fillText('LV '+(G.hlvl+1),VW/2,xy-9);
    ctx.shadowBlur=0;
  }
  /* stamina wheel at the hero (kept from the wild) */
  if(p.st<p.maxst-.5||p.exh){
    const sw=projC(p.x,p.y),sx=sw.x,sy=sw.y-40*ZM;
    ctx.lineWidth=4.5;ctx.lineCap='round';
    ctx.strokeStyle='rgba(16,14,13,.45)';
    ctx.beginPath();ctx.arc(sx,sy,15,0,TAU);ctx.stroke();
    const fr=clamp(p.st/p.maxst,0,1);
    ctx.strokeStyle=p.exh?(Math.sin(G.vt*12)>0?'#e05b4b':'#7a5450'):(fr<.3?'#c99b3f':'#8fce6a');
    ctx.beginPath();ctx.arc(sx,sy,15,-Math.PI/2,-Math.PI/2+fr*TAU);ctx.stroke();
  }
  /* boss bar */
  if(G.boss&&G.boss.e&&!G.boss.e.dead&&G.boss.e.hp>0&&G.boss.e.aggro){
    const w=Math.min(430,VW*.62),x0=VW/2-w/2,y0=SAT+58;
    ctx.textAlign='center';ctx.font='700 12px Georgia,serif';
    ctx.fillStyle=PARCH;ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=4;
    ctx.fillText(G.boss.name.toUpperCase(),VW/2,y0-9);
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(8,6,4,.75)';
    ctx.beginPath();ctx.roundRect(x0,y0,w,10,2);ctx.fill();
    const bg2=ctx.createLinearGradient(0,y0,0,y0+10);
    bg2.addColorStop(0,'#c03528');bg2.addColorStop(1,'#6e150e');
    ctx.fillStyle=bg2;
    ctx.fillRect(x0+1.5,y0+1.5,(w-3)*clamp(G.boss.e.hp/G.boss.e.mhp,0,1),7);
    ctx.strokeStyle='#8a744a';ctx.lineWidth=1.2;
    ctx.strokeRect(x0-1,y0-1,w+2,12);
    for(const ex of[x0-7,x0+w+7]){
      ctx.save();ctx.translate(ex,y0+5);ctx.rotate(Math.PI/4);
      ctx.fillStyle='#8a744a';ctx.fillRect(-3.5,-3.5,7,7);ctx.restore();
    }
  }
  if(G.trial){
    ctx.textAlign='center';ctx.font='700 13px Georgia,serif';
    ctx.fillStyle='#bfe3ff';ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=4;
    ctx.fillText(G.trial.kind==='blades'
      ?'TRIAL OF BLADES — WAVE '+G.trial.wave+'/3'
      :'TRIAL OF SPARKS — '+G.trial.sparks.filter(s=>s.got).length+'/6 · '+Math.ceil(G.trial.t)+'s',
      VW/2,SAT+92);
    ctx.shadowBlur=0;
  }
  if(joy.active){
    ctx.strokeStyle='rgba(216,196,141,.30)';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(joy.ox,joy.oy,46,0,TAU);ctx.stroke();
    ctx.fillStyle='rgba(216,196,141,.26)';
    ctx.beginPath();ctx.arc(joy.ox+joy.dx,joy.oy+joy.dy,22,0,TAU);ctx.fill();
  }
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
      ctx.textAlign='center';ctx.fillStyle=PARCH;
      ctx.font='700 24px Georgia,serif';
      ctx.fillText('The wild reclaims you…',VW/2,VH*.42);
      if(G.deadT>1.1){
        ctx.font='600 13px Georgia,serif';
        ctx.fillStyle='rgba(232,220,192,.75)';
        ctx.fillText(G.hardcore?'Hardcore — this tale is over. Tap to let it go.':'Tap to rise at the last fire you knew',VW/2,VH*.42+30);
      }
    }
  }
}
let vigCv=null,vigKey='';
function lightPass(){
  ctx.fillStyle='rgba(40,43,40,.13)';ctx.fillRect(0,0,VW,VH); // cold ash grade
  const t=G.dayT;
  let na=0;
  if(t>.66)na=Math.min(.58,(t-.66)/.12*.58);
  else if(t<.08)na=.58*(1-t/.08);
  if(na>0){ctx.fillStyle='rgba(10,16,42,'+na+')';ctx.fillRect(0,0,VW,VH);}
  const da=Math.max(0,1-Math.abs(t-.70)/.06)*.16+Math.max(0,1-Math.abs(t-.075)/.05)*.12;
  if(da>0){ctx.fillStyle='rgba(232,110,60,'+da+')';ctx.fillRect(0,0,VW,VH);}
  /* personal light radius: the world dims away from the hero, Diablo-style
     (hero rides the screen centre, so the mask is cached at quarter-res) */
  if(G.mode!=='title'){
    const va=.20+na*.55;
    const b=Math.round(va*40);
    const key=VW+'x'+VH+'_'+b;
    if(key!==vigKey){
      vigKey=key;
      if(!vigCv)vigCv=document.createElement('canvas');
      vigCv.width=Math.max(2,VW>>2);vigCv.height=Math.max(2,VH>>2);
      const vg=vigCv.getContext('2d'),w=vigCv.width,h=vigCv.height,a2=b/40;
      const gr=vg.createRadialGradient(w/2,h/2,Math.min(w,h)*.30,w/2,h/2,Math.max(w,h)*.82);
      gr.addColorStop(0,'rgba(8,9,16,0)');
      gr.addColorStop(.55,'rgba(8,9,16,'+(a2*.4).toFixed(3)+')');
      gr.addColorStop(1,'rgba(8,9,16,'+a2.toFixed(3)+')');
      vg.clearRect(0,0,w,h);vg.fillStyle=gr;vg.fillRect(0,0,w,h);
    }
    ctx.drawImage(vigCv,0,0,vigCv.width,vigCv.height,0,0,VW,VH);
  }
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
  setCamMatrix(S,G.cam.x,G.cam.y,cv.width/2,cv.height/2,shx,shy);
  // conservative world-space cull radius: circumcircle of the screen's preimage
  {const c1=invProj(0,0),c2=invProj(cv.width,0),c3=invProj(0,cv.height),c4=invProj(cv.width,cv.height);
   let r=0;for(const c of[c1,c2,c3,c4]){const d=hyp(c.x-G.cam.x,c.y-G.cam.y);if(d>r)r=d;}
   G.cullR=r+TILE*2;}
  // ground pass — the floor plane, rotated 45° and squashed so it recedes
  ctx.setTransform(_M.a,_M.b,_M.c,_M.d,_M.e,_M.f);
  if(G.inDun)drawDun();else drawWorld();
  drawTrial();
  // upright pass — each sprite sets its own screen-vertical frame on the floor
  drawDrops();
  drawEnts();
  drawPr();
  drawPx(vdt);
  drawFt(vdt);
  drawLumen();
  drawBeams();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  if(G.inDun)dunLight();else lightPass();
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
  let bsT=0;
  bindBtn($('bS'),()=>{bsT=G.vt;},()=>{
    if(G.vt-bsT>.35&&G.spells.length>1){
      const i=G.spells.indexOf(G.spellEq);
      G.spellEq=G.spells[(i+1)%G.spells.length];
      sfx('blip');toast('Readied: '+SPELLS[G.spellEq].n);
      refreshButtons();
    }else inp.spellP=true;
  });
  bindBtn($('bP'),()=>{inp.potP=true;},null);
  bindBtn($('ctxb'),()=>{inp.intP=true;},null);
  $('bMap').addEventListener('pointerdown',e=>{e.stopPropagation();markTouch();if(G.mode==='play')openMap();});
  $('bMenu').addEventListener('pointerdown',e=>{e.stopPropagation();markTouch();if(G.mode==='play')openPause();});
  $('bSkill').addEventListener('pointerdown',e=>{e.stopPropagation();markTouch();if(G.mode==='play')openSkills();});
  $('mapx').addEventListener('pointerdown',e=>{e.stopPropagation();if(G.mode==='map')setMode('play');});
  $('mapcv').addEventListener('pointerdown',e=>{e.stopPropagation();mapTap(e);});
  $('mtgo').addEventListener('pointerdown',e=>{e.stopPropagation();if(mapSel)travelTo(mapSel.p);});
  $('mtno').addEventListener('pointerdown',e=>{e.stopPropagation();$('mtrav').style.display='none';});
  $('pausov').addEventListener('pointerdown',e=>{if(e.target===$('pausov'))setMode('play');});
  $('skillov').addEventListener('pointerdown',e=>{if(e.target===$('skillov'))setMode('play');});
  $('craftov').addEventListener('pointerdown',e=>{if(e.target===$('craftov'))setMode('play');});
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
  $('dlg').addEventListener('pointerdown',e=>{
    e.preventDefault();if(G.mode==='dialog')advDlg();
  });
  $('adv').addEventListener('pointerdown',e=>{
    e.preventDefault();markTouch();ensureAC();
    if(G.mode==='dialog')advDlg();
    else if(G.mode==='intro')introAdv();
    else if(G.mode==='dead'&&G.deadT>1){if(G.hardcore)hardcoreEnd();else respawn();}
  });
  let newArm=false;
  $('tCont').addEventListener('pointerdown',e=>{
    e.preventDefault();markTouch();ensureAC();
    fadeOut(()=>{setMode('play');refreshObjective();refreshButtons();fadeIn(600);},300);
  });
  $('tNew').addEventListener('pointerdown',e=>{
    e.preventDefault();markTouch();ensureAC();
    if(store.get()&&!newArm){newArm=true;$('tNew').textContent='Erase saved journey — tap again';return;}
    newArm=false;store.del();
    newGameFlow();
  });
  cv.addEventListener('pointerdown',e=>{
    if(G.mode==='play'&&G.mmRect){
      const r=G.mmRect;
      if(e.clientX>=r.x-4&&e.clientX<=r.x+r.w+4&&e.clientY>=r.y-4&&e.clientY<=r.y+r.w+4){
        markTouch();openMap();return;
      }
    }
    if(e.pointerType==='mouse'&&G.mode==='play'){
      ensureAC();
      const w=invProj(e.clientX*DPR,e.clientY*DPR);
      G.p.face=angTo(G.p.x,G.p.y,w.x,w.y);
      inp.aP=true;inp.aH=true;
    }
  });
  cv.addEventListener('pointerup',e=>{
    if(e.pointerType==='mouse'){inp.aH=false;inp.aR=true;}
  });
  const GKEYS=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','j','k','l','b','e','m','i','p','z','v','t','q','enter','escape','shift'];
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
    if(G.mode==='dead'){if(G.deadT>1){if(G.hardcore)hardcoreEnd();else respawn();}return;}
    if(G.mode==='dialog'){if(k==='e'||k==='enter'||k===' '||k==='j'||k==='z')advDlg();return;}
    if(G.mode==='map'){if(k==='m'||k==='escape')setMode('play');return;}
    if(G.mode==='pause'){if(k==='escape'||k==='i'||k==='p')setMode('play');return;}
    if(G.mode==='skills'||G.mode==='craft'){if(k==='escape'||k==='t')setMode('play');return;}
    if(G.mode!=='play')return;
    if(k==='j'||k==='z'||k===' '){inp.aP=true;inp.aH=true;}
    else if(k==='k'||k==='shift'){inp.rH=true;inp.rT=G.vt;}
    else if(k==='l'){inp.bowH=true;}
    else if(k==='b'){inp.bombP=true;}
    else if(k==='v'){inp.spellP=true;}
    else if(k==='q'){inp.potP=true;}
    else if(k==='e'||k==='enter'){inp.intP=true;}
    else if(k==='m'){openMap();}
    else if(k==='t'){openSkills();}
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
  const satEl=$('sat'),sabEl=$('sab');
  SAT=satEl?satEl.offsetTop:0;
  SAB=sabEl?Math.max(0,VH-sabEl.offsetTop):0;
  DPR=G.lowfx?1:Math.min(3,window.devicePixelRatio||1);
  ZM=clamp(Math.min(VW,VH)/240,1.5,2.7); // close-in ARPG framing
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
  G.vt+=dtR;G.ldt=dtR;
  fpsA=fpsA*.96+dtR*1000*.04;
  /* adaptive quality: badly slow devices get rescued fast, mild ones gently */
  if(!G.lowfx&&((G.vt>2.5&&fpsA>38)||(G.vt>10&&fpsA>27))){G.lowfx=true;resize();}
  let scale=1;
  if(G.freeze>0){G.freeze-=dtR;scale=0;}
  else if(G.slow>0){G.slow-=dtR;scale=.32;}
  if(scale>0&&G.mode==='play'&&G.p&&G.p.aim&&hasSkill('hawk'))scale*=.5;
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
  refreshButtons();
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
window.__EW={G,inp,keys,WPN,ARM,SPELLS,SKILLS,RECIPES,mkInst,
  POIS:()=>POIS,SP:()=>SP,
  tp(x,y){G.p.x=x;G.p.y=y;G.cam.x=x;G.cam.y=y;G.p.vx=0;G.p.vy=0;},
  tpt(tx,ty){this.tp(tx*TILE+12,ty*TILE+12);},
  tileAt,flag,setFlag,mkE,killE,autosave,loadSave,resetState,setMode,advDlg,
  dlg:()=>dlgQ,fps:()=>fpsA,startTrial,objectiveText,
  addXP,learnSkill,lvlFor,hasSkill,doCraft,repairInst,upgradeInst,degrade,
  addTrust,trustOf,priceFor,canRecruit,recruit,stealFrom,
  castSpell,startFishing,tryMount,dismount,ensureTeam,
  eqMain,eqOff,eqArm,wDmg,addWpn,refreshButtons,openSkills,openCraft,
  rollInst,instName,instColor,affix,PREFIX,SUFFIX,UNIQ,totHp,totSt,heroLvlFor,
  usePotion,useScroll,enterDun,descendDun,exitDun,ascendDun,enterPortal,
  dunTileAt:(x,y)=>dunTileAt(x,y),newGameFlow,applyOrigin,gearValue,sellables,
  killAround(r){for(const e of G.ents)if(e.t!=='npc'&&e.t!=='ally'&&hyp(e.x-G.p.x,e.y-G.p.y)<(r||500))killE(e);},
  give(){G.coins+=500;G.arrows+=30;G.bombs+=8;G.pouch=true;G.bow=true;
    G.mat.wood+=10;G.mat.ore+=10;G.mat.leather+=10;refreshButtons();}};
boot();
})();
