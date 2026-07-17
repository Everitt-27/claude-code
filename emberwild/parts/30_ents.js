/* ================= particles / floaters / drops ================= */
G.cutBush=new Set();G.drops=[];G.nearProps=[];
function spawnP(x,y,c,n,spd,ttl,r,add){
  if(G.px.length>240)return;
  for(let i=0;i<n;i++){const a=rnd(TAU),s=rnd(.3,1)*spd;
    G.px.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-spd*.3,t:0,ttl:ttl*rnd(.6,1.3),c,r:r*rnd(.6,1.4),add});}
}
function ringP(x,y,c){G.px.push({x,y,vx:0,vy:0,t:0,ttl:.5,c,r:10,ring:1});}
function addFt(x,y,txt,c,big){
  if(G.ft.length>40)G.ft.shift();
  G.ft.push({x:x+rnd(-6,6),y,txt,c:c||'#fff',t:0,ttl:big?1.4:.9,big});
}
function addDrop(x,y,kind){
  const a=rnd(TAU);
  G.drops.push({x,y,vx:Math.cos(a)*70,vy:Math.sin(a)*70,kind,ttl:30,t:rnd(9)});
}
function addFood(id,n){G.food[id]=(G.food[id]||0)+n;}
function updDrops(dt){
  const p=G.p;
  for(const d of G.drops){
    d.ttl-=dt;d.t+=dt;
    d.vx*=Math.pow(.01,dt);d.vy*=Math.pow(.01,dt);
    d.x+=d.vx*dt;d.y+=d.vy*dt;
    const dp=hyp(d.x-p.x,d.y-p.y);
    if(dp<40){d.x=lerp(d.x,p.x,dt*9);d.y=lerp(d.y,p.y,dt*9);}
    if(dp<13&&d.ttl>0){
      d.ttl=0;
      if(d.kind==='coin'){G.coins++;sfx('coin');}
      else if(d.kind==='heart'){p.hp=Math.min(p.maxhp,p.hp+2);sfx('heal');spawnP(p.x,p.y,'#e86a6a',4,60,.4,1.6);}
      else if(d.kind==='arrow'){G.arrows++;sfx('pick');}
      else if(d.kind==='bomb'){G.bombs++;sfx('pick');}
      else if(d.kind.startsWith('food:')){const f=d.kind.slice(5);addFood(f,1);sfx('pick');addFt(p.x,p.y-18,FOODS[f].n,'#ffd66e');}
    }
  }
  G.drops=G.drops.filter(d=>d.ttl>0);
}

/* ================= damage ================= */
function damageP(dmg,sx,sy){
  const p=G.p;
  if(G.mode!=='play'||p.hp<=0)return;
  if(p.act==='roll'&&p.actT<.18){
    G.slow=1.15;p.flurry=2.4;sfx('flurry');
    spawnP(p.x,p.y,'#bfe8ff',12,90,.5,2,true);
    lumTip('flurry');
    return;
  }
  if(p.iv>0)return;
  p.hp-=dmg;p.iv=.9;G.hurtT=.55;G.shake=Math.max(G.shake,5);sfx('hurt');
  if(sx!==undefined){const a=angTo(sx,sy,p.x,p.y);p.kbx+=Math.cos(a)*190;p.kby+=Math.sin(a)*190;}
  spawnP(p.x,p.y,'#e05b4b',8,90,.4,2);
  if(p.hp<=0){p.hp=0;die();}
}
function damageE(e,dmg,ang,kb){
  if(e.hp<=0||e.dead||e.hidden)return;
  const mult=e.st==='stun'?1.5:1;
  dmg=Math.max(1,Math.round(dmg*mult));
  e.hp-=dmg;e.flash=.14;
  const kw=(e.t==='warden'||e.t==='king')?.22:1;
  e.kbx+=Math.cos(ang)*150*(kb||1)*kw;
  e.kby+=Math.sin(ang)*150*(kb||1)*kw;
  addFt(e.x,e.y-e.r-8,String(dmg),G.p.flurry>0?'#ffd66e':'#fff');
  G.freeze=Math.max(G.freeze,.05);G.shake=Math.max(G.shake,2.2);
  sfx('hit');spawnP(e.x,e.y,'#fff',5,110,.3,1.6);
  if(e.hp<=0)killE(e);
  else if(!e.aggro){e.aggro=true;addFt(e.x,e.y-e.r-14,'!','#ffd66e');}
}
function killE(e){
  if(e.dead)return;
  e.hp=0;e.dead=true;G.stats.kills++;
  spawnP(e.x,e.y,e.t==='wisp'?'#b78ad2':'#4a4258',14,120,.5,2.4);
  sfx('thud');
  const d=EDEF[e.t];
  const n=irnd(Math.ceil(d.coin/2),d.coin);
  for(let i=0;i<n;i++)addDrop(e.x,e.y,'coin');
  if(Math.random()<.14)addDrop(e.x,e.y,'heart');
  if(e.t==='boar'){addDrop(e.x,e.y,'food:meat');if(Math.random()<.5)addDrop(e.x,e.y,'food:meat');}
  if(e.t==='archer')for(let i=0;i<3;i++)addDrop(e.x,e.y,'arrow');
  if(e.t==='wisp')questEvent('wispKill');
  if(e.camp){const c=G.camps.get(e.camp);
    if(c){c.alive--;
      if(c.alive<=0&&!flag('camp:'+e.camp)){setFlag('camp:'+e.camp);
        toast('Camp cleared — its chest is unlocked!');sfx('chest');
        questEvent('campCleared',e.camp);autosave();}}}
  if(e.trial&&G.trial)G.trial.left--;
  if(e.t==='warden')wardenDown(e);
  if(e.t==='king')kingDown(e);
}
function wardenDown(e){
  setFlag('warden:'+e.wid);
  G.shards++;G.boss=null;
  G.p.maxhp=Math.min(40,G.p.maxhp+4);G.p.hp=G.p.maxhp;
  sfx('orb');G.shake=6;
  spawnP(e.x,e.y,'#ffd66e',24,140,.9,3,true);
  for(let i=0;i<10;i++)addDrop(e.x,e.y,'coin');
  toast('Crown Shard recovered — '+G.shards+' of 4 · Heart container gained!');
  if(G.shards>=4){G.mq=Math.max(G.mq,3);
    if(!G.wpns.includes('ember')){G.wpns.push('ember');G.wpn='ember';}}
  const mem=WARDEN_MEM[e.wid]||[];
  startDlg(mem.concat(G.shards>=4?[{n:'Lumen',t:'Four shards! They are singing, they want to go home. I have folded their heat into a blade for you — the EMBER BLADE. Now… the Citadel gate will open. He is waiting.'}]:[]),
    {end(){refreshObjective();autosave();}});
}
function kingDown(e){
  setFlag('kingdead');G.boss=null;G.mq=5;
  spawnP(e.x,e.y,'#f6edd9',40,180,1.4,3,true);
  endingStart();
}

/* ================= projectiles ================= */
function firePr(t,x,y,a,sp,dmg){
  G.pr.push({t,x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,a,dmg,ttl:t==='bomb'?1.3:2.4,from:t==='arrow'?'p':(t==='bomb'?'p':'e')});
}
function explode(x,y){
  sfx('boom');G.shake=9;ringP(x,y,'#ffb35c');
  spawnP(x,y,'#ffb35c',18,160,.5,3,true);spawnP(x,y,'#5d5458',12,120,.7,2.6);
  for(const e of G.ents){
    if(e.dead||e.t==='npc')continue;
    const dp=hyp(e.x-x,e.y-y);
    if(dp<64)damageE(e,6,angTo(x,y,e.x,e.y),1.8);
  }
  if(hyp(G.p.x-x,G.p.y-y)<46)damageP(2,x,y);
  for(const pr of propsNear(x,y,1)){
    if(pr.t==='boulder'&&!flag('op:'+pr.id)&&hyp(pr.x-x,pr.y-y)<72){
      setFlag('op:'+pr.id);sfx('thud');
      spawnP(pr.x,pr.y,'#8d8577',14,130,.7,3);
      const nn=irnd(4,9);for(let i=0;i<nn;i++)addDrop(pr.x,pr.y,'coin');
      if(Math.random()<.5)addDrop(pr.x,pr.y,'food:shroom');
      toast('The boulder cracks open!');
    }
  }
}
function updPr(dt){
  const p=G.p;
  for(const b of G.pr){
    b.ttl-=dt;
    if(b.stuck)continue;
    if(b.t==='bomb'){
      b.vx*=Math.pow(.02,dt);b.vy*=Math.pow(.02,dt);
      b.x+=b.vx*dt;b.y+=b.vy*dt;
      if(b.ttl<=0){b.dead=true;explode(b.x,b.y);}
      continue;
    }
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    const t=tileAtPx(b.x,b.y);
    if(SOLIDT(t)||CLIMBT(t)){
      if(b.t==='arrow'||b.t==='earrow'){b.stuck=true;b.ttl=Math.min(b.ttl,2);}
      else b.dead=true;
      continue;
    }
    if(b.from==='p'){
      for(const e of G.ents){
        if(e.dead||e.t==='npc'||e.hidden)continue;
        if(hyp(e.x-b.x,e.y-b.y)<e.r+5){
          damageE(e,b.dmg*(G.p.flurry>0?1.5:1),b.a,.8);b.dead=true;break;}
      }
    }else{
      if(hyp(p.x-b.x,p.y-b.y)<p.r+5){damageP(b.dmg,b.x,b.y);b.dead=true;}
    }
    if(b.ttl<=0)b.dead=true;
  }
  G.pr=G.pr.filter(b=>!b.dead&&b.ttl>-1);
}

/* ================= spawning & world population ================= */
function mkE(t,x,y,o){
  const d=EDEF[t];
  const scale=(t==='warden'||t==='king')?1:1+G.shards*.15;
  const e=Object.assign({t,x,y,vx:0,vy:0,r:d.r,hp:Math.round(d.hp*scale),mhp:Math.round(d.hp*scale),
    face:rnd(TAU),st:'idle',tm:rnd(.5,2),cd:rnd(.6,1.4),flash:0,kbx:0,kby:0,aggro:false,
    anim:rnd(9),hx:x,hy:y},o||{});
  G.ents.push(e);
  return e;
}
function campRoster(poi){
  const h=hashi(poi.tx,poi.ty,NS+501);
  const far=hyp(poi.tx-SP.spawn.tx,poi.ty-SP.spawn.ty)>120;
  const base=[['bandit','blob'],['bandit','archer'],['bandit','bandit','blob'],['archer','blob','bandit']][h%4].slice();
  if(far)base.push(h%2?'brute':'archer');
  return base;
}
const NPCS={
  0:[{key:'elder',name:'Elder Maren',ox:-30,oy:-16},{key:'boro',name:'Boro the Smith',ox:44,oy:-10},
     {key:'pip',name:'Pip',ox:22,oy:28},{key:'sella',name:'Sella',ox:-14,oy:44}],
  1:[{key:'wren',name:'Scholar Wren',ox:-28,oy:-12},{key:'holt',name:'Holt the Hunter',ox:30,oy:22}],
  2:[{key:'rhoa',name:'Captain Rhoa',ox:-30,oy:-14},{key:'zef',name:'Zef',ox:-14,oy:44},
     {key:'juno',name:'Juno',ox:32,oy:24}]};
function spawnVilNPCs(poi){
  for(const n of NPCS[poi.vi]||[])
    mkE('npc',poi.tx*TILE+12+n.ox,poi.ty*TILE+12+n.oy,{key:n.key,name:n.name,vi:poi.vi,hp:999,mhp:999});
}
function ensureSpawns(){
  const p=G.p;
  for(const poi of POIS){
    const px=poi.tx*TILE+12,py=poi.ty*TILE+12;
    const d=hyp(px-p.x,py-p.y);
    if(d<210&&!flag('seen:'+poi.id)){
      setFlag('seen:'+poi.id);
      if(poi.k==='vil'){toast('Discovered '+poi.name);sfx('pick');
        G.lastSafe={x:px,y:py+60};questEvent('vil',poi);}
      else if(poi.k==='tower'||poi.k==='ruins'||poi.k==='cit')toast('Discovered '+poi.name);
      else if(poi.k==='shrine')toast('Discovered an ancient shrine');
    }
    if(d<540){
      if(poi.k==='camp'&&!flag('camp:'+poi.id)){
        let c=G.camps.get(poi.id);
        if(!c||!c.spawned){
          const roster=campRoster(poi);
          G.camps.set(poi.id,{alive:roster.length,spawned:true});
          roster.forEach((t,i)=>{const a=i/roster.length*TAU;
            mkE(t,px+Math.cos(a)*42,py+Math.sin(a)*36,{camp:poi.id});});
        }
      }
      if(poi.k==='ruins'&&!flag('warden:'+poi.id)&&!G.ents.some(e=>e.wid===poi.id&&!e.dead))
        mkE('warden',px,py-34,{wid:poi.id,wname:poi.name,ax:px,ay:py});
      if(poi.k==='vil'&&!G.ents.some(e=>e.t==='npc'&&e.vi===poi.vi&&!e.dead))
        spawnVilNPCs(poi);
      if(poi.k==='cit'&&flag('gateopen')&&!flag('kingdead')&&!G.ents.some(e=>e.t==='king'&&!e.dead))
        mkE('king',px,py-30,{ax:px,ay:py});
    }
  }
  for(const e of G.ents){
    if(e.dead)continue;
    const d=hyp(e.x-p.x,e.y-p.y);
    if(e.t==='npc'){if(d>1200)e.dead=true;continue;}
    if(d>950){e.dead=true;
      if(e.camp){const c=G.camps.get(e.camp);if(c)c.spawned=false;}}
  }
  const night=G.dayT>.74||G.dayT<.03;
  if(night&&Math.random()<.3){
    const ns=G.ents.filter(e=>e.t==='skel'&&!e.dead).length;
    if(ns<4){
      const a=rnd(TAU),x=p.x+Math.cos(a)*330,y=p.y+Math.sin(a)*330;
      const t=tileAtPx(x,y);
      const nearVil=SP.vils.some(v=>hyp(x-v.tx*TILE,y-v.ty*TILE)<300);
      if(!WATERT(t)&&!SOLIDT(t)&&!CLIMBT(t)&&!nearVil&&t!==T_BLIGHT&&t!==T_STONE)
        mkE('skel',x,y,{aggro:true});
    }
  }
  const wild=G.ents.filter(e=>!e.dead&&!e.camp&&!e.trial&&e.t!=='npc'&&e.t!=='warden'&&e.t!=='king'&&e.t!=='skel').length;
  if(wild<5&&Math.random()<.35){
    const a=rnd(TAU),x=p.x+Math.cos(a)*400,y=p.y+Math.sin(a)*400;
    const t=tileAtPx(x,y);
    const nearVil=SP.vils.some(v=>hyp(x-v.tx*TILE,y-v.ty*TILE)<320);
    if(!nearVil&&!WATERT(t)&&!SOLIDT(t)&&!CLIMBT(t)){
      if(t===T_BLIGHT||t===T_ASH){if(!G.healed)mkE('wisp',x,y,{});}
      else if(t===T_GRASS||t===T_MEADOW)mkE(Math.random()<.55?'boar':'blob',x,y,{});
      else if(t===T_FGRASS||t===T_SWAMP)mkE('blob',x,y,{});
      else if(t===T_DESERT&&Math.random()<.5)mkE('blob',x,y,{});
    }
  }
}

/* ================= enemy AI ================= */
function moveEnt(e,dx,dy,blk){
  const r=e.r*.72;
  const free=(x,y)=>!blk(x+r,y)&&!blk(x-r,y)&&!blk(x,y+r)&&!blk(x,y-r);
  if(free(e.x+dx,e.y))e.x+=dx;
  if(free(e.x,e.y+dy))e.y+=dy;
  e.x=clamp(e.x,TILE,WORLD*TILE-TILE);e.y=clamp(e.y,TILE,WORLD*TILE-TILE);
}
function wander(e,dt,sp){
  if(e.tm<=0){e.tm=rnd(.8,2.2);
    if(Math.random()<.4){e.vx=0;e.vy=0;}
    else{const a=hyp(e.x-e.hx,e.y-e.hy)>130?angTo(e.x,e.y,e.hx,e.hy):rnd(TAU);
      e.vx=Math.cos(a)*sp;e.vy=Math.sin(a)*sp;e.face=a;}}
}
function aggroCheck(e,dp,ag){
  if(!e.aggro&&dp<ag&&G.p.hp>0){e.aggro=true;sfx('alert');addFt(e.x,e.y-e.r-12,'!','#ffd66e');}
  if(e.aggro&&dp>560&&e.t!=='warden'&&e.t!=='king')e.aggro=false;
}
function updEnt(e,dt){
  if(e.flash>0)e.flash-=dt;
  e.cd-=dt;e.tm-=dt;
  const p=G.p,dp=hyp(e.x-p.x,e.y-p.y),d=EDEF[e.t];
  const blk=(x,y)=>{const t=tileAtPx(x,y);
    return SOLIDT(t)||CLIMBT(t)||(e.t!=='wisp'&&WATERT(t));};
  switch(e.t){
    case'npc':{
      if(dp<60){e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,p.x,p.y);}
      else wander(e,dt,16);
      break;}
    case'blob':{
      aggroCheck(e,dp,d.ag);
      if(e.st==='hop'){
        if(e.tm<=0){e.st='idle';e.vx=0;e.vy=0;e.tm=rnd(.4,.9);}
      }else{
        e.vx*=.8;e.vy*=.8;
        if(e.tm<=0){
          const a=e.aggro?angTo(e.x,e.y,p.x,p.y)+rnd(-.3,.3):rnd(TAU);
          const sp=e.aggro?160:60;
          e.vx=Math.cos(a)*sp;e.vy=Math.sin(a)*sp;e.st='hop';e.tm=.42;e.face=a;
        }
      }
      if(dp<e.r+p.r+2&&e.aggro)damageP(1,e.x,e.y);
      break;}
    case'boar':{
      if(!e.aggro&&dp<75){e.aggro=true;sfx('alert');addFt(e.x,e.y-20,'!','#ffb35c');}
      if(e.st==='windup'){e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,p.x,p.y);
        if(e.tm<=0){e.st='charge';e.tm=1.0;
          e.vx=Math.cos(e.face)*300;e.vy=Math.sin(e.face)*300;sfx('roll');}}
      else if(e.st==='charge'){
        if(Math.random()<dt*20)spawnP(e.x,e.y+6,'#c9b48f',1,30,.4,1.5);
        if(dp<e.r+p.r+3){damageP(2,e.x,e.y);e.st='tired';e.tm=1;e.vx*=.1;e.vy*=.1;}
        else if(e.tm<=0){e.st='tired';e.tm=.9;e.vx=0;e.vy=0;}}
      else if(e.st==='tired'){e.vx=0;e.vy=0;if(e.tm<=0){e.st='idle';e.tm=rnd(.5,1);}}
      else{
        if(e.aggro&&e.cd<=0&&dp<240){e.st='windup';e.tm=.5;e.cd=2.6;}
        else wander(e,dt,40);
        if(e.aggro&&dp>340)e.aggro=false;
      }
      break;}
    case'bandit':case'brute':{
      aggroCheck(e,dp,d.ag);
      const reach=e.t==='brute'?46:36,dmg=e.t==='brute'?3:2,wind=e.t==='brute'?.62:.45;
      if(e.st==='windup'){e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,p.x,p.y);
        if(e.tm<=0){e.st='swing';e.tm=.16;sfx('swing');
          if(dp<reach+p.r&&Math.abs(angDiff(e.face,angTo(e.x,e.y,p.x,p.y)))<1.25)damageP(dmg,e.x,e.y);}}
      else if(e.st==='swing'){if(e.tm<=0){e.st='cool';e.tm=e.t==='brute'?1.15:.85;}}
      else if(e.st==='cool'){
        const a=angTo(e.x,e.y,p.x,p.y)+Math.PI/2*(e.strafe||1);
        e.vx=Math.cos(a)*32;e.vy=Math.sin(a)*32;
        if(e.tm<=0)e.st='idle';}
      else{
        if(e.aggro){
          const a=angTo(e.x,e.y,p.x,p.y);e.face=a;
          if(dp>reach-6){e.vx=Math.cos(a)*d.spd;e.vy=Math.sin(a)*d.spd;}
          else{e.vx=0;e.vy=0;}
          if(dp<reach+6&&e.cd<=0){e.st='windup';e.tm=wind;e.cd=1.6;e.strafe=Math.random()<.5?1:-1;}
        }else wander(e,dt,34);}
      break;}
    case'archer':{
      aggroCheck(e,dp,d.ag);
      if(e.aggro){
        const a=angTo(e.x,e.y,p.x,p.y);e.face=a;
        if(e.st==='aim'){e.vx=0;e.vy=0;
          if(e.tm<=0){e.st='idle';e.cd=1.8;firePr('earrow',e.x,e.y,a,300,1);sfx('bow');}}
        else{
          if(dp<110){e.vx=-Math.cos(a)*d.spd;e.vy=-Math.sin(a)*d.spd;}
          else if(dp>235){e.vx=Math.cos(a)*d.spd;e.vy=Math.sin(a)*d.spd;}
          else{e.vx*=.6;e.vy*=.6;}
          if(e.cd<=0&&dp<270&&dp>60){e.st='aim';e.tm=.65;}
        }
      }else wander(e,dt,30);
      break;}
    case'skel':{
      const day=!(G.dayT>.72||G.dayT<.05);
      if(day){e.dead=true;spawnP(e.x,e.y,'#dfe6ea',10,90,.5,2);break;}
      e.aggro=dp<340;
      if(e.st==='windup'){e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,p.x,p.y);
        if(e.tm<=0){e.st='lunge';e.tm=.24;
          e.vx=Math.cos(e.face)*330;e.vy=Math.sin(e.face)*330;}}
      else if(e.st==='lunge'){
        if(dp<e.r+p.r+3)damageP(1,e.x,e.y);
        if(e.tm<=0){e.st='idle';e.cd=1.0;e.vx=0;e.vy=0;}}
      else if(e.aggro){
        const a=angTo(e.x,e.y,p.x,p.y);e.face=a;
        e.vx=Math.cos(a)*d.spd;e.vy=Math.sin(a)*d.spd;
        if(dp<64&&e.cd<=0){e.st='windup';e.tm=.3;}
      }else wander(e,dt,40);
      break;}
    case'wisp':{
      aggroCheck(e,dp,d.ag);
      e.hov=(e.hov||0)+dt*3;
      if(e.aggro){
        const a=angTo(e.x,e.y,p.x,p.y);
        if(e.st==='cast'){e.vx*=.2;e.vy*=.2;
          if(e.tm<=0){e.st='idle';e.cd=2.2;firePr('orb',e.x,e.y,a,150,2);sfx('alert');}}
        else{
          if(dp<120){e.vx=-Math.cos(a)*70;e.vy=-Math.sin(a)*70;}
          else{e.vx=Math.cos(a+Math.sin(e.hov)*.7)*54;e.vy=Math.sin(a+Math.sin(e.hov)*.7)*54;}
          if(e.cd<=0&&dp<270){e.st='cast';e.tm=.8;}}
      }else{e.vx=Math.cos(e.hov*.7)*20;e.vy=Math.sin(e.hov*.9)*20;}
      break;}
    case'warden':{
      if(!e.aggro){
        if(dp<d.ag){e.aggro=true;G.boss={e,name:e.wname};sfx('roar');G.shake=6;lumTip('warden');}
        break;}
      if(!G.boss||G.boss.e!==e)G.boss={e,name:e.wname};
      if(hyp(p.x-e.ax,p.y-e.ay)>560){
        e.aggro=false;G.boss=null;e.hp=e.mhp;e.x=e.ax;e.y=e.ay-34;e.st='idle';e.vx=0;e.vy=0;break;}
      if(e.hp<e.mhp*.5&&!e.summoned){e.summoned=true;
        for(let i=0;i<2;i++)mkE('wisp',e.x+rnd(-60,60),e.y+rnd(-60,60),{aggro:true});
        addFt(e.x,e.y-34,'RISE','#b78ad2',true);}
      const rage=e.hp<e.mhp*.5?1.25:1;
      bossBrain(e,dt,dp,d,rage,3);
      break;}
    case'king':{
      if(!e.aggro){
        if(dp<d.ag&&flag('gateopen')){e.aggro=true;G.boss={e,name:'The Hollow King'};
          sfx('roar');G.shake=8;addFt(e.x,e.y-40,'…another thief of crowns?','#b78ad2',true);}
        break;}
      if(!G.boss||G.boss.e!==e)G.boss={e,name:'The Hollow King'};
      if(hyp(p.x-e.ax,p.y-e.ay)>620){
        e.aggro=false;G.boss=null;e.hp=e.mhp;e.x=e.ax;e.y=e.ay;e.st='idle';e.hidden=false;break;}
      const ph=e.hp>e.mhp*.66?1:(e.hp>e.mhp*.33?2:3);
      if(ph>=2&&!e.p2){e.p2=true;e.st='ring';e.tm=.6;sfx('roar');
        addFt(e.x,e.y-44,'The crown is MINE to break.','#b78ad2',true);}
      if(ph>=3&&!e.p3){e.p3=true;G.shake=8;sfx('roar');
        for(let i=0;i<3;i++)mkE('skel',e.x+rnd(-90,90),e.y+rnd(-90,90),{aggro:true});
        addFt(e.x,e.y-44,'I remember NOTHING!','#b78ad2',true);}
      if(e.st==='ring'){e.vx=0;e.vy=0;
        if(e.tm<=0){e.st='idle';e.cd=1.2;
          for(let i=0;i<10;i++)firePr('orb',e.x,e.y,i/10*TAU,140,2);sfx('boom');}
        break;}
      if(e.st==='tele'){e.vx=0;e.vy=0;
        if(e.tm<=0){e.hidden=false;e.st='idle';e.cd=.5;
          spawnP(e.x,e.y,'#b78ad2',16,120,.5,2.5,true);}
        break;}
      if(ph>=2&&e.cd<=0&&dp>150&&Math.random()<dt*1.2){
        e.hidden=true;e.st='tele';e.tm=.55;
        spawnP(e.x,e.y,'#b78ad2',14,110,.5,2.4,true);
        const a=rnd(TAU);e.x=p.x+Math.cos(a)*74;e.y=p.y+Math.sin(a)*74;
        break;}
      bossBrain(e,dt,dp,d,ph>=3?1.35:1.08,3);
      break;}
  }
  moveEnt(e,(e.vx+e.kbx)*dt,(e.vy+e.kby)*dt,e.t==='wisp'?()=>false:blk);
  const dk=Math.pow(.0005,dt);e.kbx*=dk;e.kby*=dk;
  e.anim+=dt*(hyp(e.vx,e.vy)>4?6:2);
}
function bossBrain(e,dt,dp,d,rage,dmg){
  switch(e.st){
    case'idle':{
      const a=angTo(e.x,e.y,G.p.x,G.p.y);e.face=a;
      if(dp>72){e.vx=Math.cos(a)*d.spd*rage;e.vy=Math.sin(a)*d.spd*rage;}
      else{e.vx=0;e.vy=0;}
      if(e.cd<=0){
        e.vx=0;e.vy=0;
        if(dp<98){if(Math.random()<.55){e.st='slash';e.tm=.5;e.hits=0;}
          else{e.st='slamW';e.tm=.55;}}
        else if(dp<320){e.st='chargeW';e.tm=.6;}
        else e.cd=.4;
      }
      break;}
    case'slash':{
      if(e.tm<=0){
        e.face=angTo(e.x,e.y,G.p.x,G.p.y);
        sfx('swing');
        if(dp<90&&Math.abs(angDiff(e.face,angTo(e.x,e.y,G.p.x,G.p.y)))<1.3)damageP(dmg,e.x,e.y);
        e.hits++;
        if(e.hits<3)e.tm=.34;
        else{e.st='idle';e.cd=1.5/rage;}
      }
      break;}
    case'slamW':{e.vx=0;e.vy=0;
      if(e.tm<=0){e.st='slam';e.tm=.55;e.slamR=22;e.slamHit=false;
        sfx('thud');G.shake=7;ringP(e.x,e.y,'#ffb35c');}
      break;}
    case'slam':{
      e.slamR+=dt*230;
      if(!e.slamHit&&Math.abs(dp-e.slamR)<17){e.slamHit=true;damageP(dmg,e.x,e.y);}
      if(e.tm<=0){e.st='idle';e.cd=1.7/rage;}
      break;}
    case'chargeW':{e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,G.p.x,G.p.y);
      if(e.tm<=0){e.st='chargeGo';e.tm=.8;sfx('roar');
        e.vx=Math.cos(e.face)*430;e.vy=Math.sin(e.face)*430;}
      break;}
    case'chargeGo':{
      if(Math.random()<dt*30)spawnP(e.x,e.y+8,'#c9b48f',1,40,.4,2);
      if(dp<e.r+G.p.r+6){damageP(dmg,e.x,e.y);e.st='stun';e.tm=1.1;e.vx=0;e.vy=0;}
      else if(e.tm<=0){e.st='stun';e.tm=.95;e.vx=0;e.vy=0;}
      break;}
    case'stun':{if(e.tm<=0){e.st='idle';e.cd=.7;}break;}
  }
}

/* ================= player ================= */
function updPlayer(dt){
  const p=G.p;
  p.iv=Math.max(0,p.iv-dt);p.flurry=Math.max(0,p.flurry-dt);
  p.regenCd=Math.max(0,p.regenCd-dt);
  G.nearProps=propsNear(p.x,p.y,1);
  const tile=tileAtPx(p.x,p.y);
  p.climb=CLIMBT(tile);p.swim=WATERT(tile);
  if(!p.climb&&!p.swim){p.lgx=p.x;p.lgy=p.y;}
  // input vector
  let mx=inp.mx,my=inp.my;
  if(keys.a||keys.arrowleft)mx-=1;if(keys.d||keys.arrowright)mx+=1;
  if(keys.w||keys.arrowup)my-=1;if(keys.s||keys.arrowdown)my+=1;
  const ml=hyp(mx,my);if(ml>1){mx/=ml;my/=ml;}
  const moving=ml>.12;
  const sprint=inp.rH&&(G.vt-inp.rT)>.22&&moving&&!p.exh&&!p.swim&&!p.climb&&p.st>0;
  // === actions ===
  if(p.act==='roll'){
    p.actT+=dt;
    const sp=300*(1-p.actT/.42*.6);
    p.vx=Math.cos(p.rollAng)*sp;p.vy=Math.sin(p.rollAng)*sp;
    if(p.actT>=.42){p.act='';p.vx*=.3;p.vy*=.3;}
  }else if(p.act==='swing'){
    p.actT+=dt;
    if(!p.hitDone&&p.actT>=.1){p.hitDone=true;applyMelee('swing');}
    p.vx=mx*30;p.vy=my*30;
    if(p.actT>=.26){
      if(p.buf&&p.combo<2){p.combo++;p.actT=0;p.hitDone=false;p.buf=false;sfx('swing');}
      else{p.act='';p.lastSwing=G.vt;}
    }
  }else if(p.act==='spin'){
    p.actT+=dt;
    if(!p.hitDone&&p.actT>=.16){p.hitDone=true;applyMelee('spin');ringP(p.x,p.y,'#cfe3f4');}
    p.vx*=.9;p.vy*=.9;
    if(p.actT>=.5)p.act='';
  }else if(p.act==='slide'){
    const a=angTo(p.x,p.y,p.lgx,p.lgy);
    p.vx=Math.cos(a)*240;p.vy=Math.sin(a)*240;
    if(!CLIMBT(tileAtPx(p.x,p.y))||hyp(p.x-p.lgx,p.y-p.lgy)<8){
      p.act='';p.vx=0;p.vy=0;p.hp=Math.max(0,p.hp-1);sfx('hurt');G.hurtT=.4;
      if(p.hp<=0)die();
    }
  }else{
    // free movement
    let sp=118;
    if(p.swim)sp=64;else if(p.climb)sp=52;else if(p.aim)sp=55;else if(sprint)sp=195;
    p.vx=lerp(p.vx,mx*sp,1-Math.pow(.0001,dt));
    p.vy=lerp(p.vy,my*sp,1-Math.pow(.0001,dt));
    if(moving&&!p.aim)p.face=Math.atan2(my,mx);
    // attacks
    if(inp.aP&&!p.aim){
      inp.aP=false;
      p.combo=(G.vt-(p.lastSwing||-9)<.4)?(p.combo+1)%3:0;
      p.act='swing';p.actT=0;p.hitDone=false;p.buf=false;p.chargeT=0;sfx('swing');
    }
    if(inp.rP){
      inp.rP=false;
      if(!p.exh&&!p.swim&&!p.climb&&p.st>=20){
        p.st-=20;p.regenCd=.8;
        p.act='roll';p.actT=0;p.iv=.34;
        p.rollAng=moving?Math.atan2(my,mx):p.face;p.face=p.rollAng;
        sfx('roll');spawnP(p.x,p.y,'#c9b48f',4,50,.3,1.6);
      }
    }
  }
  if(p.act==='swing'&&inp.aP){p.buf=true;inp.aP=false;}
  // charge / spin
  if(inp.aH&&p.act===''&&!p.aim){
    p.chargeT+=dt;
    if(p.chargeT>=.5&&!p.charged){p.charged=true;sfx('blip');}
  }else if(!inp.aH){p.charged=false;}
  if(inp.aR){
    inp.aR=false;
    if(p.chargeT>=.5&&p.act===''&&p.st>=25&&!p.exh){
      p.st-=25;p.regenCd=.8;p.act='spin';p.actT=0;p.hitDone=false;sfx('swing');
    }
    p.chargeT=0;p.charged=false;
  }
  // bow — resolve the release BEFORE the un-aim branch, or the shot self-cancels
  if(inp.bowR){
    inp.bowR=false;
    if(p.aim&&G.arrows>0){
      G.arrows--;firePr('arrow',p.x+Math.cos(p.aimAng)*10,p.y+Math.sin(p.aimAng)*10,p.aimAng,400,4);
      sfx('bow');
    }else if(p.aim){sfx('err');addFt(p.x,p.y-20,'No arrows','#f2e9d8');}
    p.aim=false;
  }else if(inp.bowH&&G.bow&&(p.act===''||p.aim)){
    p.aim=true;
    const tgt=nearestEnemy(280);
    p.aimAng=tgt?angTo(p.x,p.y,tgt.x,tgt.y):(moving?Math.atan2(my,mx):p.face);
    p.face=p.aimAng;
  }else if(p.aim&&!inp.bowH){p.aim=false;}
  if(inp.bombP){
    inp.bombP=false;
    if(G.bombs>0){
      G.bombs--;firePr('bomb',p.x,p.y,p.face,150,0);sfx('roll');
    }else{sfx('err');addFt(p.x,p.y-20,G.pouch?'No bombs':'Need a bomb pouch','#f2e9d8');}
  }
  // stamina
  let drain=0;
  if(p.climb){drain=16*(G.rain>0?2:1);}
  else if(p.swim)drain=8;
  else if(sprint)drain=15;
  if(drain>0){p.st-=drain*dt;p.regenCd=.6;
    if(sprint&&Math.random()<dt*8)spawnP(p.x,p.y+7,'#c9b48f',1,30,.3,1.4);}
  else if(p.regenCd<=0)p.st=Math.min(p.maxst,p.st+30*dt);
  if(p.st<=0){
    p.st=0;
    if(!p.exh){p.exh=true;sfx('err');lumTip('exhaust');}
    if(p.climb&&p.act!=='slide'){p.act='slide';sfx('roll');}
    if(p.swim){
      p.x=p.lgx;p.y=p.lgy;p.hp=Math.max(0,p.hp-1);p.st=24;p.iv=1;
      addFt(p.x,p.y-20,'Nearly drowned…','#9fd8ff');sfx('hurt');
      if(p.hp<=0)die();
    }
  }
  if(p.exh&&p.st>=30)p.exh=false;
  // apply knockback + movement
  const canClimb=(p.st>2&&!p.exh)||p.climb;
  const blk=(x,y)=>{
    const t=tileAtPx(x,y);
    if(SOLIDT(t))return true;
    if(CLIMBT(t)&&!canClimb)return true;
    return propBlk(G.nearProps,x,y);
  };
  moveEnt(p,(p.vx+p.kbx)*dt,(p.vy+p.kby)*dt,blk);
  const dk=Math.pow(.0005,dt);p.kbx*=dk;p.kby*=dk;
  p.mv=hyp(p.vx,p.vy);
  p.anim+=dt*(p.mv>10?(p.mv>150?11:7):2);
  if(p.mv>10)G.stats.steps+=dt;
  // interact
  G.inter=findInteract();
  if(inp.intP){inp.intP=false;if(G.inter)doInteract(G.inter);}
  // camera
  const la=10;
  G.cam.x=lerp(G.cam.x,p.x+Math.cos(p.face)*la,1-Math.pow(.002,dt));
  G.cam.y=lerp(G.cam.y,p.y+Math.sin(p.face)*la,1-Math.pow(.002,dt));
  // map reveal
  G.expT-=dt;
  if(G.expT<=0){G.expT=.3;reveal(Math.floor(p.x/TILE),Math.floor(p.y/TILE),3);}
}
function nearestEnemy(range){
  let best=null,bd=range;
  for(const e of G.ents){
    if(e.dead||e.t==='npc'||e.hidden||e.hp<=0)continue;
    const d=hyp(e.x-G.p.x,e.y-G.p.y);
    if(d<bd){bd=d;best=e;}
  }
  return best;
}
function applyMelee(kind){
  const p=G.p,w=WPN[G.wpn];
  const reach=kind==='spin'?52:38+w.t*2;
  const base=w.d*(kind==='spin'?2.2:(p.combo===2?1.6:1))*(p.flurry>0?1.5:1);
  for(const e of G.ents){
    if(e.dead||e.t==='npc'||e.hp<=0||e.hidden)continue;
    const dp=hyp(e.x-p.x,e.y-p.y);
    if(dp>reach+e.r)continue;
    if(kind!=='spin'&&Math.abs(angDiff(p.face,angTo(p.x,p.y,e.x,e.y)))>1.35)continue;
    damageE(e,Math.round(base),angTo(p.x,p.y,e.x,e.y),kind==='spin'?1.7:1);
  }
  for(const pr of G.nearProps){
    const dp=hyp(pr.x-p.x,pr.y-p.y);
    if(dp>reach+10)continue;
    if(kind!=='spin'&&Math.abs(angDiff(p.face,angTo(p.x,p.y,pr.x,pr.y)))>1.35)continue;
    if(pr.t==='bush'&&!G.cutBush.has(pr.id)){
      G.cutBush.add(pr.id);
      spawnP(pr.x,pr.y,'#67a748',9,90,.4,2);
      const r=Math.random();
      if(r<.30){addDrop(pr.x,pr.y,'coin');if(r<.1)addDrop(pr.x,pr.y,'coin');}
      else if(r<.38)addDrop(pr.x,pr.y,'heart');
      else if(r>.9)addDrop(pr.x,pr.y,'food:apple');
    }
  }
}

/* ================= interaction ================= */
function fruitReady(pr){return G.flags['fr:'+pr.id]!==G.dayN;}
function findInteract(){
  const p=G.p;let best=null,bd=42;
  for(const pr of G.nearProps){
    let label=null;
    switch(pr.t){
      case'chest':
        if(flag('op:'+pr.id))break;
        if(pr.camp&&!flag('camp:'+pr.camp)){label='Locked…';break;}
        if(pr.ward&&!flag('warden:'+pr.ward)){label='Sealed…';break;}
        label='Open';break;
      case'shrine':label=flag('shrine:'+pr.id)?null:(G.trial?null:'Pray');break;
      case'tower':label=flag('tower:'+pr.id)?null:'Activate';break;
      case'stone':label='Read';break;
      case'fire':label='Campfire';break;
      case'statue':label='Pray';break;
      case'ftree':label=fruitReady(pr)?'Shake':null;break;
      case'gate':label=flag('gateopen')?null:(G.shards>=4?'Open Gate':'Examine');break;
      case'throne':label=flag('kingdead')?'Rest':null;break;
      case'doll':label=flag('dollfound')?null:'Pick Up';break;
      case'shroomp':label=flag('op:'+pr.id)?null:'Gather';break;
    }
    if(!label)continue;
    const dd=hyp(pr.x-p.x,pr.y-p.y)-(pr.r||8);
    if(dd<bd){bd=dd;best={o:pr,label,kind:'prop'};}
  }
  for(const e of G.ents){
    if(e.t!=='npc'||e.dead)continue;
    const dd=hyp(e.x-p.x,e.y-p.y)-12;
    if(dd<bd){bd=dd;best={o:e,label:'Talk',kind:'npc'};}
  }
  return best;
}
function chestLoot(pr){
  const h=hashi(Math.round(pr.x),Math.round(pr.y),NS+601);
  const far=hyp(pr.x-SP.spawn.tx*TILE,pr.y-SP.spawn.ty*TILE)/TILE;
  if(pr.ward){
    if(!G.wpns.includes('knight')){G.wpns.push('knight');return WPN.knight.n+'!';}
    G.coins+=50;return '50 coins';
  }
  const roll=h%100;
  if(roll<32){const n=10+Math.floor(far/8)+h%12;G.coins+=n;return n+' coins';}
  if(roll<50){const n=5+h%6;G.arrows+=n;return n+' arrows';}
  if(roll<60&&G.pouch){G.bombs+=3;return '3 bombs';}
  if(roll<74){addFood('steak',1);return 'a seared steak';}
  if(roll<85){addFood('bapple',2);return 'two baked apples';}
  if(roll<93){const n=22+h%18;G.coins+=n;return n+' coins';}
  const tier=far>160?'knight':'soldier';
  if(!G.wpns.includes(tier)){G.wpns.push(tier);return WPN[tier].n+'!';}
  G.coins+=30;return '30 coins';
}
function doInteract(it){
  const pr=it.o;
  if(it.kind==='npc'){talkTo(pr);return;}
  switch(pr.t){
    case'chest':{
      if(it.label==='Locked…'){toast('Defeat the camp to unlock this chest');sfx('err');return;}
      if(it.label==='Sealed…'){toast('The Warden\'s will seals this chest');sfx('err');return;}
      setFlag('op:'+pr.id);G.stats.chests++;
      const loot=chestLoot(pr);
      sfx('chest');spawnP(pr.x,pr.y-6,'#ffd66e',10,80,.6,2,true);
      toast('Chest: '+loot);autosave();
      break;}
    case'shrine':{
      startDlg([{n:'Shrine of the Old Crown',t:'A voice like wind through stone: "Prove your flame, wanderer, and carry a piece of ours."'}],
        {choices:[
          {t:'Begin the trial',f(){startTrial(pr);}},
          {t:'Step back',f(){}}]});
      break;}
    case'tower':{
      setFlag('tower:'+pr.id);
      reveal(Math.floor(pr.x/TILE),Math.floor(pr.y/TILE),11);
      sfx('orb');G.shake=3;G.lastSafe={x:pr.x,y:pr.y+34};
      spawnP(pr.x,pr.y-30,'#9fd8ff',18,110,.9,2.5,true);
      toast(pr.name+' awakened — the land is charted');
      if(G.mq===1){G.mq=2;
        startDlg([
          {n:'Lumen',t:'Ohh — feel that? From up here I can hear them: four shards, four Wardens, four old ruins. I\'ve marked them on your map!'},
          {n:'Lumen',t:'And every tower we wake remembers us. Open the map and we can travel back to any of them in a blink. No walking! Bless the old builders.'}],
          {end(){refreshObjective();autosave();}});
      }else autosave();
      refreshObjective();
      break;}
    case'stone':{
      const first=!flag('stone:'+pr.id);
      if(first){setFlag('stone:'+pr.id);G.stats.stones++;G.coins+=5;sfx('pick');}
      startDlg(LORE[pr.lore].map(t=>({n:'Standing Stone',t})),
        {end(){
          if(G.stats.stones>=8&&!flag('stones8')){setFlag('stones8');
            G.p.maxst=Math.min(200,G.p.maxst+20);sfx('orb');
            startDlg([{n:'Lumen',t:'All eight stones… you carry the whole story now. And stories are strength — your stamina has grown!'}]);}
        }});
      break;}
    case'fire':{
      const raw=Object.keys(G.food).filter(k=>FOODS[k].cook&&G.food[k]>0);
      const ch=[];
      if(raw.length)ch.push({t:'Cook everything raw',f(){
        let msg=[];
        for(const k of raw){const n=G.food[k];G.food[k]=0;addFood(FOODS[k].cook,n);msg.push(n+'× '+FOODS[FOODS[k].cook].n);}
        sfx('sizzle');toast('Cooked: '+msg.join(', '));}});
      ch.push({t:'Rest until '+(G.dayT>.6||G.dayT<.05?'morning':'nightfall'),f(){
        G.dayT=(G.dayT>.6||G.dayT<.05)?.06:.76;if(G.dayT===.06)G.dayN++;
        fadeFlash();sfx('sizzle');G.lastSafe={x:pr.x,y:pr.y+26};toast('You rest by the fire…');}});
      ch.push({t:'Leave',f(){}});
      startDlg([{n:'',t:'The campfire crackles, warm against the wild.'}],{choices:ch});
      break;}
    case'statue':{
      if(G.orbs>=4){
        startDlg([{n:'Statue of the Crown',t:'"Four spirit orbs hum in your pack. Offer them, and choose what grows."'}],
          {choices:[
            {t:'❤ Heart Container (+1 heart)',f(){G.orbs-=4;G.p.maxhp=Math.min(40,G.p.maxhp+4);G.p.hp=G.p.maxhp;sfx('heal');toast('Your life force grows!');autosave();}},
            {t:'⚡ Stamina Vessel (+stamina)',f(){G.orbs-=4;G.p.maxst=Math.min(200,G.p.maxst+20);sfx('heal');toast('Your endurance grows!');autosave();}},
            {t:'Not yet',f(){}}]});
      }else{
        startDlg([{n:'Statue of the Crown',t:'"Bring me four spirit orbs from the shrines of the old crown, and I will trade them for lasting strength." You carry '+G.orbs+'.'}]);
      }
      break;}
    case'ftree':{
      G.flags['fr:'+pr.id]=G.dayN;
      sfx('shake');spawnP(pr.x,pr.y-14,'#57a35f',8,70,.5,2);
      for(let i=0;i<3;i++)addDrop(pr.x+rnd(-10,10),pr.y+rnd(4,14),'food:apple');
      break;}
    case'gate':{
      if(G.shards>=4){
        setFlag('gateopen');sfx('gate');G.shake=10;G.mq=4;
        spawnP(pr.x,pr.y,'#b78ad2',24,150,1,3,true);
        toast('The shards blaze — the gate grinds open');
        refreshObjective();autosave();
      }else{
        startDlg([{n:'',t:'A vast door of blackened stone. Four empty sockets shaped like flame. '+(G.shards?G.shards+' of your shards pulse in answer — but the door demands all four.':'It does not stir.')}]);
      }
      break;}
    case'throne':{
      startDlg([{n:'',t:'You sit a moment on the mended throne. Far below, the wild hums — content, and yours to wander.'}]);
      break;}
    case'doll':{
      setFlag('dollfound');sfx('pick');
      toast('Found Miss Buttons — return her to Pip!');
      if(G.q.pip===1)refreshObjective();
      break;}
    case'shroomp':{
      setFlag('op:'+pr.id);addFood('shroom',1);sfx('pick');
      addFt(pr.x,pr.y-14,'Mushroom','#c88ad2');
      break;}
  }
}

/* ================= shrine trials ================= */
function startTrial(pr){
  const h=hashi(Math.round(pr.x),Math.round(pr.y),NS+701);
  const kind=h%10<6?'blades':'sparks';
  G.trial={id:pr.id,kind,x:pr.x,y:pr.y,wave:0,left:0,t:kind==='sparks'?40:0,sparks:[]};
  if(kind==='blades')trialWave();
  else for(let i=0;i<6;i++)G.trial.sparks.push({a:rnd(TAU),r:44+i*13,sp:rnd(.6,1.4)*(i%2?1:-1),got:false,px:pr.x,py:pr.y});
  toast(kind==='blades'?'Trial of Blades — defeat every challenger!':'Trial of Sparks — catch all six before they fade!');
  sfx('orb');
}
function trialWave(){
  const T=G.trial;T.wave++;
  const packs=[['blob','blob'],['bandit','archer'],['brute','blob','archer']];
  let pack=packs[T.wave-1]||['bandit'];
  T.left=pack.length;
  pack.forEach((t,i)=>{const a=i/pack.length*TAU+rnd(.4);
    mkE(t,T.x+Math.cos(a)*92,T.y+Math.sin(a)*82,{trial:true,aggro:true});});
}
function updTrial(dt){
  const T=G.trial;if(!T)return;
  if(hyp(G.p.x-T.x,G.p.y-T.y)>175){failTrial('You left the trial ring.');return;}
  if(T.kind==='blades'){
    if(T.left<=0){if(T.wave>=3)winTrial();else trialWave();}
  }else{
    T.t-=dt;
    if(T.t<=0){failTrial('The sparks faded.');return;}
    let got=0;
    for(const s of T.sparks){
      if(s.got){got++;continue;}
      s.a+=s.sp*dt;
      s.px=T.x+Math.cos(s.a)*s.r;s.py=T.y+Math.sin(s.a)*s.r*.86;
      if(hyp(G.p.x-s.px,G.p.y-s.py)<15){s.got=true;sfx('pick');spawnP(s.px,s.py,'#9fd8ff',6,70,.4,2,true);}
    }
    if(got>=6)winTrial();
  }
}
function failTrial(msg){
  for(const e of G.ents)if(e.trial)e.dead=true;
  G.trial=null;toast(msg+' The shrine will wait.');sfx('err');
}
function winTrial(){
  const T=G.trial;G.trial=null;
  setFlag('shrine:'+T.id);G.orbs++;G.stats.shrines++;
  sfx('orb');G.shake=3;
  spawnP(T.x,T.y,'#9fd8ff',22,130,.9,2.5,true);
  toast('Spirit Orb obtained ('+G.orbs+' held) — shrine '+G.stats.shrines+'/'+G.totalShrines);
  addDrop(T.x+10,T.y+12,'coin');addDrop(T.x-10,T.y+12,'coin');addDrop(T.x,T.y+18,'food:bapple');
  if(G.stats.shrines===1)lumTip('shrine1');
  G.lastSafe={x:T.x,y:T.y+34};
  autosave();
}

/* ================= story: lore, tips, npc dialogue ================= */
const LORE=[
  ['Before roads, before names, the wild burned too hot for people. Then the first King walked into the fire and asked it, politely, to share.',
   'The fire agreed — and folded itself into a crown of ember and gold. Where the King walked, the wild grew kind. So began Emberwild.'],
  ['The Ember Crown did not rule the wild. It listened to it. Each spring the King knelt in the meadows and asked what the land wanted; each autumn he gave it.',
   'A crown that listens cannot be stolen, the stones say. It can only be forgotten.'],
  ['Four knights loved the King best: the Snow, the Wood, the Sand, the Mist. He called them his Wardens, and gave each a seat at the crown\'s own table.'],
  ['Of the Sundering, the stones say little. A grief came to the King — some say a lost child, some say a broken promise — and he asked the crown to make him forget.',
   'A crown that listens listened. And in forgetting, it shattered.'],
  ['The blight is not evil, the old ones wrote. It is sorrow with nowhere to go, leaking from a hollow heart. Do not hate it. End it kindly.'],
  ['A spark escaped the shattering — small, bright, and terribly chatty, the stones note. It carries the crown\'s memory of laughter. If found, be patient with it.'],
  ['The wayfarer towers were raised for wanderers, so that no one who climbed would ever be lost again. The builders asked only this: wake them gently.'],
  ['Prophecy, scratched thin and hurried: "One will wake on the hill of soft grass with no name and no yesterday. Give them a sword. Give them the morning. The rest, they will give us."'],
];
const WARDEN_MEM={
  w0:[{n:'Memory of the Shard',t:'Snow, and laughter in it. The King crowns a small child with a wreath of frost-flowers and bows to her, deep as to a queen. The Warden of Snows laughs loudest of all.'},
      {n:'Lumen',t:'He was kind. He was KIND, I remember now. Hold that memory tight — we\'ll need it at the end.'}],
  w1:[{n:'Memory of the Shard',t:'A summer table under great trees. The King plants a sapling with muddy hands while the Warden of Woods pretends not to cry. "Grow slow," the King tells it. "We are in no hurry."'},
      {n:'Lumen',t:'No hurry… a hundred years, and the trees kept growing for him. Come on. Two more? One more? Onward!'}],
  w2:[{n:'Memory of the Shard',t:'Wind over dunes. The King walks the desert border all night beside the Warden of Sands, refusing shade, so that the far villages might see their King sweat for them.'},
      {n:'Lumen',t:'Dunewatch still tells that story, you know. They just forgot who it was about.'}],
  w3:[{n:'Memory of the Shard',t:'Mist on a lake at dawn. The King, alone, weeping. The Warden of Mists says nothing — only stands beside him until morning. Some kinds of loyalty never learn to speak.'},
      {n:'Lumen',t:'…That grief. That\'s where the Sundering began. He asked the crown to take the memory away, and it took everything. Let\'s go and give it back.'}],
};
const LUMTIPS={
  flurry:[{n:'Lumen',t:'THAT! Dodging at the very last breath — time itself flinched! Strike now, strike fast, while the world is slow!'}],
  shrine1:[{n:'Lumen',t:'A Spirit Orb! Gather four and pray at any village statue — the old crown will trade them for more heart or deeper breath. Your choice!'}],
  warden:[{n:'Lumen',t:'A Warden! Watch the shoulders — they betray every blow. Roll THROUGH the swing, not away, then answer it. And if it charges… sidestep and smile.'}],
  night1:[{n:'Lumen',t:'Night. The restless dead get bold in the dark — bones and bad manners. Fight them, outrun them, or camp by a fire until dawn.'}],
  blight:[{n:'Lumen',t:'Ugh — blight. Sorrow with nowhere to go. The wisps here throw it about, so keep your feet moving. It all ends when HE remembers.'}],
  exhaust:[{n:'Lumen',t:'Breathe! That green ring is your strength — when it empties you can\'t run, climb, or swim. Rest a moment. The wild rewards patience.'}],
  rain:[{n:'Lumen',t:'Rain! Lovely for the meadows, dreadful for climbing — stone drinks your strength twice as fast when wet. Maybe wait it out by a fire.'}],
  climb:[{n:'Lumen',t:'You can climb almost any stone — it just costs strength. The higher peaks want a deeper breath… or a clever path.'}],
};
function lumTip(k){
  if(flag('tip:'+k)||!LUMTIPS[k])return;
  setFlag('tip:'+k);
  startDlg(LUMTIPS[k]);
}
function updLumen(dt){
  const p=G.p;
  const tx=p.x+Math.cos(G.vt*1.3)*17-9,ty=p.y-26+Math.sin(G.vt*1.7)*6;
  const f=1-Math.pow(.002,dt);
  G.lum.x=lerp(G.lum.x,tx,f);G.lum.y=lerp(G.lum.y,ty,f);
  if(!G.lowfx&&Math.random()<dt*2)
    G.px.push({x:G.lum.x,y:G.lum.y,vx:rnd(-8,8),vy:rnd(2,14),t:0,ttl:.7,c:'#ffd66e',r:1.2,add:true});
  if(G.mode==='play'){
    if((G.dayT>.74||G.dayT<.03))lumTip('night1');
    const t=tileAtPx(p.x,p.y);
    if(t===T_BLIGHT||t===T_ASH)lumTip('blight');
    if(p.climb)lumTip('climb');
    if(G.rain>0)lumTip('rain');
  }
}
/* ---- NPC talk trees ---- */
function talkTo(e){
  switch(e.key){
    case'elder':dlgElder();break;
    case'boro':dlgBoro();break;
    case'pip':dlgPip();break;
    case'sella':shop('Sella',[
      {label:'Apple — 4c',cost:4,f(){addFood('apple',1);}},
      {label:'5 Arrows — 8c',cost:8,f(){G.arrows+=5;}},
      {label:'Seared Steak — 12c',cost:12,f(){addFood('steak',1);}},
      G.pouch?{label:'3 Bombs — 15c',cost:15,f(){G.bombs+=3;}}
             :{label:'Bomb Pouch — 25c',cost:25,f(){G.pouch=true;G.bombs+=3;toast('Bomb Pouch! Bombs crack boulders and bones alike');}}]);
      break;
    case'zef':shop('Zef',[
      {label:'8 Arrows — 12c',cost:12,f(){G.arrows+=8;}},
      {label:'Baked Apple — 6c',cost:6,f(){addFood('bapple',1);}},
      G.pouch?{label:'3 Bombs — 15c',cost:15,f(){G.bombs+=3;}}
             :{label:'Bomb Pouch — 25c',cost:25,f(){G.pouch=true;G.bombs+=3;toast('Bomb Pouch acquired!');}}]);
      break;
    case'wren':dlgWren();break;
    case'holt':startDlg([
      {n:'Holt the Hunter',t:'Boars drop good meat if you can dodge the tantrum. Sear it at a campfire — raw fills the belly, cooked mends the body. Old hunter\'s arithmetic.'},
      {n:'Holt the Hunter',t:(G.dayT>.7?'And get inside, or near a fire. The bones walk at night.':'Snow country. Beautiful. Bring stamina if you mean to climb her peaks.')}]);
      break;
    case'rhoa':dlgRhoa();break;
    case'juno':startDlg([
      {n:'Juno',t:'A shrine on the dunes had DANCING LIGHTS inside! Papa says never touch shrine-light. Papa is a coward. If you catch one, tell me what it feels like!'}]);
      break;
    default:startDlg([{n:e.name,t:'Fine weather for wandering, traveler.'}]);
  }
}
function dlgElder(){
  if(!flag('elder1')){
    setFlag('elder1');
    startDlg([
      {n:'Elder Maren',t:'By the old fire… a living spark rides your shoulder. I never thought these eyes would see one again. Sit, wanderer. Listen.'},
      {n:'Elder Maren',t:'A hundred years ago the Ember Crown shattered. Our King fell hollow, and a violet blight crept out of the Sunken Citadel. It creeps still.'},
      {n:'Elder Maren',t:'Four shards of the crown were carried off by his Wardens — good knights once, twisted now into jailers of his grief. They brood in the old ruins at the compass points.'},
      {n:'Elder Maren',t:'Return the shards and the King may remember himself. Take my husband\'s bow — he\'d like that it flew again. And climb a wayfarer tower: your spark can hear the shards from up high.'}],
      {end(){
        if(!G.bow){G.bow=true;G.arrows+=15;sfx('chest');toast('Received the Old Bow + 15 arrows');}
        if(G.mq<1)G.mq=1;
        refreshObjective();autosave();
      }});
  }else if(flag('kingdead')){
    startDlg([{n:'Elder Maren',t:'The smoke rises straight, the blight is meadow, and the fire feels warm again. You gave an old woman back her morning, wanderer. Sit whenever you like. This hearth is yours.'}]);
  }else if(G.shards>=4){
    startDlg([{n:'Elder Maren',t:'All four shards… then only the gate remains. Whatever sits the throne now wears his face, not his heart. Be brave enough to give it back.'}]);
  }else{
    startDlg([{n:'Elder Maren',t:'Shrines hold spirit orbs; the statue trades four of them for strength. Campfires mend a meal and pass the night. And the towers, child — always the towers first.'}]);
  }
}
function dlgBoro(){
  if(!G.q.boro){
    startDlg([
      {n:'Boro the Smith',t:'Bandits camped west past the creek and made off with my best steel. My hands make blades, not war — but yours look like they argue well.'},
      {n:'Boro the Smith',t:'Break that camp, and the steel is yours — reforged into a soldier\'s blade that actually bites.'}],
      {choices:[
        {t:'I\'ll break the camp',f(){G.q.boro=1;toast('Quest: Boro\'s Stolen Steel');refreshObjective();}},
        {t:'Maybe later',f(){}}]});
  }else if(G.q.boro===1){
    if(flag('camp:borocamp')){
      G.q.boro=2;
      startDlg([{n:'Boro the Smith',t:'You broke them?! HA! Give me a breath and a hammer—'},
        {n:'Boro the Smith',t:'There. A Soldier\'s Blade, balanced for a wanderer\'s wrist. May it argue persuasively.'}],
        {end(){
          if(!G.wpns.includes('soldier')){G.wpns.push('soldier');G.wpn='soldier';toast('Received the Soldier\'s Blade!');}
          else{G.coins+=60;toast('Received 60 coins');}
          sfx('chest');refreshObjective();autosave();}});
    }else startDlg([{n:'Boro the Smith',t:'The camp\'s west of the village, past the creek — follow the gold light. Mind the big one; bandits feed their bullies first.'}]);
  }else startDlg([{n:'Boro the Smith',t:'Blade holding up? Bring me nothing — just come back with all your fingers. That\'s payment enough.'}]);
}
function dlgPip(){
  if(!G.q.pip){
    startDlg([
      {n:'Pip',t:'Um. Excuse me. Are you a hero? You look sturdy. I lost Miss Buttons — my doll — under the big lonely tree east of the village and now there are MONSTERS and—'},
      {n:'Pip',t:'…could you? Please? She\'s brave but she\'s very small.'}],
      {choices:[
        {t:'I\'ll find Miss Buttons',f(){G.q.pip=1;toast('Quest: Miss Buttons');refreshObjective();}},
        {t:'Not now',f(){}}]});
  }else if(G.q.pip===1){
    if(flag('dollfound')){
      G.q.pip=2;G.coins+=15;
      startDlg([{n:'Pip',t:'MISS BUTTONS! You found her! You\'re the best hero in the whole wild. Here — my whole treasure. All fifteen coins. Don\'t spend them on anything boring.'}],
        {end(){sfx('coin');toast('+15 coins');refreshObjective();autosave();}});
    }else startDlg([{n:'Pip',t:'The big lonely tree! East! Follow the gold light. Miss Buttons is the one with the button eyes. Obviously.'}]);
  }else startDlg([{n:'Pip',t:'Miss Buttons says hi. She would also fight the Hollow King with you, but she has a very full schedule.'}]);
}
function dlgWren(){
  if(!flag('wren1')){
    setFlag('wren1');G.pouch=true;G.bombs+=3;
    startDlg([
      {n:'Scholar Wren',t:'A traveler! Perfect timing — hold these. Clay-poppers. Bombs, technically. I make them to study the blight and they keep NOT being used for science.'},
      {n:'Scholar Wren',t:'Here is my hypothesis: blight wisps disperse permanently if popped with enough enthusiasm. Pop five for me? For science. And for the meadows, I suppose.'}],
      {choices:[
        {t:'Five wisps, for science',f(){G.q.wren=1;G.q.wrenK=0;toast('Quest: Enthusiastic Science');refreshObjective();}},
        {t:'Keep your poppers',f(){}}],
       end(){sfx('chest');toast('Received Bomb Pouch + 3 bombs');autosave();}});
  }else if(G.q.wren===1){
    if((G.q.wrenK||0)>=5){
      G.q.wren=2;G.coins+=40;addFood('steak',2);
      startDlg([{n:'Scholar Wren',t:'FIVE dispersals, confirmed at range! The meadows thank you and so does my thesis. Payment: forty coins and two steaks I absolutely did not burn on purpose.'}],
        {end(){sfx('coin');toast('+40 coins, +2 steaks');refreshObjective();autosave();}});
    }else startDlg([{n:'Scholar Wren',t:'Wisps drift where the blight is thick — near the Citadel, and in the sick land around the old ruins. '+(G.q.wrenK||0)+' of 5 so far. For science!'}]);
  }else startDlg([{n:'Scholar Wren',t:'The stones say the blight is sorrow with nowhere to go. When you meet its source… be kind, if you can manage it between sword swings.'}]);
}
function dlgRhoa(){
  if(!G.q.rhoa){
    startDlg([
      {n:'Captain Rhoa',t:'Dunewatch stands, but barely. A raider camp on our flank hits every caravan that dares the sand road. My garrison is two guards and one of them is Juno\'s mother.'},
      {n:'Captain Rhoa',t:'Break that camp and I\'ll pay in steel — a knight\'s claymore, from better days.'}],
      {choices:[
        {t:'Consider it broken',f(){G.q.rhoa=1;
          let best=null,bd=1e9;
          for(const p of POIS)if(p.k==='camp'&&!flag('camp:'+p.id)){
            const d=hyp(p.tx-SP.vils[2].tx,p.ty-SP.vils[2].ty);
            if(d<bd){bd=d;best=p;}}
          G.q.rhoaCamp=best?best.id:null;
          if(!G.q.rhoaCamp){G.q.rhoa=2;} // every camp already cleared
          toast('Quest: The Sand Road');refreshObjective();}},
        {t:'Another day',f(){}}]});
  }else if(G.q.rhoa===1){
    if(!G.q.rhoaCamp||flag('camp:'+G.q.rhoaCamp)){
      G.q.rhoa=2;
      startDlg([{n:'Captain Rhoa',t:'Scouts confirm it — the sand road is open. You fight like a garrison of twenty. The claymore is yours; swing it for the small places.'}],
        {end(){
          if(!G.wpns.includes('knight')){G.wpns.push('knight');G.wpn='knight';toast('Received the Knight\'s Claymore!');}
          else{G.coins+=80;toast('Received 80 coins');}
          sfx('chest');refreshObjective();autosave();}});
    }else startDlg([{n:'Captain Rhoa',t:'The camp\'s marked in gold light. Watch the archers — raiders love shooting people who are busy.'}]);
  }else startDlg([{n:'Captain Rhoa',t:flag('kingdead')?'The caravans sing on the sand road again. Dunewatch remembers, wanderer.':'Steel serving you well? The wild\'s worth defending. All of it.'}]);
}
function shop(who,items){
  const ch=items.filter(Boolean).map(it=>({t:it.label,f(){
    if(G.coins>=it.cost){G.coins-=it.cost;it.f();sfx('coin');toast('Purchased!');shop(who,itemsRefresh(who));}
    else{sfx('err');startDlg([{n:who,t:'Your pouch is lighter than your ambition, friend. Come back with coin.'}],{choices:[{t:'Leave',f(){}}]});}
  }}));
  ch.push({t:'Leave',f(){}});
  startDlg([{n:who,t:who==='Zef'?'Zef trades fair and asks nothing about the bloodstains. Browse!':'Welcome! Finest wares this side of the blight.'}],{choices:ch});
}
function itemsRefresh(who){
  if(who==='Sella')return[
    {label:'Apple — 4c',cost:4,f(){addFood('apple',1);}},
    {label:'5 Arrows — 8c',cost:8,f(){G.arrows+=5;}},
    {label:'Seared Steak — 12c',cost:12,f(){addFood('steak',1);}},
    G.pouch?{label:'3 Bombs — 15c',cost:15,f(){G.bombs+=3;}}
           :{label:'Bomb Pouch — 25c',cost:25,f(){G.pouch=true;G.bombs+=3;}}];
  return[
    {label:'8 Arrows — 12c',cost:12,f(){G.arrows+=8;}},
    {label:'Baked Apple — 6c',cost:6,f(){addFood('bapple',1);}},
    G.pouch?{label:'3 Bombs — 15c',cost:15,f(){G.bombs+=3;}}
           :{label:'Bomb Pouch — 25c',cost:25,f(){G.pouch=true;G.bombs+=3;}}];
}
/* quests → objective line + gold beam targets */
function questEvent(t,a){
  if(t==='campCleared'){
    if(G.q.boro===1&&a==='borocamp')toast('Boro\'s steel recovered — return to Emberhearth');
    if(G.q.rhoa===1&&a===G.q.rhoaCamp)toast('The sand road is open — tell Captain Rhoa');
  }
  if(t==='wispKill'&&G.q.wren===1){
    G.q.wrenK=(G.q.wrenK||0)+1;
    if(G.q.wrenK<=5)toast('Wisps dispersed: '+Math.min(5,G.q.wrenK)+'/5');
  }
  if(t==='vil')refreshObjective();
}
function objectiveText(){
  switch(G.mq){
    case 0:return flag('seen:v0')?'Speak with Elder Maren':'Follow the light — find Emberhearth';
    case 1:return 'Awaken a wayfarer tower';
    case 2:return 'Recover the Crown Shards — '+G.shards+'/4';
    case 3:return 'Open the Sunken Citadel gate';
    case 4:return 'Face the Hollow King';
    case 5:return flag('kingdead')?'Wander the healed wild':'';
  }
  return'';
}
function questTargets(){
  const out=[];
  if(!SP||!G.p)return out;
  const pt=(s)=>({x:s.tx*TILE+12,y:s.ty*TILE+12});
  switch(G.mq){
    case 0:out.push(pt(SP.vils[0]));break;
    case 1:{let best=null,bd=1e9;
      for(const t of SP.towers){const d=hyp(t.tx*TILE-G.p.x,t.ty*TILE-G.p.y);
        if(d<bd){bd=d;best=t;}}
      if(best)out.push(pt(best));break;}
    case 2:for(let i=0;i<4;i++)if(!flag('warden:w'+i))out.push(pt(SP.wardens[i]));break;
    case 3:case 4:out.push({x:SP.cit.tx*TILE+12,y:SP.cit.ty*TILE+12+10*TILE});break;
  }
  if(G.q.boro===1&&!flag('camp:borocamp'))out.push(pt(SP.borocamp));
  if(G.q.pip===1&&!flag('dollfound'))out.push(pt(SP.lonetree));
  if(G.q.rhoa===1&&G.q.rhoaCamp&&!flag('camp:'+G.q.rhoaCamp)){
    const c=POIS.find(p=>p.id===G.q.rhoaCamp);
    if(c)out.push(pt(c));
  }
  return out;
}
function questLog(){
  const rows=[];
  const main=objectiveText();
  if(main)rows.push({t:'The Shattered Crown',d:main,done:false});
  if(G.q.boro)rows.push({t:'Boro\'s Stolen Steel',d:G.q.boro===2?'The smith\'s steel sings again.':'Break the bandit camp west of Emberhearth.',done:G.q.boro===2});
  if(G.q.pip)rows.push({t:'Miss Buttons',d:G.q.pip===2?'Reunited. Heroism has many sizes.':'Find Pip\'s doll under the lonely tree, east of Emberhearth.',done:G.q.pip===2});
  if(G.q.wren)rows.push({t:'Enthusiastic Science',d:G.q.wren===2?'Hypothesis confirmed, meadows thanked.':'Pop 5 blight wisps ('+(G.q.wrenK||0)+'/5). Bombs encouraged.',done:G.q.wren===2});
  if(G.q.rhoa)rows.push({t:'The Sand Road',d:G.q.rhoa===2?'The caravans run again.':'Break the raider camp near Dunewatch.',done:G.q.rhoa===2});
  rows.push({t:'Shrines of the Old Crown',d:G.stats.shrines+'/'+G.totalShrines+' trials passed · '+G.orbs+' orbs held',done:G.stats.shrines>=G.totalShrines});
  rows.push({t:'The Standing Stones',d:G.stats.stones+'/8 stones read',done:G.stats.stones>=8});
  return rows;
}
