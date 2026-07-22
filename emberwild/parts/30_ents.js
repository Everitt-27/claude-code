/* ================= particles / floaters / drops ================= */
G.cutBush=new Set();G.drops=[];G.nearProps=[];G.agiAcc=0;
function spawnP(x,y,c,n,spd,ttl,r,add){
  if(G.px.length>400)return;
  for(let i=0;i<n;i++){const a=rnd(TAU),s=rnd(.3,1)*spd;
    G.px.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-spd*.3,t:0,ttl:ttl*rnd(.6,1.3),c,r:r*rnd(.6,1.4),add});}
}
function ringP(x,y,c){G.px.push({x,y,vx:0,vy:0,t:0,ttl:.5,c,r:10,ring:1});}
function addFt(x,y,txt,c,big){
  if(G.ft.length>48)G.ft.shift();
  G.ft.push({x:x+rnd(-6,6),y,txt,c:c||'#fff',t:0,ttl:big?1.4:.9,big});
}
function addDrop(x,y,kind){
  const a=rnd(TAU);
  G.drops.push({x,y,vx:Math.cos(a)*70,vy:Math.sin(a)*70,kind,ttl:40,t:rnd(9)});
}
function addDropInst(x,y,inst){
  const a=rnd(TAU);
  G.drops.push({x,y,vx:Math.cos(a)*70,vy:Math.sin(a)*70,kind:'wi',inst,ttl:90,t:rnd(9)});
}
function addFood(id,n){G.food[id]=(G.food[id]||0)+n;}
function updDrops(dt){
  const p=G.p;
  for(const d of G.drops){
    d.ttl-=dt;d.t+=dt;
    d.vx*=Math.pow(.01,dt);d.vy*=Math.pow(.01,dt);
    d.x+=d.vx*dt;d.y+=d.vy*dt;
    const dp=hyp(d.x-p.x,d.y-p.y);
    if(dp<40&&!d.kind.startsWith('w:')&&d.kind!=='wi'){d.x=lerp(d.x,p.x,dt*9);d.y=lerp(d.y,p.y,dt*9);}
    if(dp<15&&d.ttl>0){
      d.ttl=0;
      if(d.kind==='coin'){G.coins+=Math.random()<goldMul()-1?2:1;sfx('coin');}
      else if(d.kind==='heart'){p.hp=Math.min(totHp(),p.hp+2);sfx('heal');spawnP(p.x,p.y,'#e86a6a',4,60,.4,1.6);}
      else if(d.kind==='pot:hp'){G.pot.hp++;sfx('pick');addFt(p.x,p.y-18,'Health Potion','#e86a6a');refreshButtons();}
      else if(d.kind==='pot:mp'){G.pot.mp++;sfx('pick');addFt(p.x,p.y-18,'Mana Potion','#9fd8ff');refreshButtons();}
      else if(d.kind==='scroll'){G.scrolls++;sfx('pick');addFt(p.x,p.y-18,'Return Scroll','#bfe3ff');}
      else if(d.kind==='wi'){
        if(ARM[d.inst.k])G.inv.a.push(d.inst);else G.inv.w.push(d.inst);
        sfx('chest');toast('Picked up: '+RARN[d.inst.rar||0]+instName(d.inst));
        spawnP(p.x,p.y,instColor(d.inst),8,90,.5,2,true);}
      else if(d.kind==='arrow'){G.arrows++;sfx('pick');}
      else if(d.kind==='bomb'){G.bombs++;sfx('pick');}
      else if(d.kind.startsWith('food:')){const f=d.kind.slice(5);addFood(f,1);sfx('pick');addFt(p.x,p.y-18,FOODS[f].n,'#ffd66e');}
      else if(d.kind.startsWith('mat:')){const m=d.kind.slice(4);G.mat[m]=(G.mat[m]||0)+1;sfx('pick');addFt(p.x,p.y-18,MATS[m].n,'#c9b48f');}
      else if(d.kind.startsWith('w:')){const k=d.kind.slice(2);
        const i=rollInst(k,0);
        G.inv.w.push(i);
        sfx('chest');toast('Picked up: '+RARN[i.rar||0]+instName(i));
        spawnP(p.x,p.y,instColor(i),8,90,.5,2,true);}
      else if(d.kind.startsWith('a:')){const k=d.kind.slice(2);
        G.inv.a.push({k,dur:irnd(60,95),mx:100,up:0});
        sfx('chest');toast('Picked up: '+ARM[k].n);}
    }
  }
  G.drops=G.drops.filter(d=>d.ttl>0);
}

/* ================= gear: durability, breakage, crafting ================= */
function addWpn(k,dur){const i=mkInst(k,dur);G.inv.w.push(i);return i;}
function addArm(k){const i={k,dur:100,mx:100,up:0};G.inv.a.push(i);return i;}
function degrade(inst,amt,isArm){
  if(!inst)return;
  if(isArm&&aDef(inst).def===0)return;
  inst.dur-=amt;
  if(inst.dur<=25&&!inst.warn){inst.warn=1;
    toast((isArm?aDef(inst).n:wDef(inst).n)+' is nearly '+(isArm?'worn through':'broken')+' — repair it before it is lost');
    sfx('err');}
  if(inst.dur<=0)breakItem(inst,isArm);
}
function breakItem(inst,isArm){
  sfx('crack');G.shake=Math.max(G.shake,4);
  toast((isArm?aDef(inst).n:wDef(inst).n)+' shattered — gone forever');
  spawnP(G.p.x,G.p.y-8,'#c8d3dd',12,120,.5,2);
  if(isArm){
    const i=G.inv.a.indexOf(inst);
    if(i>=0){G.inv.a.splice(i,1);
      if(G.eqA>i)G.eqA--;else if(G.eqA===i)G.eqA=0;
      if(!G.inv.a.length){G.inv.a=[{k:'cloth',dur:100,mx:100,up:0}];G.eqA=0;}
      G.eqA=clamp(G.eqA,0,G.inv.a.length-1);}
  }else{
    const i=G.inv.w.indexOf(inst);
    if(i>=0){
      G.inv.w.splice(i,1);
      const fix=e=>e===i?-2:(e>i?e-1:e);
      G.eqM=fix(G.eqM);G.eqO=G.eqO>=0?fix(G.eqO):-1;
      if(G.eqM===-2)G.eqM=G.inv.w.length?0:-1;
      if(G.eqO===-2)G.eqO=-1;
    }
  }
  refreshButtons();
}
function canCraftHere(){
  return hasSkill('smith')||G.nearProps.some(p=>p.t==='forge'&&hyp(p.x-G.p.x,p.y-G.p.y)<70);
}
function recCost(rec){return {w:rec.w,o:rec.o,l:rec.l,c:rec.c};}
function canAfford(rec){
  return G.mat.wood>=rec.w&&G.mat.ore>=rec.o&&G.mat.leather>=rec.l&&G.coins>=rec.c;
}
function doCraft(rec){
  if(!canAfford(rec)){sfx('err');return false;}
  G.mat.wood-=rec.w;G.mat.ore-=rec.o;G.mat.leather-=rec.l;G.coins-=rec.c;
  let name;
  if(rec.k.startsWith('A:')){const k=rec.k.slice(2);addArm(k);name=ARM[k].n;}
  else if(rec.k==='I:arrows'){G.arrows+=4;name='4 arrows';}
  else if(rec.k==='I:bombs'){G.pouch=true;G.bombs+=2;name='2 bombs';}
  else if(rec.k==='I:rod'){G.rod=true;name='a fishing rod';}
  else{addWpn(rec.k);name=WPN[rec.k].n;}
  sfx('anvil');addXP('craft',15);G.stats.crafted++;
  toast('Crafted '+name);spawnP(G.p.x,G.p.y-8,'#ffd66e',8,90,.5,2,true);
  refreshButtons();autosave();
  return true;
}
function repairInst(inst,isArm){
  if(!inst||inst.dur>=inst.mx)return false;
  if(isArm){
    if(G.mat.leather>0)G.mat.leather--;
    else if(G.mat.ore>0)G.mat.ore--;
    else{sfx('err');toast('Repairs need leather or ore');return false;}
  }else{
    if(G.mat.ore>0)G.mat.ore--;
    else{sfx('err');toast('Repairs need iron ore');return false;}
  }
  inst.dur=hasSkill('master')?inst.mx:Math.min(inst.mx,inst.dur+40);
  inst.warn=0;
  sfx('anvil');addXP('craft',8);toast('Repaired '+(isArm?aDef(inst).n:wDef(inst).n));
  return true;
}
function upgradeInst(inst){
  const cap=hasSkill('master')?5:3;
  if(!inst||inst.up>=cap)return false;
  const cost=20*(inst.up+1);
  if(G.mat.ore<2||G.coins<cost){sfx('err');toast('Upgrade needs 2 ore + '+cost+'c');return false;}
  G.mat.ore-=2;G.coins-=cost;inst.up++;
  sfx('anvil');addXP('craft',12);
  toast(wDef(inst).n+' upgraded to +'+inst.up);
  return true;
}

/* ================= damage ================= */
function meleeVictims(){
  const out=[{kind:'p',x:G.p.x,y:G.p.y,r:G.p.r}];
  for(const e of G.ents)
    if(e.t==='ally'&&!e.dead&&!e.down)out.push({kind:'ally',e,x:e.x,y:e.y,r:e.r});
  return out;
}
function resolveEnemyStrike(e,reach,arc,dmg){
  let hitP=false;
  for(const v of meleeVictims()){
    const d=hyp(v.x-e.x,v.y-e.y);
    if(d>reach+v.r)continue;
    if(Math.abs(angDiff(e.face,angTo(e.x,e.y,v.x,v.y)))>arc)continue;
    if(v.kind==='p'){damageP(dmg,e.x,e.y,e);hitP=true;}
    else damageAlly(v.e,dmg,e.x,e.y);
  }
  return hitP;
}
function damageP(dmg,sx,sy,src){
  const p=G.p;
  if(G.mode!=='play'||p.hp<=0)return;
  if(p.act==='roll'&&p.actT<.18){
    const dur=hasSkill('flow')?2.3:1.15;
    G.slow=dur;p.flurry=hasSkill('flow')?4.4:2.4;sfx('flurry');
    spawnP(p.x,p.y,'#bfe8ff',12,90,.5,2,true);
    addXP('guard',8);addXP('agility',4);
    lumTip('flurry');
    return;
  }
  if(p.iv>0)return;
  const arm=eqArm(),def=arm?aDef(arm).def:0;
  let real=Math.max(1,Math.round((dmg-def*.5)*(hasSkill('skin')?.75:1)));
  if(arm)degrade(arm,.6,true);
  addXP('guard',real*3);
  p.hp-=real;p.iv=.9;G.hurtT=.55;G.shake=Math.max(G.shake,5);sfx('hurt');
  if(src&&src.eaf==='molten'){G.pburn=3;addFt(p.x,p.y-24,'Burning!','#ff9a4a');}
  if(src&&src.eaf==='frost'){G.chill=2.2;addFt(p.x,p.y-24,'Chilled!','#9fd8ff');}
  if(src&&src.eaf==='vamp'&&src.hp>0){src.hp=Math.min(src.mhp,src.hp+real*2);
    spawnP(src.x,src.y,'#a03050',6,70,.4,2,true);}
  if(sx!==undefined){const a=angTo(sx,sy,p.x,p.y);p.kbx+=Math.cos(a)*190;p.kby+=Math.sin(a)*190;}
  spawnP(p.x,p.y,'#e05b4b',8,90,.4,2);
  if(p.mount==='horse'&&real>=3){dismount();addFt(p.x,p.y-24,'Knocked from the saddle!','#f2e9d8');}
  if(hasSkill('retrib')&&sx!==undefined){
    for(const e of G.ents){
      if(e.dead||e.t==='npc'||e.t==='ally'||e.hp<=0)continue;
      if(hyp(e.x-p.x,e.y-p.y)<56){
        const a=angTo(p.x,p.y,e.x,e.y);
        e.kbx+=Math.cos(a)*300;e.kby+=Math.sin(a)*300;
        damageE(e,2,a,0,true);
      }
    }
  }
  if(p.hp<=0){
    if(hasSkill('wind2')&&p.undyDay!==G.dayN){
      p.undyDay=G.dayN;p.hp=1;p.iv=1.4;G.slow=1;
      sfx('flurry');toast('Second Wind — death refuses you, once');
      spawnP(p.x,p.y,'#ffd66e',18,140,.8,2.5,true);
      return;
    }
    p.hp=0;die();
  }
}
function damageAlly(e,dmg,sx,sy){
  if(e.down||e.iv>0)return;
  e.hp-=dmg;e.flash=.14;e.iv=.5;
  spawnP(e.x,e.y,'#e05b4b',5,80,.4,1.8);
  if(sx!==undefined){const a=angTo(sx,sy,e.x,e.y);e.kbx+=Math.cos(a)*150;e.kby+=Math.sin(a)*150;}
  if(e.hp<=0){e.hp=0;e.down=true;e.downT=13;
    toast(e.name+' is down — help them up!');sfx('hurt');}
}
function damageE(e,dmg,ang,kb,noStop){
  if(e.hp<=0||e.dead||e.hidden||e.t==='ally'||e.t==='npc')return;
  const mult=e.st==='stun'?1.5:1;
  dmg=Math.max(1,Math.round(dmg*mult));
  e.hp-=dmg;e.flash=.14;
  const kw=(e.t==='warden'||e.t==='king')?.22:1;
  e.kbx+=Math.cos(ang)*150*(kb||1)*kw;
  e.kby+=Math.sin(ang)*150*(kb||1)*kw;
  addFt(e.x,e.y-e.r-8,String(dmg),G.p.flurry>0?'#ffd66e':'#fff');
  if(!noStop){G.freeze=Math.max(G.freeze,.05);}
  G.shake=Math.max(G.shake,2.2);
  sfx('hit');spawnP(e.x,e.y,'#fff',5,110,.3,1.6);
  if(e.hp<=0)killE(e);
  else if(!e.aggro){e.aggro=true;addFt(e.x,e.y-e.r-14,'!','#ffd66e');}
}
function areaWpnPool(x,y){
  if(G.inDun&&G.dun){x=G.dun.surfX;y=G.dun.surfY;}
  const far=hyp(x-SP.spawn.tx*TILE,y-SP.spawn.ty*TILE)/TILE;
  if(far>170)return['knight','waraxe','ironspear','twinfang','hammer'];
  if(far>80)return['soldier','forged','spear','axe','hammer'];
  return['dagger','spear','axe','soldier'];
}
function killE(e){
  if(e.dead)return;
  e.hp=0;e.dead=true;G.stats.kills++;
  spawnP(e.x,e.y,e.t==='wisp'?'#b78ad2':'#4a4258',14,120,.5,2.4);
  sfx('thud');
  const d=EDEF[e.t];
  const cm=(e.elite?3:1)*(G.inDun?1.5:1);
  const n=Math.round(irnd(Math.ceil(d.coin/2),d.coin)*cm*goldMul());
  for(let i=0;i<n;i++)addDrop(e.x,e.y,'coin');
  if(Math.random()<.14)addDrop(e.x,e.y,'heart');
  if(Math.random()<(e.elite?.35:.07))addDrop(e.x,e.y,Math.random()<.7?'pot:hp':'pot:mp');
  if(Math.random()<(e.elite?.12:.02))addDrop(e.x,e.y,'scroll');
  if((affix(eqMain(),'leech')||affix(eqOff(),'leech'))&&G.p.hp>0){
    G.p.hp=Math.min(totHp(),G.p.hp+1);
    spawnP(G.p.x,G.p.y,'#a03050',3,50,.4,1.6,true);
  }
  const tr=hasSkill('tracker')?2:1;
  if(e.t==='boar'){for(let i=0;i<tr;i++)addDrop(e.x,e.y,'food:meat');
    if(Math.random()<.4)addDrop(e.x,e.y,'mat:leather');
    addXP('hunt',8);G.stats.hunts++;}
  if(e.t==='deer'){for(let i=0;i<2*tr;i++)addDrop(e.x,e.y,'food:meat');
    for(let i=0;i<tr;i++)addDrop(e.x,e.y,'mat:leather');
    addXP('hunt',10);G.stats.hunts++;}
  if(e.t==='wolf'){addDrop(e.x,e.y,'mat:leather');addDrop(e.x,e.y,'food:meat');
    addXP('hunt',12);G.stats.hunts++;}
  if(e.t==='archer')for(let i=0;i<3;i++)addDrop(e.x,e.y,'arrow');
  if(e.t==='bandit'&&Math.random()<.25)addDrop(e.x,e.y,'mat:ore');
  if(e.t==='brute'&&Math.random()<.5)addDrop(e.x,e.y,'mat:ore');
  const wch=e.elite?1:(e.t==='brute'?.2:(e.t==='bandit'?.08:0));
  if(Math.random()<wch){
    const boost=(e.elite?1:0)+(G.inDun?G.dun.depth:0);
    if(e.elite&&Math.random()<.25)addDropInst(e.x,e.y,rollInst(pick(['leather','mail']),boost));
    else addDropInst(e.x,e.y,rollInst(pick(areaWpnPool(e.x,e.y)),boost));
  }
  if(e.t==='wisp')questEvent('wispKill');
  if(e.camp){const c=G.camps.get(e.camp);
    if(c){c.alive--;
      if(c.alive<=0&&!flag('camp:'+e.camp)){setFlag('camp:'+e.camp);
        toast('Camp cleared — its chest is unlocked!');sfx('chest');
        questEvent('campCleared',e.camp);autosave();}}}
  if(e.trial&&G.trial)G.trial.left--;
  if(e.t==='warden'){if(e.dunBoss)dunBossDown(e);else wardenDown(e);}
  if(e.t==='king')kingDown(e);
}
function wardenDown(e){
  setFlag('warden:'+e.wid);
  G.shards++;G.boss=null;
  G.p.maxhp=Math.min(48,G.p.maxhp+4);G.p.hp=totHp();
  sfx('orb');G.shake=6;
  spawnP(e.x,e.y,'#ffd66e',24,140,.9,3,true);
  for(let i=0;i<10;i++)addDrop(e.x,e.y,'coin');
  addDrop(e.x,e.y,'mat:ore');addDrop(e.x,e.y,'mat:ore');
  toast('Crown Shard recovered — '+G.shards+' of 4 · Heart container gained!');
  if(G.shards>=4){G.mq=Math.max(G.mq,3);
    if(!G.inv.w.some(w=>w.k==='ember')){const i=addWpn('ember');G.eqM=G.inv.w.indexOf(i);}}
  const mem=WARDEN_MEM[e.wid]||[];
  startDlg(mem.concat(G.shards>=4?[{n:'Lumen',t:'Four shards! They are singing, they want to go home. I have folded their heat into a blade for you — the EMBER BLADE. Now… the Citadel gate will open. He is waiting.'}]:[]),
    {end(){refreshObjective();autosave();}});
}
function kingDown(e){
  setFlag('kingdead');G.boss=null;G.mq=5;
  spawnP(e.x,e.y,'#f6edd9',40,180,1.4,3,true);
  endingStart();
}

/* ================= projectiles / spells ================= */
function firePr(t,x,y,a,sp,dmg){
  G.pr.push({t,x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,a,dmg,
    ttl:t==='bomb'?1.3:2.4,from:(t==='arrow'||t==='bomb'||t==='sbolt'||t==='abolt'||t==='aarrow')?'p':'e'});
}
function aimAngle(){
  const tgt=nearestEnemy(300);
  return tgt?angTo(G.p.x,G.p.y,tgt.x,tgt.y):G.p.face;
}
function castSpell(){
  const p=G.p,s=SPELLS[G.spellEq];
  if(!s||!G.spells.includes(G.spellEq))return;
  if(G.mana<s.mp){sfx('err');addFt(p.x,p.y-20,'Not enough mana','#9fd8ff');return;}
  G.mana-=s.mp;G.manaCd=1.6;
  addXP('magic',Math.round(s.mp*.8));
  sfx('cast');p.act='cast';p.actT=0;p.dur=.3;
  switch(G.spellEq){
    case'bolt':{
      const a=aimAngle();p.face=a;
      firePr('sbolt',p.x+Math.cos(a)*12,p.y+Math.sin(a)*12,a,330,6+lvlFor(G.xp.magic));
      break;}
    case'gale':{
      const a=p.face;let nx=p.x,ny=p.y;
      for(let s2=0;s2<12;s2++){
        const tx=nx+Math.cos(a)*8,ty=ny+Math.sin(a)*8;
        const t=tileAtPx(tx,ty);
        if(SOLIDT(t)||CLIMBT(t))break;
        nx=tx;ny=ty;
      }
      spawnP(p.x,p.y,'#e8f4ff',12,90,.4,2,true);
      p.x=nx;p.y=ny;p.iv=Math.max(p.iv,.4);
      spawnP(p.x,p.y,'#e8f4ff',12,90,.4,2,true);
      break;}
    case'mend':{
      p.hp=Math.min(totHp(),p.hp+8);sfx('heal');
      spawnP(p.x,p.y,'#8fce6a',14,80,.7,2,true);
      break;}
    case'frost':{
      sfx('frost');ringP(p.x,p.y,'#9fd8ff');
      for(const e of G.ents){
        if(e.dead||e.t==='npc'||e.t==='ally'||e.hp<=0)continue;
        if(hyp(e.x-p.x,e.y-p.y)<140){e.frozen=2.6;damageE(e,2,angTo(p.x,p.y,e.x,e.y),.3,true);}
      }
      break;}
    case'storm':{
      sfx('zap');
      const foes=G.ents.filter(e=>!e.dead&&e.t!=='npc'&&e.t!=='ally'&&e.hp>0&&!e.hidden&&hyp(e.x-p.x,e.y-p.y)<300)
        .sort((a,b)=>hyp(a.x-p.x,a.y-p.y)-hyp(b.x-p.x,b.y-p.y)).slice(0,3);
      for(const e of foes){
        G.px.push({x:e.x,y:e.y-90,vx:0,vy:0,t:0,ttl:.25,c:'#e8f0ff',r:3,bolt:1,ty:e.y});
        damageE(e,8+lvlFor(G.xp.magic),rnd(TAU),1.4);
      }
      G.shake=Math.max(G.shake,5);
      break;}
  }
}
function explode(x,y){
  sfx('boom');G.shake=9;ringP(x,y,'#ffb35c');
  spawnP(x,y,'#ffb35c',18,160,.5,3,true);spawnP(x,y,'#5d5458',12,120,.7,2.6);
  for(const e of G.ents){
    if(e.dead||e.t==='npc')continue;
    const dp=hyp(e.x-x,e.y-y);
    if(dp<64){
      if(e.t==='ally')damageAlly(e,2,x,y);
      else damageE(e,6,angTo(x,y,e.x,e.y),1.8);
    }
  }
  if(hyp(G.p.x-x,G.p.y-y)<46)damageP(2,x,y);
  for(const pr of propsNear(x,y,1)){
    if(pr.t==='boulder'&&!flag('op:'+pr.id)&&hyp(pr.x-x,pr.y-y)<72){
      setFlag('op:'+pr.id);sfx('thud');
      spawnP(pr.x,pr.y,'#8d8577',14,130,.7,3);
      const nn=irnd(2,4);
      for(let i=0;i<nn;i++)addDrop(pr.x,pr.y,'mat:ore');
      for(let i=0;i<3;i++)addDrop(pr.x,pr.y,'coin');
      toast('The boulder cracks open — iron ore!');
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
    if(b.t==='sbolt'&&Math.random()<dt*30)
      G.px.push({x:b.x,y:b.y,vx:rnd(-15,15),vy:rnd(-15,15),t:0,ttl:.3,c:'#ffb35c',r:1.6,add:true});
    const t=tileAtPx(b.x,b.y);
    if(SOLIDT(t)||CLIMBT(t)){
      if(b.t==='arrow'||b.t==='earrow'||b.t==='aarrow'){b.stuck=true;b.ttl=Math.min(b.ttl,2);}
      else{if(b.t==='sbolt')spawnP(b.x,b.y,'#ffb35c',6,80,.3,2,true);b.dead=true;}
      continue;
    }
    if(b.from==='p'){
      for(const e of G.ents){
        if(e.dead||e.t==='npc'||e.t==='ally'||e.hidden||e.hp<=0)continue;
        if(hyp(e.x-b.x,e.y-b.y)<e.r+5){
          let dm=b.dmg;
          if(b.t==='arrow')addXP('archery',dm);
          if(b.t==='sbolt')spawnP(b.x,b.y,'#ffb35c',8,90,.4,2,true);
          damageE(e,dm*(G.p.flurry>0?1.5:1),b.a,.8);
          b.dead=true;break;}
      }
    }else{
      if(hyp(p.x-b.x,p.y-b.y)<p.r+5){damageP(b.dmg,b.x,b.y);b.dead=true;continue;}
      for(const e of G.ents){
        if(e.t!=='ally'||e.dead||e.down)continue;
        if(hyp(e.x-b.x,e.y-b.y)<e.r+5){damageAlly(e,b.dmg,b.x,b.y);b.dead=true;break;}
      }
    }
    if(b.ttl<=0)b.dead=true;
  }
  G.pr=G.pr.filter(b=>!b.dead&&b.ttl>-1);
}

/* ================= spawning & world population ================= */
function mkE(t,x,y,o){
  const d=EDEF[t];
  const scale=(t==='warden'||t==='king'||t==='ally'||t==='npc')?1:1+G.shards*.15;
  const e=Object.assign({t,x,y,vx:0,vy:0,r:d.r,hp:Math.round(d.hp*scale),mhp:Math.round(d.hp*scale),
    face:rnd(TAU),st:'idle',tm:rnd(.5,2),cd:rnd(.6,1.4),flash:0,kbx:0,kby:0,aggro:false,
    anim:rnd(9),hx:x,hy:y,frozen:0,iv:0},o||{});
  if(e.elite){
    e.hp=Math.round(e.hp*2.2);e.mhp=e.hp;e.r*=1.2;
    if(!e.eaf&&Math.random()<.6)e.eaf=pick(['swift','molten','frost','vamp']);
    if(e.eaf==='swift')e.spd=(e.spd||d.spd)*1.45;
  }
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
/* occupations: every resident lives a day around theirs */
const VILJOBS={elder:'elder',boro:'smith',pip:'child',sella:'merchant',
  wren:'scholar',holt:'hunter',rhoa:'captain',zef:'merchant',juno:'child'};
const VILNAMES=['Tam','Bryn','Odo','Mira','Fenn','Lark','Ivo','Nessa','Corb','Ryla','Dott','Hale','Wick','Sorrel','Petra','Aldous'];
const JOBTITLE={farmer:'the Farmer',fisher:'the Fisher',guard:'of the Watch',wood:'the Woodcutter',herb:'the Herbalist'};
const NPCSAY={
  farmer:['These rows won\u0027t hoe themselves.','Rain would be welcome.','Good soil this year.'],
  fisher:['They\u0027re biting slow.','The river keeps its own hours.','Caught a boot yesterday.'],
  guard:['All quiet.','Keep to the lamps after dark.','The watch never sleeps.'],
  wood:['Timber doesn\u0027t warn twice.','Good ash in the deepwood.'],
  herb:['Yarrow, feverfew, thistle…','The meadow provides.'],
  child:['Tag! You\u0027re it!','Have you fought a WOLF?','I\u0027m not tired!'],
  merchant:['Fresh wares!','Everything\u0027s for sale. Almost.'],
  smith:['Mind the sparks.','Iron keeps honest hours.'],
  elder:['Bless the wild.','The fire remembers.'],
  scholar:['Fascinating…','The old texts were right.'],
  hunter:['Wind\u0027s from the north.','Tracks by the tree line.'],
  captain:['Eyes up, wanderer.','Dunewatch stands.'],
  villager:['Fair morning.','Mind the roads at night.']};
const _TOOLS={};
const jobTool=j=>_TOOLS[j]||(_TOOLS[j]=mkInst(j==='smith'?'hammer':(j==='wood'?'axe':'spear')));
function vilWaterSpot(poi){
  for(let r=6;r<40;r+=3)for(let a=0;a<14;a++){
    const tx=Math.round(poi.tx+Math.cos(a/14*TAU)*r),ty=Math.round(poi.ty+Math.sin(a/14*TAU)*r);
    if(WATERT(baseTileAt(tx,ty)))return{x:tx*TILE+12,y:ty*TILE+12};
  }
  return null;
}
function spawnVilNPCs(poi){
  const X=poi.tx*TILE+12,Y=poi.ty*TILE+12;
  const homes=VHUTS.map(h=>({x:X+h[0],y:Y+h[1]+31}));
  let hi=hashi(poi.tx,poi.ty,NS+701)%homes.length;
  const water=vilWaterSpot(poi);
  const add=(key,name,job,look,ox,oy)=>{
    if(G.team.some(m=>m.key===key))return;
    const e=mkE('npc',X+ox,Y+oy,{key,name,vi:poi.vi,hp:999,mhp:999,job,
      home:homes[(hi++)%homes.length],cx:X,cy:Y,look});
    switch(job){
      case'elder':e.work={x:X,y:Y-58};break;
      case'smith':e.work={x:X+46,y:Y-10};break;
      case'merchant':e.work={x:X-4,y:Y+32};break;
      case'scholar':e.work={x:X-26,y:Y-54};break;
      case'captain':case'guard':e.work={x:X,y:Y};e.patrol=rnd(TAU);break;
      case'hunter':case'wood':{const a=(hashi(poi.tx,key.length*7,NS+702)%628)/100;
        e.work={x:X+Math.cos(a)*300,y:Y+Math.sin(a)*300};break;}
      case'farmer':{const f=SP.fields[poi.vi];
        e.work=f?{x:f.tx*TILE+12,y:f.ty*TILE+12}:{x:X+96,y:Y+74};break;}
      case'fisher':
        if(water){e.work={x:water.x-Math.sign(water.x-X)*26,y:water.y-Math.sign(water.y-Y)*26};e.fishSpot=water;}
        else{e.job='wood';e.work={x:X+270,y:Y-130};}
        break;
      case'child':e.work={x:X,y:Y+12};break;
      default:e.work={x:X,y:Y};
    }
    return e;
  };
  for(const n of NPCS[poi.vi]||[])add(n.key,n.name,VILJOBS[n.key]||'villager',null,n.ox,n.oy);
  const JOBSETS=[['farmer','fisher','guard','guard','wood','herb','child'],
                 ['farmer','guard','guard','wood','herb','child','fisher'],
                 ['fisher','guard','guard','farmer','herb','child','wood']][poi.vi]||[];
  const sp2=(h,arr)=>arr[Math.abs(h)%arr.length];
  JOBSETS.forEach((job,i)=>{
    const h=hashi(poi.tx*7+i,poi.ty+i*13,NS+703);
    const nm=sp2(h,VILNAMES)+(JOBTITLE[job]?' '+JOBTITLE[job]:'');
    const a=(h%628)/100,rr2=44+(h>>4)%56;
    add('v'+poi.vi+'g'+i,nm,job,{
      body:sp2(h,['#6a5a44','#5d6b45','#5f4232','#525f6e','#6a5578','#74604a','#4e5a50']),
      hair:sp2(h>>3,['#3a2d22','#241c16','#6e4228','#7c6142','#9a8a72']),
      skin:sp2(h>>6,['#d6ad84','#c69a70','#b8834f','#caa27b']),
      size:job==='child'?.7:1,
      hat:job==='farmer'?'#8a7448':null,
      hood:job==='herb'?'#5d5f4a':null},
      Math.cos(a)*rr2,Math.sin(a)*rr2);
  });
}
function ensureTeam(){
  for(let i=0;i<G.team.length;i++){
    const m=G.team[i];
    let e=G.ents.find(x=>x.t==='ally'&&x.key===m.key&&!x.dead);
    if(!e){
      const a=ALLYDEF[m.key];
      e=mkE('ally',G.p.x+rnd(-30,30),G.p.y+rnd(20,40),
        {key:m.key,name:a.n,cls:a.cls,hp:a.hp,mhp:a.hp,down:false,downT:0,idx:i});
    }
    e.idx=i;
    if(hyp(e.x-G.p.x,e.y-G.p.y)>520){e.x=G.p.x+rnd(-30,30);e.y=G.p.y+rnd(20,40);e.down=false;}
  }
  G.ents=G.ents.filter(e=>!(e.t==='ally'&&!G.team.some(m=>m.key===e.key)));
}
function allyWpn(e){
  const m=G.team.find(m=>m.key===e.key);
  if(m&&m.w)return wDmg(m.w)+1;
  const a=ALLYDEF[e.key];
  return a&&a.w?WPN[a.w].d:3;
}
function ensureSpawns(){
  const p=G.p;
  ensureTeam();
  if(G.inDun)return;
  for(const poi of POIS){
    const px=poi.tx*TILE+12,py=poi.ty*TILE+12;
    const d=hyp(px-p.x,py-p.y);
    if(d<210&&!flag('seen:'+poi.id)){
      setFlag('seen:'+poi.id);
      if(poi.k==='vil'){toast('Discovered '+poi.name);sfx('pick');
        G.lastSafe={x:px,y:py+60};questEvent('vil',poi);}
      else if(poi.k==='tower'||poi.k==='ruins'||poi.k==='cit'||poi.k==='dock')toast('Discovered '+poi.name);
      else if(poi.k==='shrine')toast('Discovered an ancient shrine');
      else if(poi.k==='fire')toast('Discovered a campfire waypoint');
    }
    if(d<540){
      if(poi.k==='camp'&&!flag('camp:'+poi.id)){
        let c=G.camps.get(poi.id);
        if(!c||!c.spawned){
          const roster=campRoster(poi);
          G.camps.set(poi.id,{alive:roster.length,spawned:true});
          const eliteI=hashi(poi.tx,poi.ty,NS+502)%10===0?0:-1;
          roster.forEach((t,i)=>{const a=i/roster.length*TAU;
            mkE(t,px+Math.cos(a)*42,py+Math.sin(a)*36,{camp:poi.id,elite:i===eliteI?1:0});});
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
    if(e.t==='ally')continue;
    if(d>950){e.dead=true;
      if(e.camp){const c=G.camps.get(e.camp);if(c)c.spawned=false;}}
  }
  const night=G.dayT>.74||G.dayT<.03;
  if(night&&Math.random()<.35){
    const ns=G.ents.filter(e=>e.t==='zombie'&&!e.dead).length;
    if(ns<5){
      const a=rnd(TAU),x=p.x+Math.cos(a)*rnd(260,360),y=p.y+Math.sin(a)*rnd(260,360);
      const t=tileAtPx(x,y);
      const nearVil=SP.vils.some(v=>hyp(x-v.tx*TILE,y-v.ty*TILE)<300);
      if(!WATERT(t)&&!SOLIDT(t)&&!CLIMBT(t)&&!nearVil&&t!==T_BLIGHT&&t!==T_STONE){
        mkE('zombie',x,y,{aggro:true,rise:1,spd:46+hashi(Math.round(x),Math.round(y),3)%16});
        if(Math.random()<.4)mkE('zombie',x+rnd(-44,44),y+rnd(-44,44),{aggro:true,rise:1.4,spd:46+hashi(Math.round(y),Math.round(x),5)%16});
      }
    }
  }
  if(night&&Math.random()<.18){
    const nw=G.ents.filter(e=>e.t==='wolf'&&!e.dead).length;
    if(nw<3){
      const a=rnd(TAU),x=p.x+Math.cos(a)*360,y=p.y+Math.sin(a)*360;
      const t=tileAtPx(x,y);
      if(t===T_FGRASS){mkE('wolf',x,y,{});mkE('wolf',x+30,y+16,{});}
    }
  }
  const wild=G.ents.filter(e=>!e.dead&&!e.camp&&!e.trial&&e.t!=='npc'&&e.t!=='ally'&&e.t!=='warden'&&e.t!=='king'&&e.t!=='skel'&&e.t!=='zombie').length;
  if(wild<6&&Math.random()<.4){
    const a=rnd(TAU),x=p.x+Math.cos(a)*400,y=p.y+Math.sin(a)*400;
    const t=tileAtPx(x,y);
    const nearVil=SP.vils.some(v=>hyp(x-v.tx*TILE,y-v.ty*TILE)<320);
    if(!nearVil&&!WATERT(t)&&!SOLIDT(t)&&!CLIMBT(t)){
      if(t===T_BLIGHT||t===T_ASH){if(!G.healed)mkE('wisp',x,y,{});}
      else if(t===T_GRASS||t===T_MEADOW)mkE(pick(['boar','blob','deer','deer']),x,y,{});
      else if(t===T_FGRASS)mkE(pick(['blob','deer']),x,y,{});
      else if(t===T_SNOW&&Math.random()<.5)mkE('deer',x,y,{});
      else if(t===T_DESERT&&Math.random()<.5)mkE('blob',x,y,{});
    }
  }
}

/* ================= AI ================= */
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
  const mod=hasSkill('shadow')?.75:1;
  if(!e.aggro&&dp<ag*mod&&G.p.hp>0){e.aggro=true;sfx('alert');addFt(e.x,e.y-e.r-12,'!','#ffd66e');}
  if(e.aggro&&dp>560&&e.t!=='warden'&&e.t!=='king')e.aggro=false;
}
function updEnt(e,dt){
  if(e.flash>0)e.flash-=dt;
  if(e.iv>0)e.iv-=dt;
  e.cd-=dt;e.tm-=dt;
  if(e.burn>0){
    e.burn-=dt;e.bAcc=(e.bAcc||0)+dt;
    if(e.bAcc>=.8){e.bAcc-=.8;
      spawnP(e.x,e.y-4,'#ff9a4a',3,50,.4,1.6,true);
      damageE(e,1,rnd(TAU),0,true);}
  }
  if(e.frozen>0){
    e.frozen-=dt;e.vx=0;e.vy=0;
    const dk=Math.pow(.0005,dt);e.kbx*=dk;e.kby*=dk;
    moveEnt(e,e.kbx*dt,e.kby*dt,()=>false);
    return;
  }
  const p=G.p,dp=hyp(e.x-p.x,e.y-p.y),d=EDEF[e.t];
  const blk=(x,y)=>{const t=tileAtPx(x,y);
    return SOLIDT(t)||CLIMBT(t)||(e.t!=='wisp'&&WATERT(t));};
  const edmg=v=>v+(e.elite?1:0);
  switch(e.t){
    case'npc':{
      if(!e.job){ // wanderers without a livelihood keep the old habits
        if(dp<60){e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,p.x,p.y);}
        else wander(e,dt,16);
        break;}
      const t2=G.dayT;
      const night=t2>.74||t2<.04, evening=!night&&t2>.62, dawn=t2>=.04&&t2<.12;
      const guard=e.job==='guard'||e.job==='captain';
      /* a passing hero outranks chores (but not sleep or a fight) */
      if(dp<50&&!e.sleep&&!guard){
        e.vx=0;e.vy=0;e.working=0;
        e.face+=angDiff(e.face,angTo(e.x,e.y,p.x,p.y))*Math.min(1,dt*8);
        if(e.greetCd===undefined)e.greetCd=rnd(3,14);
        e.greetCd-=dt;
        if(e.greetCd<=0&&dp<40){e.greetCd=rnd(30,70);
          addFt(e.x,e.y-26,pick(NPCSAY[e.job]||NPCSAY.villager),'#e8dcc0');}
        break;}
      /* trouble near the village: guards close in, everyone else runs home */
      let threat=null,tdd=1e9;
      for(const f of G.ents){
        if(f.dead||f.hp<=0||f.hidden||f.t==='npc'||f.t==='ally')continue;
        if(f.t==='deer')continue;
        if((f.t==='boar'||f.t==='blob')&&!f.aggro)continue;
        if(hyp(f.x-e.cx,f.y-e.cy)>300)continue;
        const de=hyp(f.x-e.x,f.y-e.y);
        if(de<tdd){tdd=de;threat=f;}
      }
      if(threat&&!guard&&tdd<210&&!e.sleep){
        const a=angTo(e.x,e.y,e.home.x,e.home.y);
        e.face=a;e.vx=Math.cos(a)*84;e.vy=Math.sin(a)*84;e.working=0;
        if(hyp(e.x-e.home.x,e.y-e.home.y)<15){e.sleep=1;e.hidden=true;e.vx=0;e.vy=0;}
        break;
      }
      if(guard&&threat&&tdd<340){
        const a=angTo(e.x,e.y,threat.x,threat.y);e.face=a;e.working=1;
        if(e.st==='windup'){e.vx=0;e.vy=0;
          if(e.tm<=0){e.st='swing';e.tm=.18;sfx('swing');
            if(hyp(threat.x-e.x,threat.y-e.y)<46)damageE(threat,3,a,1.3);}}
        else if(e.st==='swing'){if(e.tm<=0)e.st='idle';}
        else if(tdd>36){e.vx=Math.cos(a)*92;e.vy=Math.sin(a)*92;}
        else{e.vx=0;e.vy=0;
          if(e.cd<=0){e.cd=1.2;e.st='windup';e.tm=.3;}}
        break;
      }
      /* wake with the light */
      if(e.sleep){
        if(!night&&!(threat&&tdd<210)){e.sleep=0;e.hidden=false;e.x=e.home.x;e.y=e.home.y;
          if(dp<420)addFt(e.x,e.y-24,'*yawn*','#cbbd9a');}
        else break;
      }
      /* where the day says to be */
      let tgt,act='walk';
      if(guard){ // the watch never sleeps, only circles
        e.patrol=(e.patrol||0)+dt*(night?.16:.12);
        tgt={x:e.cx+Math.cos(e.patrol)*(night?128:156),y:e.cy+Math.sin(e.patrol)*(night?96:118)};
      }else if(night){tgt=e.home;act='sleep';}
      else if(evening){
        if(!e.fireSpot){const h3=hashi(e.key.length*31+(e.home?e.home.x:0),7,NS+711);
          const a3=(h3%628)/100;
          e.fireSpot={x:e.cx+Math.cos(a3)*(26+h3%20),y:e.cy+8+Math.sin(a3)*(20+h3%14)};}
        tgt=e.fireSpot;act='fire';
      }else if(dawn){tgt={x:e.home.x,y:e.home.y-26};}
      else if(e.job==='child'){
        if(e.tm<=0||!e.play){e.tm=rnd(1.4,3);
          e.play={x:e.cx+rnd(-92,92),y:e.cy+rnd(-70,84)};}
        tgt=e.play;
      }else if(e.job==='herb'){
        if(!e.gath||e.tm<=0){e.tm=rnd(5,9);
          const a4=rnd(TAU);e.gath={x:e.cx+Math.cos(a4)*rnd(150,270),y:e.cy+Math.sin(a4)*rnd(130,230)};}
        tgt=e.gath;act='work';
      }else{tgt=e.work;act='work';}
      const td2=hyp(tgt.x-e.x,tgt.y-e.y);
      if(td2>16){
        const a=angTo(e.x,e.y,tgt.x,tgt.y);
        e.face+=angDiff(e.face,a)*Math.min(1,dt*8);
        const sp=e.job==='child'?66:(act==='sleep'?46:34);
        e.vx=Math.cos(a)*sp;e.vy=Math.sin(a)*sp;
        e.working=0;
      }else{
        e.vx*=.5;e.vy*=.5;
        if(act==='sleep'){e.sleep=1;e.hidden=true;e.vx=0;e.vy=0;}
        else if(act==='work'){
          e.working=1;
          e.wkT=(e.wkT||rnd(0,1))+dt;
          const cyc=e.job==='smith'?1.1:1.5;
          if(e.wkT>=cyc){e.wkT-=cyc;
            if(dp<420){
              if(e.job==='smith'){sfx('thud');spawnP(e.work.x+4,e.work.y-10,'#ffb35c',4,60,.4,1.6,true);}
              else if(e.job==='farmer')spawnP(e.x+Math.cos(e.face)*10,e.y+6,'#8a7448',3,40,.4,1.5);
              else if(e.job==='wood'){sfx('thud');spawnP(e.x+Math.cos(e.face)*12,e.y,'#b3a180',3,50,.4,1.5);}
              else if(e.job==='herb')spawnP(e.x,e.y+4,'#8fce6a',2,30,.5,1.4,true);
            }
          }
          if(e.job==='fisher'&&e.fishSpot)
            e.face+=angDiff(e.face,angTo(e.x,e.y,e.fishSpot.x,e.fishSpot.y))*Math.min(1,dt*6);
        }else{e.working=0;
          if(act==='fire')e.face+=angDiff(e.face,angTo(e.x,e.y,e.cx,e.cy+8))*Math.min(1,dt*5);}
      }
      /* neighbourly murmurs */
      if(e.working&&dp<300){
        if(e.sayCd===undefined)e.sayCd=rnd(10,40);
        e.sayCd-=dt;
        if(e.sayCd<=0){e.sayCd=rnd(40,90);
          addFt(e.x,e.y-26,pick(NPCSAY[e.job]||NPCSAY.villager),'#cbbd9a');}
      }
      break;}
    case'ally':{
      if(e.down){
        e.vx=0;e.vy=0;e.downT-=dt;
        if(e.downT<=0){e.down=false;e.hp=Math.round(e.mhp*.5);
          addFt(e.x,e.y-20,e.name+' rises!','#8fce6a');}
        break;}
      let tgt=null,td=240;
      for(const f of G.ents){
        if(f.dead||f.t==='npc'||f.t==='ally'||f.hp<=0||f.hidden)continue;
        if(!f.aggro&&f.t!=='skel'&&f.t!=='zombie')continue;
        const dd=hyp(f.x-e.x,f.y-e.y);
        if(dd<td&&hyp(f.x-p.x,f.y-p.y)<340){td=dd;tgt=f;}
      }
      const dmg=Math.round(allyWpn(e)*(hasSkill('leader')?1.5:1));
      if(tgt){
        const a=angTo(e.x,e.y,tgt.x,tgt.y);e.face=a;
        if(e.cls==='archer'||e.cls==='mage'){
          if(td<80){e.vx=-Math.cos(a)*(e.spd||d.spd);e.vy=-Math.sin(a)*(e.spd||d.spd);}
          else if(td>200){e.vx=Math.cos(a)*(e.spd||d.spd);e.vy=Math.sin(a)*(e.spd||d.spd);}
          else{e.vx*=.5;e.vy*=.5;}
          if(e.cd<=0){e.cd=e.cls==='mage'?2.2:1.6;
            firePr(e.cls==='mage'?'abolt':'aarrow',e.x,e.y,a,e.cls==='mage'?280:340,dmg);
            sfx(e.cls==='mage'?'cast':'bow');
            e.st='shoot';e.tm=.2;}
        }else{
          const reach=e.cls==='hammer'?42:36;
          if(td>reach-4){e.vx=Math.cos(a)*(e.spd||d.spd);e.vy=Math.sin(a)*(e.spd||d.spd);}
          else{e.vx=0;e.vy=0;}
          if(e.st==='windup'){
            if(e.tm<=0){e.st='swing';e.tm=.15;sfx('swing');
              if(td<reach+tgt.r)damageE(tgt,dmg,a,e.cls==='hammer'?2:1);}
          }else if(e.st==='swing'){if(e.tm<=0)e.st='idle';}
          else if(td<reach+6&&e.cd<=0){e.st='windup';e.tm=e.cls==='hammer'?.5:.35;e.cd=1.3;}
        }
      }else{
        const slot=(e.idx||0)*1.9+2.4;
        const fx=p.x+Math.cos(p.face+Math.PI+slot-2.4)*(42+(e.idx||0)*14),
              fy=p.y+Math.sin(p.face+Math.PI+slot-2.4)*(42+(e.idx||0)*14);
        const fd=hyp(fx-e.x,fy-e.y);
        if(fd>26){const a=angTo(e.x,e.y,fx,fy);e.face=a;
          const sp=fd>120?(e.spd||d.spd)*1.5:(e.spd||d.spd);
          e.vx=Math.cos(a)*sp;e.vy=Math.sin(a)*sp;}
        else{e.vx*=.7;e.vy*=.7;}
      }
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
      if(dp<e.r+p.r+2&&e.aggro)damageP(edmg(1),e.x,e.y,e);
      break;}
    case'deer':{
      const scare=dp<130||G.pr.some(b=>hyp(b.x-e.x,b.y-e.y)<60);
      if(scare){
        const a=angTo(p.x,p.y,e.x,e.y)+rnd(-.3,.3);
        e.vx=Math.cos(a)*(e.spd||d.spd);e.vy=Math.sin(a)*(e.spd||d.spd);e.face=a;e.st='flee';e.tm=.8;
      }else if(e.st==='flee'){if(e.tm<=0){e.st='idle';e.vx=0;e.vy=0;}}
      else wander(e,dt,28);
      break;}
    case'wolf':{
      const day=!G.inDun&&!(G.dayT>.7||G.dayT<.06);
      if(day&&!e.aggro){e.dead=true;spawnP(e.x,e.y,'#5d5448',8,80,.4,2);break;}
      aggroCheck(e,dp,d.ag);
      if(e.st==='windup'){e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,p.x,p.y);
        if(e.tm<=0){e.st='lunge';e.tm=.24;
          e.vx=Math.cos(e.face)*340;e.vy=Math.sin(e.face)*340;}}
      else if(e.st==='lunge'){
        if(!resolveEnemyStrike(e,e.r+10,1.4,edmg(2))&&e.tm<=0){e.st='idle';e.cd=1.1;e.vx=0;e.vy=0;}
        else if(e.tm<=0){e.st='idle';e.cd=1.1;e.vx=0;e.vy=0;}}
      else if(e.aggro){
        const a=angTo(e.x,e.y,p.x,p.y)+Math.sin(G.vt*3+e.anim)*.4;
        e.face=a;e.vx=Math.cos(a)*(e.spd||d.spd);e.vy=Math.sin(a)*(e.spd||d.spd);
        if(dp<62&&e.cd<=0){e.st='windup';e.tm=.28;}
      }else wander(e,dt,40);
      break;}
    case'boar':{
      if(!e.aggro&&dp<75){e.aggro=true;sfx('alert');addFt(e.x,e.y-20,'!','#ffb35c');}
      if(e.st==='windup'){e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,p.x,p.y);
        if(e.tm<=0){e.st='charge';e.tm=1.0;
          e.vx=Math.cos(e.face)*300;e.vy=Math.sin(e.face)*300;sfx('roll');}}
      else if(e.st==='charge'){
        if(Math.random()<dt*20)spawnP(e.x,e.y+6,'#c9b48f',1,30,.4,1.5);
        if(dp<e.r+p.r+3){damageP(edmg(2),e.x,e.y,e);e.st='tired';e.tm=1;e.vx*=.1;e.vy*=.1;}
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
      const reach=e.t==='brute'?46:36,dmg=edmg(e.t==='brute'?3:2),wind=e.t==='brute'?.62:.45;
      if(e.st==='windup'){e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,p.x,p.y);
        if(e.tm<=0){e.st='swing';e.tm=.16;sfx('swing');
          resolveEnemyStrike(e,reach,1.25,dmg);}}
      else if(e.st==='swing'){if(e.tm<=0){e.st='cool';e.tm=e.t==='brute'?1.15:.85;}}
      else if(e.st==='cool'){
        const a=angTo(e.x,e.y,p.x,p.y)+Math.PI/2*(e.strafe||1);
        e.vx=Math.cos(a)*32;e.vy=Math.sin(a)*32;
        if(e.tm<=0)e.st='idle';}
      else{
        if(e.aggro){
          let tx=p.x,ty=p.y,tr=dp;
          for(const al of G.ents)
            if(al.t==='ally'&&!al.dead&&!al.down){
              const ad=hyp(al.x-e.x,al.y-e.y);
              if(ad<tr*.7){tr=ad;tx=al.x;ty=al.y;}
            }
          const a=angTo(e.x,e.y,tx,ty);e.face=a;
          if(tr>reach-6){e.vx=Math.cos(a)*(e.spd||d.spd);e.vy=Math.sin(a)*(e.spd||d.spd);}
          else{e.vx=0;e.vy=0;}
          if(tr<reach+6&&e.cd<=0){e.st='windup';e.tm=wind;e.cd=1.6;e.strafe=Math.random()<.5?1:-1;}
        }else wander(e,dt,34);}
      break;}
    case'archer':{
      aggroCheck(e,dp,d.ag);
      if(e.aggro){
        const a=angTo(e.x,e.y,p.x,p.y);e.face=a;
        if(e.st==='aim'){e.vx=0;e.vy=0;
          if(e.tm<=0){e.st='idle';e.cd=1.8;firePr('earrow',e.x,e.y,a,300,edmg(1));sfx('bow');}}
        else{
          if(dp<110){e.vx=-Math.cos(a)*(e.spd||d.spd);e.vy=-Math.sin(a)*(e.spd||d.spd);}
          else if(dp>235){e.vx=Math.cos(a)*(e.spd||d.spd);e.vy=Math.sin(a)*(e.spd||d.spd);}
          else{e.vx*=.6;e.vy*=.6;}
          if(e.cd<=0&&dp<270&&dp>60){e.st='aim';e.tm=.65;}
        }
      }else wander(e,dt,30);
      break;}
    case'zombie':{
      const day2=!G.inDun&&!(G.dayT>.72||G.dayT<.05);
      if(day2){e.dead=true;spawnP(e.x,e.y,'#6a7a58',10,80,.5,2);break;}
      if(e.rise>0){e.rise-=dt;e.vx=0;e.vy=0;
        if(Math.random()<dt*16)spawnP(e.x+rnd(-9,9),e.y+7,'#4a4034',2,44,.5,1.9);
        break;}
      e.aggro=dp<(e.ag||380);
      if(e.st==='grab'){
        resolveEnemyStrike(e,e.r+p.r+4,1.1,edmg(2));
        if(e.tm<=0){e.st='idle';e.cd=1.6;e.vx=0;e.vy=0;}}
      else if(e.st==='windup'){e.vx*=.5;e.vy*=.5;e.face=angTo(e.x,e.y,p.x,p.y);
        if(e.tm<=0){e.st='grab';e.tm=.35;
          e.vx=Math.cos(e.face)*150;e.vy=Math.sin(e.face)*150;}}
      else if(e.aggro){
        const a=angTo(e.x,e.y,p.x,p.y)+Math.sin(G.vt*1.7+e.anim)*.28;
        e.face=a;
        const sp=(e.spd||d.spd)*(1+Math.sin(G.vt*2.3+e.anim*2)*.25);
        e.vx=Math.cos(a)*sp;e.vy=Math.sin(a)*sp;
        if(dp<50&&e.cd<=0){e.st='windup';e.tm=.5;}
      }else wander(e,dt,16);
      break;}
    case'skel':{
      const day=!G.inDun&&!(G.dayT>.72||G.dayT<.05);
      if(day){e.dead=true;spawnP(e.x,e.y,'#dfe6ea',10,90,.5,2);break;}
      e.aggro=dp<340;
      if(e.st==='windup'){e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,p.x,p.y);
        if(e.tm<=0){e.st='lunge';e.tm=.24;
          e.vx=Math.cos(e.face)*330;e.vy=Math.sin(e.face)*330;}}
      else if(e.st==='lunge'){
        resolveEnemyStrike(e,e.r+p.r+3,1.5,edmg(1));
        if(e.tm<=0){e.st='idle';e.cd=1.0;e.vx=0;e.vy=0;}}
      else if(e.aggro){
        const a=angTo(e.x,e.y,p.x,p.y);e.face=a;
        e.vx=Math.cos(a)*(e.spd||d.spd);e.vy=Math.sin(a)*(e.spd||d.spd);
        if(dp<64&&e.cd<=0){e.st='windup';e.tm=.3;}
      }else wander(e,dt,40);
      break;}
    case'wisp':{
      aggroCheck(e,dp,d.ag);
      e.hov=(e.hov||0)+dt*3;
      if(e.aggro){
        const a=angTo(e.x,e.y,p.x,p.y);
        if(e.st==='cast'){e.vx*=.2;e.vy*=.2;
          if(e.tm<=0){e.st='idle';e.cd=2.2;firePr('orb',e.x,e.y,a,150,edmg(2));sfx('alert');}}
        else{
          if(dp<120){e.vx=-Math.cos(a)*70;e.vy=-Math.sin(a)*70;}
          else{e.vx=Math.cos(a+Math.sin(e.hov)*.7)*54;e.vy=Math.sin(a+Math.sin(e.hov)*.7)*54;}
          if(e.cd<=0&&dp<270){e.st='cast';e.tm=.8;}}
      }else{e.vx=Math.cos(e.hov*.7)*20;e.vy=Math.sin(e.hov*.9)*20;}
      break;}
    case'warden':{
      if(!e.aggro){
        if(dp<d.ag){e.aggro=true;G.boss={e,name:e.wname};sfx('roar');G.shake=6;
          if(e.butcher)addFt(e.x,e.y-34,'Ah… fresh meat!','#ff6a4a',true);
          else lumTip('warden');}
        break;}
      if(!G.boss||G.boss.e!==e)G.boss={e,name:e.wname};
      if(hyp(p.x-e.ax,p.y-e.ay)>560){
        e.aggro=false;G.boss=null;e.hp=e.mhp;e.x=e.ax;e.y=e.ay-34;e.st='idle';e.vx=0;e.vy=0;break;}
      if(e.hp<e.mhp*.5&&!e.summoned){e.summoned=true;
        for(let i=0;i<2;i++)mkE('wisp',e.x+rnd(-60,60),e.y+rnd(-60,60),{aggro:true});
        addFt(e.x,e.y-34,'RISE','#b78ad2',true);}
      bossBrain(e,dt,dp,d,e.hp<e.mhp*.5?1.25:1,3);
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
  moveEnt(e,(e.vx+e.kbx)*dt,(e.vy+e.kby)*dt,(e.t==='wisp')?()=>false:blk);
  const dk=Math.pow(.0005,dt);e.kbx*=dk;e.kby*=dk;
  e.anim+=dt*(hyp(e.vx,e.vy)>4?6:2);
}
function bossBrain(e,dt,dp,d,rage,dmg){
  switch(e.st){
    case'idle':{
      const a=angTo(e.x,e.y,G.p.x,G.p.y);e.face=a;
      if(dp>72){e.vx=Math.cos(a)*(e.spd||d.spd)*rage;e.vy=Math.sin(a)*(e.spd||d.spd)*rage;}
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
        resolveEnemyStrike(e,90,1.3,dmg);
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
      if(!e.slamHit&&Math.abs(dp-e.slamR)<17){e.slamHit=true;damageP(dmg,e.x,e.y,e);}
      if(e.tm<=0){e.st='idle';e.cd=1.7/rage;}
      break;}
    case'chargeW':{e.vx=0;e.vy=0;e.face=angTo(e.x,e.y,G.p.x,G.p.y);
      if(e.tm<=0){e.st='chargeGo';e.tm=.8;sfx('roar');
        e.vx=Math.cos(e.face)*430;e.vy=Math.sin(e.face)*430;}
      break;}
    case'chargeGo':{
      if(Math.random()<dt*30)spawnP(e.x,e.y+8,'#c9b48f',1,40,.4,2);
      if(dp<e.r+G.p.r+6){damageP(dmg,e.x,e.y,e);e.st='stun';e.tm=1.1;e.vx=0;e.vy=0;}
      else if(e.tm<=0){e.st='stun';e.tm=.95;e.vx=0;e.vy=0;}
      break;}
    case'stun':{if(e.tm<=0){e.st='idle';e.cd=.7;}break;}
  }
}

/* ================= player ================= */
function dismount(){
  const p=G.p;
  if(p.mount==='horse'&&G.horse){G.horse.x=p.x+14;G.horse.y=p.y;}
  if(p.mount==='boat'&&G.boat){G.boat.x=p.x;G.boat.y=p.y;}
  p.mount=null;refreshButtons();
}
function tryMount(kind){
  const p=G.p;
  if(kind==='horse'){p.mount='horse';sfx('gallop');}
  else{p.mount='boat';sfx('splash');p.x=G.boat.x;p.y=G.boat.y;}
  p.act='';p.aim=false;p.fish=null;refreshButtons();
}
function startFishing(){
  const p=G.p;
  const a=p.face;
  const fx=p.x+Math.cos(a)*44,fy=p.y+Math.sin(a)*44;
  if(!WATERT(tileAtPx(fx,fy))){toast('Face open water to fish');return;}
  p.fish={st:'wait',t:rnd(1.6,4.2)/(hasSkill('angler')?2:1),x:fx,y:fy};
  sfx('splash');spawnP(fx,fy,'#bfe3ff',5,40,.4,1.5);
}
function resolveFish(){
  const p=G.p;
  G.stats.fish++;addXP('hunt',8);
  const roll=Math.random();
  if(hasSkill('angler')&&roll<.18){addFood('gfish',1);toast('Caught a GOLDEN KOI — merchants pay well for these');sfx('chest');}
  else if(roll<.7){addFood('fish',1);toast('Caught a fish!');sfx('pick');}
  else{addFood('fish',1);addFood('fish',1);toast('Caught two fish!');sfx('pick');}
  spawnP(p.fish.x,p.fish.y,'#bfe3ff',10,90,.5,2);
  p.fish=null;
}
function updPlayer(dt){
  const p=G.p;
  p.iv=Math.max(0,p.iv-dt);p.flurry=Math.max(0,p.flurry-dt);
  p.regenCd=Math.max(0,p.regenCd-dt);
  G.manaCd=Math.max(0,G.manaCd-dt);
  if(G.manaCd<=0)G.mana=Math.min(maxMana(),G.mana+5*dt);
  if(G.pburn>0){
    G.pburn-=dt;G.pbAcc+=dt;
    if(G.pbAcc>=1){G.pbAcc-=1;p.hp=Math.max(0,p.hp-1);G.hurtT=.3;sfx('hurt');
      spawnP(p.x,p.y-6,'#ff9a4a',4,60,.4,1.6,true);
      if(p.hp<=0){die();return;}}
  }else G.pbAcc=0;
  if(G.chill>0)G.chill-=dt;
  G.nearProps=propsNear(p.x,p.y,1);
  const tile=tileAtPx(p.x,p.y);
  p.climb=CLIMBT(tile)&&!p.mount;
  p.swim=WATERT(tile)&&p.mount!=='boat';
  if(!p.climb&&!p.swim&&!p.mount){p.lgx=p.x;p.lgy=p.y;}
  let mx=inp.mx,my=inp.my;
  if(keys.a||keys.arrowleft)mx-=1;if(keys.d||keys.arrowright)mx+=1;
  if(keys.w||keys.arrowup)my-=1;if(keys.s||keys.arrowdown)my+=1;
  const ml=hyp(mx,my);if(ml>1){mx/=ml;my/=ml;}
  {const wv=unrotD(mx,my);mx=wv.x;my=wv.y;} // stick/keys point in screen space; the world is rotated under it
  const moving=ml>.12;
  const runnerMod=hasSkill('runner')?.7:1;
  const sprint=inp.rH&&(G.vt-inp.rT)>.22&&moving&&!p.exh&&!p.swim&&!p.climb&&!p.mount&&p.st>0;
  /* fishing interrupts */
  if(p.fish){
    if(moving||inp.rP||inp.bombP||inp.spellP){p.fish=null;inp.rP=false;}
    else{
      p.fish.t-=dt;
      if(p.fish.st==='wait'&&p.fish.t<=0){
        p.fish.st='bite';p.fish.t=.7;sfx('alert');
        addFt(p.fish.x,p.fish.y-14,'!','#ffd66e',true);
        spawnP(p.fish.x,p.fish.y,'#bfe3ff',6,60,.4,1.6);
        refreshButtons();
      }else if(p.fish.st==='bite'){
        if(inp.aP){inp.aP=false;resolveFish();refreshButtons();}
        else if(p.fish.t<=0){p.fish=null;toast('It got away…');refreshButtons();}
      }else if(inp.aP){inp.aP=false;}
      p.vx*=.8;p.vy*=.8;
    }
  }
  const wM=eqMain(),wO=eqOff();
  const activeInst=(p.hand===1&&wO)?wO:wM;
  const wd=wDef(activeInst);
  /* === actions === */
  if(p.act==='roll'){
    p.actT+=dt;
    const sp=300*(1-p.actT/.42*.6);
    p.vx=Math.cos(p.rollAng)*sp;p.vy=Math.sin(p.rollAng)*sp;
    if(p.actT>=.42){p.act='';p.vx*=.3;p.vy*=.3;}
  }else if(p.act==='swing'){
    p.actT+=dt;
    if(!p.hitDone&&p.actT>=p.dur*.42){p.hitDone=true;applyMelee('swing');}
    p.vx=mx*30;p.vy=my*30;
    if(p.actT>=p.dur){
      if(p.buf&&p.combo<(wO?3:2)){p.combo++;p.hand=wO?(p.combo%2):0;
        p.actT=0;p.hitDone=false;p.buf=false;sfx('swing');
        const ai=(p.hand===1&&wO)?wO:wM;
        p.dur=.3/wSpdOf(ai);}
      else{p.act='';p.lastSwing=G.vt;}
    }
  }else if(p.act==='spin'){
    p.actT+=dt;
    if(!p.hitDone&&p.actT>=.16){p.hitDone=true;applyMelee('spin');ringP(p.x,p.y,'#cfe3f4');}
    p.vx*=.9;p.vy*=.9;
    if(p.actT>=.5)p.act='';
  }else if(p.act==='cast'){
    p.actT+=dt;p.vx*=.8;p.vy*=.8;
    if(p.actT>=.3)p.act='';
  }else if(p.act==='slide'){
    const a=angTo(p.x,p.y,p.lgx,p.lgy);
    p.vx=Math.cos(a)*240;p.vy=Math.sin(a)*240;
    if(!CLIMBT(tileAtPx(p.x,p.y))||hyp(p.x-p.lgx,p.y-p.lgy)<8){
      p.act='';p.vx=0;p.vy=0;p.hp=Math.max(0,p.hp-1);sfx('hurt');G.hurtT=.4;
      if(p.hp<=0)die();
    }
  }else{
    let sp=118;
    if(p.mount==='horse')sp=265;
    else if(p.mount==='boat')sp=230;
    else if(p.swim)sp=64;else if(p.climb)sp=52;else if(p.aim)sp=55;else if(sprint)sp=195;
    if(G.chill>0)sp*=.6;
    p.vx=lerp(p.vx,mx*sp,1-Math.pow(.0001,dt));
    p.vy=lerp(p.vy,my*sp,1-Math.pow(.0001,dt));
    if(moving&&!p.aim){const ta=Math.atan2(my,mx);p.face+=angDiff(p.face,ta)*Math.min(1,dt*13);}
    if(p.mount==='horse'&&moving&&Math.random()<dt*8){sfx('gallop');spawnP(p.x,p.y+8,'#c9b48f',1,30,.3,1.6);}
    if(p.mount==='boat'&&moving&&Math.random()<dt*10)spawnP(p.x-Math.cos(p.face)*14,p.y-Math.sin(p.face)*14,'rgba(255,255,255,.7)',1,20,.6,2);
    if(inp.aP&&!p.aim&&!p.fish){
      inp.aP=false;
      p.combo=(G.vt-(p.lastSwing||-9)<.4)?(p.combo+1)%(wO?4:3):0;
      p.hand=wO?(p.combo%2):0;
      const ai=(p.hand===1&&wO)?wO:wM;
      p.act='swing';p.actT=0;p.dur=.3/wSpdOf(ai);
      p.hitDone=false;p.buf=false;p.chargeT=0;sfx('swing');
    }
    if(inp.rP){
      inp.rP=false;
      const cost=hasSkill('cat')?10:20;
      if(p.mount){dismount();}
      else if(!p.exh&&!p.swim&&!p.climb&&p.st>=cost){
        p.st-=cost;p.regenCd=.8;
        p.act='roll';p.actT=0;p.iv=hasSkill('cat')?.5:.34;
        p.rollAng=moving?Math.atan2(my,mx):p.face;p.face=p.rollAng;
        addXP('agility',2);
        sfx('roll');spawnP(p.x,p.y,'#c9b48f',4,50,.3,1.6);
      }
    }
  }
  if(p.act==='swing'&&inp.aP){p.buf=true;inp.aP=false;}
  /* charge / spin */
  if(inp.aH&&p.act===''&&!p.aim&&!p.fish){
    p.chargeT+=dt;
    if(p.chargeT>=.5&&!p.charged){p.charged=true;sfx('blip');}
  }else if(!inp.aH){p.charged=false;}
  if(inp.aR){
    inp.aR=false;
    const cost=hasSkill('whirl')?12:25;
    if(p.chargeT>=.5&&p.act===''&&p.st>=cost&&!p.exh&&!p.mount){
      p.st-=cost;p.regenCd=.8;p.act='spin';p.actT=0;p.hitDone=false;sfx('swing');
    }
    p.chargeT=0;p.charged=false;
  }
  /* bow — release resolves before un-aim */
  if(inp.bowR){
    inp.bowR=false;
    if(p.aim&&G.arrows>0){
      const base=hasSkill('steady')?6:4;
      const fire=a=>{G.arrows--;
        firePr('arrow',p.x+Math.cos(a)*10,p.y+Math.sin(a)*10,a,400,base);};
      if(hasSkill('split')&&G.arrows>=3){fire(p.aimAng-.16);fire(p.aimAng);fire(p.aimAng+.16);}
      else fire(p.aimAng);
      sfx('bow');
    }else if(p.aim){sfx('err');addFt(p.x,p.y-20,'No arrows','#f2e9d8');}
    p.aim=false;
  }else if(inp.bowH&&G.bow&&(p.act===''||p.aim)&&!p.mount&&!p.fish){
    p.aim=true;
    const tgt=nearestEnemy(280);
    p.aimAng=tgt?angTo(p.x,p.y,tgt.x,tgt.y):(moving?Math.atan2(my,mx):p.face);
    p.face=p.aimAng;
  }else if(p.aim&&!inp.bowH){p.aim=false;}
  if(inp.bombP){
    inp.bombP=false;
    if(G.bombs>0&&!p.mount){
      G.bombs--;firePr('bomb',p.x,p.y,p.face,150,0);sfx('roll');refreshButtons();
    }else if(!p.mount){sfx('err');addFt(p.x,p.y-20,G.pouch?'No bombs':'Need a bomb pouch','#f2e9d8');}
  }
  if(inp.spellP){
    inp.spellP=false;
    if(G.spells.length&&!p.mount&&p.act==='')castSpell();
  }
  if(inp.potP){inp.potP=false;usePotion();}
  /* stamina */
  let drain=0;
  if(p.climb){drain=16*(G.rain>0?2:1);}
  else if(p.swim)drain=8;
  else if(sprint)drain=15;
  drain*=runnerMod;
  if(drain>0){p.st-=drain*dt;p.regenCd=.6;
    addXP('agility',dt*1.1);
    if(sprint&&Math.random()<dt*8)spawnP(p.x,p.y+7,'#c9b48f',1,30,.3,1.4);}
  else if(p.regenCd<=0)p.st=Math.min(totSt(),p.st+30*dt);
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
  /* movement + collision by mount mode */
  const canClimb=((p.st>2&&!p.exh)||p.climb)&&!p.mount;
  const blk=(x,y)=>{
    const t=tileAtPx(x,y);
    if(p.mount==='boat')return !WATERT(t);
    if(SOLIDT(t))return true;
    if(CLIMBT(t)&&!canClimb)return true;
    if(p.mount==='horse'&&WATERT(t))return true;
    return propBlk(G.nearProps,x,y);
  };
  moveEnt(p,(p.vx+p.kbx)*dt,(p.vy+p.kby)*dt,blk);
  const dk=Math.pow(.0005,dt);p.kbx*=dk;p.kby*=dk;
  p.mv=hyp(p.vx,p.vy);
  p.anim+=dt*(p.mv>10?(p.mv>150?11:7):2);
  if(p.mv>10)G.stats.steps+=dt;
  if(G.inDun)for(const pr of G.nearProps)
    if(pr.t==='gold'&&!G.takenGold.has(pr.id)&&hyp(pr.x-p.x,pr.y-p.y)<18){
      G.takenGold.add(pr.id);
      const n=Math.round(irnd(8,20)*(1+G.dun.depth*.3)*goldMul());
      G.coins+=n;sfx('coin');
      addFt(pr.x,pr.y-14,'+'+n+' gold','#ffd66e');
      spawnP(pr.x,pr.y,'#e8b04a',6,70,.4,1.8,true);
    }
  G.inter=findInteract();
  if(inp.intP){inp.intP=false;if(G.inter)doInteract(G.inter);}
  const la=10;
  G.cam.x=lerp(G.cam.x,p.x+Math.cos(p.face)*la,1-Math.pow(.002,dt));
  G.cam.y=lerp(G.cam.y,p.y+Math.sin(p.face)*la,1-Math.pow(.002,dt));
  G.expT-=dt;
  if(G.expT<=0){G.expT=.3;reveal(Math.floor(p.x/TILE),Math.floor(p.y/TILE),3);}
}
function nearestEnemy(range){
  let best=null,bd=range;
  for(const e of G.ents){
    if(e.dead||e.t==='npc'||e.t==='ally'||e.hidden||e.hp<=0)continue;
    const d=hyp(e.x-G.p.x,e.y-G.p.y);
    if(d<bd){bd=d;best=e;}
  }
  return best;
}
function applyMelee(kind){
  const p=G.p;
  const wO=eqOff();
  const inst=kind==='spin'?eqMain():((p.hand===1&&wO)?wO:eqMain());
  const w=wDef(inst);
  const last=p.combo===(wO?3:2);
  const around=kind==='spin'||(last&&hasSkill('bstorm'));
  const arcW=w.t==='spear'?.6:(w.t==='dagger'?1.1:1.35);
  const reach=(kind==='spin'?52:38+w.rc)+(inst?0:0);
  let base=wDmg(inst)*(kind==='spin'?2.2:(last?1.6:1))*(p.flurry>0?1.5:1);
  if(hasSkill('sharp'))base*=1.25;
  if(wO&&kind!=='spin')base*=1.05;
  const crit=Math.random()<affix(inst,'crit');
  if(crit)base*=2;
  let landed=false;
  for(const e of G.ents){
    if(e.dead||e.t==='npc'||e.t==='ally'||e.hp<=0||e.hidden)continue;
    const dp=hyp(e.x-p.x,e.y-p.y);
    if(dp>reach+e.r)continue;
    if(!around&&Math.abs(angDiff(p.face,angTo(p.x,p.y,e.x,e.y)))>arcW)continue;
    const dmg=Math.round(base);
    if(crit)addFt(e.x,e.y-e.r-18,'CRIT!','#ffd66e',true);
    if(affix(inst,'burn'))e.burn=2.5;
    if(affix(inst,'chill'))e.frozen=Math.max(e.frozen||0,1.1);
    damageE(e,dmg,angTo(p.x,p.y,e.x,e.y),(kind==='spin'?1.7:1)*wKbOf(inst));
    addXP('blades',dmg);
    landed=true;
  }
  if(landed&&(w.t==='hammer'||w.t==='axe')){G.shake=Math.max(G.shake,4);
    spawnP(p.x+Math.cos(p.face)*reach*.8,p.y+Math.sin(p.face)*reach*.8,'#c9b48f',6,70,.4,2);}
  if(landed&&inst)degrade(inst,kind==='spin'?.5:.25,false);
  for(const pr of G.nearProps){
    const dp=hyp(pr.x-p.x,pr.y-p.y);
    if(dp>reach+10)continue;
    if(!around&&Math.abs(angDiff(p.face,angTo(p.x,p.y,pr.x,pr.y)))>arcW)continue;
    if(pr.t==='urn'&&!G.brokenUrns.has(pr.id)){
      G.brokenUrns.add(pr.id);
      sfx('crack');spawnP(pr.x,pr.y,'#c9a06a',10,100,.5,2.2);
      const rr2=Math.random();
      const nc=irnd(1,4);for(let ci=0;ci<nc;ci++)addDrop(pr.x,pr.y,'coin');
      if(rr2<.25)addDrop(pr.x,pr.y,'pot:hp');
      else if(rr2<.33)addDrop(pr.x,pr.y,'scroll');
      else if(rr2>.9)addDrop(pr.x,pr.y,'mat:ore');
    }
    if(pr.t==='bush'&&!G.cutBush.has(pr.id)){
      G.cutBush.add(pr.id);
      spawnP(pr.x,pr.y,'#67a748',9,90,.4,2);
      const r=Math.random();
      if(r<.30){addDrop(pr.x,pr.y,'coin');if(r<.1)addDrop(pr.x,pr.y,'coin');}
      else if(r<.38)addDrop(pr.x,pr.y,'heart');
      else if(r>.9)addDrop(pr.x,pr.y,'food:apple');
      if(w.t==='axe'&&Math.random()<.5)addDrop(pr.x,pr.y,'mat:wood');
    }
  }
}

/* ================= interaction ================= */
function fruitReady(pr){return G.flags['fr:'+pr.id]!==G.dayN;}
function findInteract(){
  const p=G.p;let best=null,bd=42;
  if(p.mount==='horse')return{o:null,label:'Dismount',kind:'dismount'};
  if(p.mount==='boat'){
    for(let a=0;a<8;a++){
      const t=tileAtPx(p.x+Math.cos(a/8*TAU)*30,p.y+Math.sin(a/8*TAU)*30);
      if(!WATERT(t)&&!SOLIDT(t))return{o:null,label:'Disembark',kind:'disembark'};
    }
    if(G.rod&&!p.fish)return{o:null,label:'Fish',kind:'fish'};
    return null;
  }
  if(p.fish)return p.fish.st==='bite'?{o:null,label:'Hook it!',kind:'hook'}:{o:null,label:'Wait…',kind:'wait'};
  if(G.portal&&!G.inDun){
    const da=G.portal.aDun?1e9:hyp(G.portal.ax-p.x,G.portal.ay-p.y);
    const db=hyp(G.portal.bx-p.x,G.portal.by-p.y);
    if(da<40)return{o:null,label:'Enter Portal',kind:'portalA'};
    if(db<40)return{o:null,label:'Enter Portal',kind:'portalB'};
  }
  if(G.inDun&&G.portal&&G.portal.aDun&&G.portal.dun===G.dun&&hyp(G.portal.ax-p.x,G.portal.ay-p.y)<40)
    return{o:null,label:'Enter Portal',kind:'portalA'};
  if(!G.inDun&&G.horse&&hyp(G.horse.x-p.x,G.horse.y-p.y)<44)best={o:null,label:'Mount',kind:'mount'},bd=hyp(G.horse.x-p.x,G.horse.y-p.y);
  if(!G.inDun&&G.boat&&hyp(G.boat.x-p.x,G.boat.y-p.y)<48&&WATERT(tileAtPx(G.boat.x,G.boat.y))){
    const d=hyp(G.boat.x-p.x,G.boat.y-p.y);
    if(d<bd){best={o:null,label:'Board',kind:'board'};bd=d;}
  }
  for(const e of G.ents){
    if(e.t==='ally'&&!e.dead){
      const dd=hyp(e.x-p.x,e.y-p.y)-12;
      if(dd<bd){bd=dd;best={o:e,label:e.down?'Help Up':'Talk',kind:e.down?'revive':'ally'};}
    }
  }
  for(const pr of G.nearProps){
    let label=null,kind='prop';
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
      case'branch':label=flag('op:'+pr.id)?null:'Gather Wood';break;
      case'orevein':label=G.flags['ov:'+pr.id]===G.dayN?null:'Mine';break;
      case'forge':label='Smith';break;
      case'stable':label=G.horse?null:'Buy Horse · 150c';break;
      case'dock':label=G.boat?null:'Buy Boat · 250c';break;
      case'field':
        if(!flag('land:'+pr.vi))label='Buy Deed · 200c';
        else label=G.flags['hv:'+pr.vi]===G.dayN?null:'Harvest';
        break;
      case'delve':label='Descend into the Barrow';break;
      case'stairsD':label='Descend Deeper';break;
      case'stairsU':label=(G.dun&&G.dun.depth===1)?'Ascend to Daylight':'Ascend';break;
      case'portal':label='Return to Daylight';break;
      case'hut':
        if(pr.sale){
          if(!flag('home:'+pr.vi))label='Buy Home · 300c';
          else label='Rest at Home';
        }else if(G.flags['hs:'+pr.id]!==G.dayN)label='Search';
        break;
    }
    if(!label)continue;
    let dd;
    if(pr.t==='hut')dd=hyp(pr.x-p.x,(pr.y+pr.h/2+6)-p.y)-10; // door only
    else dd=hyp(pr.x-p.x,pr.y-p.y)-(pr.r||(pr.rect?pr.w/2:8));
    if(dd<bd){bd=dd;best={o:pr,label,kind};}
  }
  for(const e of G.ents){
    if(e.t!=='npc'||e.dead||e.hidden)continue;
    const dd=hyp(e.x-p.x,e.y-p.y)-18; // people take priority over furniture
    if(dd<bd){bd=dd;best={o:e,label:'Talk',kind:'npc'};}
  }
  if(!best&&G.rod&&!p.mount&&!p.fish){
    const fx=p.x+Math.cos(p.face)*44,fy=p.y+Math.sin(p.face)*44;
    if(WATERT(tileAtPx(fx,fy)))best={o:null,label:'Fish',kind:'fish'};
  }
  return best;
}
function chestLoot(pr){
  const h=hashi(Math.round(pr.x),Math.round(pr.y),NS+601);
  if(pr.dun){
    const roll=h%100;
    if(roll<28){const n=Math.round((20+h%25)*(1+G.dun.depth*.4)*goldMul());G.coins+=n;return n+' coins';}
    if(roll<44){G.pot.hp+=2;refreshButtons();return '2 health potions';}
    if(roll<54){G.scrolls++;return 'a Return Scroll';}
    const di=rollInst(pick(Math.random()<.25?['leather','mail','plate']:areaWpnPool(pr.x,pr.y)),1+G.dun.depth);
    if(ARM[di.k])G.inv.a.push(di);else G.inv.w.push(di);
    return RARN[di.rar||0]+instName(di)+'!';
  }
  const far=hyp(pr.x-SP.spawn.tx*TILE,pr.y-SP.spawn.ty*TILE)/TILE;
  if(pr.ward){
    addWpn('knight');G.mat.ore+=3;
    return WPN.knight.n+' + 3 ore!';
  }
  const roll=h%100;
  if(roll<26){const n=10+Math.floor(far/8)+h%12;G.coins+=n;return n+' coins';}
  if(roll<40){const n=5+h%6;G.arrows+=n;return n+' arrows';}
  if(roll<50){G.mat.ore+=2;G.mat.wood+=1;return '2 ore + 1 wood';}
  if(roll<58){G.mat.leather+=2;return '2 leather';}
  if(roll<64&&G.pouch){G.bombs+=3;return '3 bombs';}
  if(roll<74){addFood('steak',1);return 'a seared steak';}
  if(roll<82){addFood('bapple',2);return 'two baked apples';}
  if(roll<90){const n=22+h%18;G.coins+=n;return n+' coins';}
  const k=pick(areaWpnPool(pr.x,pr.y));
  const wi=rollInst(k,0);
  G.inv.w.push(wi);
  return RARN[wi.rar||0]+instName(wi)+'!';
}
function doInteract(it){
  const pr=it.o,p=G.p;
  switch(it.kind){
    case'npc':talkTo(pr);return;
    case'ally':allyTalk(pr);return;
    case'revive':pr.down=false;pr.hp=Math.round(pr.mhp*.6);sfx('heal');
      addFt(pr.x,pr.y-20,pr.name+' is back up!','#8fce6a');addTrust(pr.key,4);return;
    case'mount':tryMount('horse');return;
    case'board':tryMount('boat');return;
    case'portalA':enterPortal('a');return;
    case'portalB':enterPortal('b');return;
    case'dismount':case'disembark':dismount();return;
    case'fish':startFishing();refreshButtons();return;
    case'hook':case'wait':return;
  }
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
          {n:'Lumen',t:'And every place we discover remembers us now. Open the map and we can travel back to any of them in a blink. No walking! Bless the old builders.'}],
          {end(){refreshObjective();autosave();}});
      }else autosave();
      refreshObjective();
      break;}
    case'stone':{
      const first=!flag('stone:'+pr.id);
      if(first){setFlag('stone:'+pr.id);G.stats.stones++;G.coins+=5;sfx('pick');addXP('charm',5);}
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
        for(const k of raw){const n=G.food[k];G.food[k]=0;addFood(FOODS[k].cook,n);
          addXP('craft',2*n);msg.push(n+'× '+FOODS[FOODS[k].cook].n);}
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
            {t:'❤ Heart Container (+1 heart)',f(){G.orbs-=4;G.p.maxhp=Math.min(48,G.p.maxhp+4);G.p.hp=totHp();sfx('heal');toast('Your life force grows!');autosave();}},
            {t:'⚡ Stamina Vessel (+stamina)',f(){G.orbs-=4;G.p.maxst=Math.min(200,G.p.maxst+20);sfx('heal');toast('Your endurance grows!');autosave();}},
            {t:'Not yet',f(){}}]});
      }else{
        startDlg([{n:'Statue of the Crown',t:'"Bring me four spirit orbs from the shrines of the old crown, and I will trade them for lasting strength." You carry '+G.orbs+'.'}]);
      }
      break;}
    case'ftree':{
      G.flags['fr:'+pr.id]=G.dayN;
      sfx('shake');spawnP(pr.x,pr.y-14,'#57a35f',8,70,.5,2);
      const n=hasSkill('forager')?6:3;
      for(let i=0;i<n;i++)addDrop(pr.x+rnd(-10,10),pr.y+rnd(4,14),'food:apple');
      addXP('craft',3);
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
      setFlag('op:'+pr.id);
      addFood('shroom',hasSkill('forager')?2:1);
      sfx('pick');addXP('craft',3);
      addFt(pr.x,pr.y-14,'Mushroom','#c88ad2');
      break;}
    case'branch':{
      setFlag('op:'+pr.id);
      G.mat.wood+=hasSkill('forager')?2:1;
      sfx('pick');addXP('craft',3);
      addFt(pr.x,pr.y-14,'Wood','#c9b48f');
      break;}
    case'orevein':{
      G.flags['ov:'+pr.id]=G.dayN;
      G.mat.ore+=hasSkill('forager')?2:1;
      sfx('anvil');addXP('craft',4);G.shake=2;
      spawnP(pr.x,pr.y,'#8d95a5',8,90,.5,2);
      addFt(pr.x,pr.y-14,'Iron Ore','#8d95a5');
      break;}
    case'forge':{openCraft();break;}
    case'delve':{enterDun(pr);break;}
    case'stairsD':{descendDun();break;}
    case'stairsU':{if(G.dun.depth<=1)exitDun();else ascendDun();break;}
    case'portal':{exitDun();break;}
    case'stable':{
      if(G.coins<150){sfx('err');toast('A horse costs 150 coins');break;}
      startDlg([{n:'Stablehand',t:'She\'s sure-footed, brave, and eats less than you\'d think. 150 coins and she\'s yours for life.'}],
        {choices:[
          {t:'Buy the horse · 150c',f(){G.coins-=150;
            G.horse={own:1,x:pr.x+20,y:pr.y+16,name:'Ember'};
            sfx('gallop');toast('Ember the horse is yours — mount up!');autosave();}},
          {t:'Not today',f(){}}]});
      break;}
    case'dock':{
      if(G.coins<250){sfx('err');toast('A boat costs 250 coins');break;}
      startDlg([{n:'Dockhand',t:'Sound hull, patched sail, remembers every current. 250 coins and the open water is yours, captain.'}],
        {choices:[
          {t:'Buy the boat · 250c',f(){
            let bx=pr.x,by=pr.y;
            for(let a=0;a<12;a++){const tx=pr.x+Math.cos(a/12*TAU)*40,ty=pr.y+Math.sin(a/12*TAU)*40;
              if(WATERT(tileAtPx(tx,ty))){bx=tx;by=ty;break;}}
            G.coins-=250;G.boat={own:1,x:bx,y:by};
            sfx('splash');toast('The boat is yours, captain — board her and sail');autosave();}},
          {t:'Not today',f(){}}]});
      break;}
    case'field':{
      if(!flag('land:'+pr.vi)){
        if(G.coins<200){sfx('err');toast('The deed costs 200 coins');break;}
        startDlg([{n:'',t:'A worked field, rich soil, good light. The village will sell the deed for 200 coins — its harvest would be yours each day.'}],
          {choices:[
            {t:'Buy the deed · 200c',f(){G.coins-=200;setFlag('land:'+pr.vi);
              sfx('chest');toast('The land is yours — harvest it daily');autosave();}},
            {t:'Walk on',f(){}}]});
      }else{
        G.flags['hv:'+pr.vi]=G.dayN;
        const c=irnd(12,24);G.coins+=c;
        addFood('apple',2);addFood(Math.random()<.5?'shroom':'meat',1);
        sfx('coin');addXP('craft',5);
        toast('Harvest: '+c+' coins + provisions');
      }
      break;}
    case'hut':{
      if(pr.sale&&!flag('home:'+pr.vi)){
        if(G.coins<300){sfx('err');toast('This home costs 300 coins');break;}
        startDlg([{n:'',t:'A sturdy hut with a hearth, a bed, and a roof that only sings in heavy rain. 300 coins, and it is yours.'}],
          {choices:[
            {t:'Buy the home · 300c',f(){G.coins-=300;setFlag('home:'+pr.vi);
              sfx('chest');toast('Home sweet home — rest here any time');
              G.lastSafe={x:pr.x,y:pr.y+30};autosave();}},
            {t:'Keep wandering',f(){}}]});
      }else if(pr.sale){
        G.p.hp=totHp();G.p.st=totSt();G.mana=maxMana();
        G.lastSafe={x:pr.x,y:pr.y+30};
        fadeFlash();sfx('heal');toast('You rest at home — fully restored');
        autosave();
      }else{
        G.flags['hs:'+pr.id]=G.dayN;
        const chance=hasSkill('shadow')?.85:.6;
        if(Math.random()<chance){
          const r=Math.random();
          if(r<.5){const n=irnd(3,10);G.coins+=n;toast('Searched the hut… '+n+' coins');}
          else if(r<.8){addFood('apple',1);toast('Searched the hut… an apple');}
          else{G.mat.leather+=1;toast('Searched the hut… some leather');}
          sfx('coin');addXP('hunt',4);
        }else{
          sfx('err');toast('Caught rummaging! The village mutters');
          for(const n of NPCS[pr.vi]||[])addTrust(n.key,-15);
        }
      }
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

/* ================= story: lore, tips ================= */
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
  night1:[{n:'Lumen',t:'Night. The hungry dead claw out of the soil after dark — slow, stubborn, and very rude. Fight them, outwalk them, or camp by a fire until dawn.'}],
  blight:[{n:'Lumen',t:'Ugh — blight. Sorrow with nowhere to go. The wisps here throw it about, so keep your feet moving. It all ends when HE remembers.'}],
  exhaust:[{n:'Lumen',t:'Breathe! That green ring is your strength — when it empties you can\'t run, climb, or swim. Rest a moment. The wild rewards patience.'}],
  rain:[{n:'Lumen',t:'Rain! Lovely for the meadows, dreadful for climbing — stone drinks your strength twice as fast when wet. Maybe wait it out by a fire.'}],
  climb:[{n:'Lumen',t:'You can climb almost any stone — it just costs strength. The higher peaks want a deeper breath… or a clever path.'}],
  dur:[{n:'Lumen',t:'Hear that creak? Steel wears out, swing by swing. Carry iron ore and mend your blade at a forge — or learn smithing and mend it anywhere. A broken blade is gone for good!'}],
  skill1:[{n:'Lumen',t:'You\'re growing! The wild remembers WHAT you practice — swing swords and the Blades path opens, sneak and hunt and other doors appear. Tap the ☆ to spend what you\'ve earned. Your path is yours alone.'}],
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
    const m=eqMain();
    if(m&&m.dur<40)lumTip('dur');
    if(BRANCHES.some(b=>G.pts[b]>0))lumTip('skill1');
  }
}
