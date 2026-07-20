/* ================= npc talk: trust, gifts, shops, stealing, recruiting ================= */
function trustTag(key){
  const t=trustOf(key);
  if(t>=80)return' · DEVOTED';
  if(t>=60)return' · CLOSE';
  if(t>=30)return' · TRUSTED';
  if(t<=-60)return' · HOSTILE';
  if(t<=-30)return' · WARY';
  return'';
}
function firstTalkTrust(key){
  const k='talked:'+key+':'+G.dayN;
  if(!G.flags[k]){G.flags[k]=1;addTrust(key,2);}
}
function talkTo(e){
  const key=e.key;
  if(trustOf(key)<=-60){
    startDlg([{n:e.name+trustTag(key),t:'"Get away from me. The whole village knows what you are."'}]);
    return;
  }
  firstTalkTrust(key);
  const ch=[{t:'Talk',f(){npcStory(key,e);}}];
  ch.push({t:'Offer a gift',f(){giftMenu(key,e);}});
  if(key==='sella'||key==='zef'||key==='holt')ch.push({t:'Trade',f(){shop(key);}});
  if(key==='sella'||key==='zef')ch.push({t:'Steal from the stall…',f(){stealFrom(key);}});
  if(key==='boro'&&G.q.boro===2)ch.push({t:'Use the forge',f(){openCraft();}});
  if(ALLYDEF[key]&&!G.team.some(m=>m.key===key)){
    if(canRecruit(key))ch.push({t:'Will you travel with me?',f(){recruit(key,e);}});
  }
  ch.push({t:'Never mind',f(){}});
  startDlg([{n:e.name+trustTag(key),t:greetLine(key)}],{choices:ch.slice(0,5).concat(ch.length>5?[ch[ch.length-1]]:[]).slice(0,6)});
}
function greetLine(key){
  const t=trustOf(key);
  const g={
    elder:'Stay awhile, and listen. The fire is warm and my ears still work.',
    boro:'Mind the sparks. What do you need?',
    pip:'Oh! Hello! Are you doing a heroic errand right now??',
    sella:'Welcome back! Finest wares this side of the blight.',
    wren:'Perfect timing — hold this beaker. Actually, don\'t. Talk instead.',
    holt:'Wind\'s from the north. Good day for tracking. Speak.',
    rhoa:'Report, wanderer. What do you need of Dunewatch?',
    zef:'Zef trades fair and asks nothing about the bloodstains. Speak, friend.',
    juno:'Did you fight anything TODAY? Tell me everything.'};
  let s=g[key]||'Fine weather for wandering.';
  if(t>=60)s+=' (They smile when they see you.)';
  else if(t<=-30)s+=' (They watch you carefully.)';
  return s;
}
function canRecruit(key){
  if(G.team.length>=4)return false;
  if(trustOf(key)<80)return false;
  if(key==='boro')return G.q.boro===2;
  if(key==='rhoa')return G.q.rhoa===2;
  if(key==='wren')return G.q.wren===2;
  return true; // holt: trust alone wins him over
}
function recruit(key,e){
  const a=ALLYDEF[key];
  G.team.push({key,w:null,a:null});
  if(e)e.dead=true;
  const lines={
    holt:'The wild\'s better hunted in pairs. I\'ll watch your flanks — and I never miss twice.',
    rhoa:'Dunewatch stands because of you. My sword stands with you now. Lead on.',
    wren:'Field research! FINALLY. I\'ll bring the bolts, you bring the things to bolt.',
    boro:'Hammer\'s coming with us. Anything that breaks on you, I\'ll mend — anything that bites you, I\'ll flatten.'};
  startDlg([{n:a.n,t:lines[key]||'I\'ll come.'}],
    {end(){toast(a.n+' joined your company ('+G.team.length+'/4)');sfx('chest');
      ensureTeam();autosave();}});
}
function allyTalk(e){
  const m=G.team.find(m=>m.key===e.key);
  if(!m)return;
  const ch=[];
  const spare=G.inv.w.map((w,i)=>({w,i})).filter(x=>x.i!==G.eqM&&x.i!==G.eqO)
    .sort((a,b)=>wDef(b.w).tier-wDef(a.w).tier).slice(0,3);
  for(const s of spare)
    ch.push({t:'Give '+wDef(s.w).n,f(){
      const idx=G.inv.w.indexOf(s.w);
      if(idx>=0){G.inv.w.splice(idx,1);
        if(G.eqM>idx)G.eqM--;if(G.eqO>idx)G.eqO--;
        if(m.w)G.inv.w.push(m.w);
        m.w=s.w;
        toast(e.name+' now carries '+wDef(s.w).n);sfx('pick');addTrust(e.key,6);}
    }});
  if(m.w)ch.push({t:'Take back '+wDef(m.w).n,f(){G.inv.w.push(m.w);m.w=null;sfx('pick');}});
  ch.push({t:'Part ways here',f(){
    G.team=G.team.filter(x=>x.key!==e.key);
    e.dead=true;
    toast(e.name+' returns to the village — no hard feelings');
    ensureTeam();autosave();}});
  ch.push({t:'Never mind',f(){}});
  const barks={holt:'Say the word.',rhoa:'At your side.',wren:'Ready! Mostly!',boro:'Aye?'};
  startDlg([{n:e.name,t:barks[e.key]||'Aye?'}],{choices:ch.slice(0,5)});
}
function giftMenu(key,e){
  const foods=Object.keys(G.food).filter(k=>G.food[k]>0).slice(0,4);
  if(!foods.length){
    startDlg([{n:e?e.name:npcName(key),t:'You pat your empty pockets. Perhaps forage something worth giving first.'}]);
    return;
  }
  const ch=foods.map(f=>({t:'Give '+FOODS[f].n+' (×'+G.food[f]+')',f(){
    G.food[f]--;
    const val=Math.max(3,Math.round(FOODS[f].h*1.2));
    addTrust(key,val);sfx('heal');
    toast(npcName(key)+' appreciates the '+FOODS[f].n);
  }}));
  ch.push({t:'Never mind',f(){}});
  startDlg([{n:npcName(key),t:'"For me?"'}],{choices:ch.slice(0,5)});
}
function stealFrom(key,forced){
  const chance=.45+(hasSkill('shadow')?.3:0);
  const success=forced!==undefined?forced:Math.random()<chance;
  if(success){
    const r=Math.random();let msg;
    if(r<.4){const n=irnd(6,18);G.coins+=n;msg=n+' coins';}
    else if(r<.6){G.arrows+=4;msg='4 arrows';}
    else if(r<.8){addFood('steak',1);msg='a seared steak';}
    else{G.mat.ore+=2;msg='2 iron ore';}
    sfx('coin');addXP('hunt',6);
    toast('Pocketed '+msg+'… no one saw');
  }else{
    sfx('err');addTrust(key,-40);
    toast('Caught red-handed! '+npcName(key)+' will remember this');
  }
}
function revealSecret(key){
  if(flag('secret:'+key))return;
  setFlag('secret:'+key);
  const cand=POIS.filter(p=>(p.k==='shrine'||p.k==='chest'||p.k==='stone')&&!flag('seen:'+p.id));
  if(!cand.length)return;
  let best=null,bd=1e9;
  for(const c of cand){const d=hyp(c.tx-G.p.x/TILE,c.ty-G.p.y/TILE);if(d<bd){bd=d;best=c;}}
  setFlag('seen:'+best.id);
  reveal(best.tx,best.ty,3);
  const what=best.k==='shrine'?'a hidden shrine':(best.k==='chest'?'a forgotten cache':'an old standing stone');
  toast(npcName(key)+' tells you of '+what+' — marked on your map');
}

/* ---- per-npc stories & quests ---- */
function npcStory(key,e){
  switch(key){
    case'elder':dlgElder();break;
    case'boro':dlgBoro();break;
    case'pip':dlgPip();break;
    case'wren':dlgWren();break;
    case'rhoa':dlgRhoa();break;
    case'holt':
      startDlg([
        {n:'Holt the Hunter',t:'Boars drop meat if you dodge the tantrum; deer drop more if you can catch them — arrows help. Wolves hunt back. That\'s the whole trade, friend.'},
        {n:'Holt the Hunter',t:G.rod?'Fish bite best where the water\'s calm. Face the water, cast, and strike the moment it pulls.':'Get yourself a fishing rod — I sell them, or any forge can knock one together. Rivers feed you free.'}]);
      break;
    case'sella':
      startDlg([{n:'Sella',t:'Traders talk: trust is the best coin. Villages remember kindness — and light fingers. Spend both wisely, hm?'}]);
      break;
    case'zef':
      startDlg([{n:'Zef',t:'Zef has sailed both piers and owes money at neither. Buy a boat, friend — the coast hides what the roads never find.'}]);
      break;
    case'juno':
      startDlg([{n:'Juno',t:'A shrine on the dunes had DANCING LIGHTS inside! Papa says never touch shrine-light. Papa is a coward. If you catch one, tell me what it feels like!'}]);
      break;
    default:
      startDlg([{n:e?e.name:key,t:'Fine weather for wandering, traveler.'}]);
  }
}
function dlgElder(){
  if(!flag('elder1')){
    setFlag('elder1');addTrust('elder',20);
    startDlg([
      {n:'Elder Maren',t:'By the old fire… a living spark rides your shoulder. I never thought these eyes would see one again. Sit, wanderer. Listen.'},
      {n:'Elder Maren',t:'A hundred years ago the Ember Crown shattered. Our King fell hollow, and a violet blight crept out of the Sunken Citadel. It creeps still.'},
      {n:'Elder Maren',t:'Four shards of the crown were carried off by his Wardens — good knights once, twisted now into jailers of his grief. They brood in the old ruins at the compass points.'},
      {n:'Elder Maren',t:'Return the shards and the King may remember himself. Take my husband\'s bow — he\'d like that it flew again. And climb a wayfarer tower: your spark can hear the shards from up high.'}],
      {end(){
        if(!G.bow){G.bow=true;G.arrows+=15;sfx('chest');toast('Received the Old Bow + 15 arrows');refreshButtons();}
        if(G.mq<1)G.mq=1;
        refreshObjective();autosave();
      }});
  }else if(flag('kingdead')){
    startDlg([{n:'Elder Maren',t:'The smoke rises straight, the blight is meadow, and the fire feels warm again. You gave an old woman back her morning, wanderer. Sit whenever you like. This hearth is yours.'}]);
  }else if(G.shards>=4){
    startDlg([{n:'Elder Maren',t:'All four shards… then only the gate remains. Whatever sits the throne now wears his face, not his heart. Be brave enough to give it back.'}]);
  }else{
    startDlg([{n:'Elder Maren',t:'Shrines hold spirit orbs; the statue trades four for strength. The wild remembers what you practice — swords, sneaking, spellwork, all of it. Grow the way you live, child.'}]);
  }
}
function dlgBoro(){
  if(!G.q.boro){
    startDlg([
      {n:'Boro the Smith',t:'Bandits camped west past the creek and made off with my best steel. My hands make blades, not war — but yours look like they argue well.'},
      {n:'Boro the Smith',t:'Break that camp, and the steel is yours — reforged into a soldier\'s blade that actually bites. And my forge is yours after, for mending and making.'}],
      {choices:[
        {t:'I\'ll break the camp',f(){G.q.boro=1;toast('Quest: Boro\'s Stolen Steel');refreshObjective();}},
        {t:'Maybe later',f(){}}]});
  }else if(G.q.boro===1){
    if(flag('camp:borocamp')){
      G.q.boro=2;addTrust('boro',40);addXP('charm',25);
      startDlg([{n:'Boro the Smith',t:'You broke them?! HA! Give me a breath and a hammer—'},
        {n:'Boro the Smith',t:'There. A Soldier\'s Blade, balanced for a wanderer\'s wrist. My forge is open to you — repairs, upgrades, new steel, whatever your road needs.'}],
        {end(){
          const i=addWpn('soldier');G.eqM=G.inv.w.indexOf(i);
          toast('Received the Soldier\'s Blade — the forge is open to you');
          sfx('chest');refreshObjective();autosave();}});
    }else startDlg([{n:'Boro the Smith',t:'The camp\'s west of the village, past the creek — follow the gold light. Mind the big one; bandits feed their bullies first.'}]);
  }else startDlg([{n:'Boro the Smith',t:'Steel wears, wanderer — every swing costs a little. Bring ore and I\'ll mend anything at the forge. Learn the craft yourself and you won\'t even need me. I\'ll try not to be insulted.'}]);
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
      G.q.pip=2;G.coins+=15;addTrust('pip',30);addXP('charm',25);
      startDlg([{n:'Pip',t:'MISS BUTTONS! You found her! You\'re the best hero in the whole wild. Here — my whole treasure. All fifteen coins. Don\'t spend them on anything boring.'}],
        {end(){sfx('coin');toast('+15 coins');refreshObjective();autosave();}});
    }else startDlg([{n:'Pip',t:'The big lonely tree! East! Follow the gold light. Miss Buttons is the one with the button eyes. Obviously.'}]);
  }else startDlg([{n:'Pip',t:'Miss Buttons says hi. She would also fight the Hollow King with you, but she has a very full schedule.'}]);
}
function dlgWren(){
  if(!flag('wren1')){
    setFlag('wren1');G.pouch=true;G.bombs+=3;
    if(!G.spells.includes('bolt')){G.spells.push('bolt');if(!G.spellEq)G.spellEq='bolt';}
    startDlg([
      {n:'Scholar Wren',t:'A traveler! Perfect timing — hold these. Clay-poppers. Bombs, technically. I make them to study the blight and they keep NOT being used for science.'},
      {n:'Scholar Wren',t:'Also — your spark. It resonates! Here, the first word of the old tongue: EMBER BOLT. Focus, breathe, and throw fire with your empty hand. Practice grows the art.'},
      {n:'Scholar Wren',t:'Now, my hypothesis: blight wisps disperse permanently if popped with enthusiasm. Pop five for me? For science. And for the meadows, I suppose.'}],
      {choices:[
        {t:'Five wisps, for science',f(){G.q.wren=1;G.q.wrenK=0;toast('Quest: Enthusiastic Science');refreshObjective();}},
        {t:'Keep your poppers',f(){}}],
       end(){sfx('chest');toast('Received Bomb Pouch, 3 bombs — and the EMBER BOLT spell');
         refreshButtons();autosave();}});
  }else if(G.q.wren===1){
    if((G.q.wrenK||0)>=5){
      G.q.wren=2;G.coins+=40;addFood('steak',2);addTrust('wren',40);addXP('charm',25);
      startDlg([{n:'Scholar Wren',t:'FIVE dispersals, confirmed at range! The meadows thank you and so does my thesis. Payment: forty coins and two steaks I absolutely did not burn on purpose.'}],
        {end(){sfx('coin');toast('+40 coins, +2 steaks');refreshObjective();autosave();}});
    }else startDlg([{n:'Scholar Wren',t:'Wisps drift where the blight is thick — near the Citadel, and in the sick land around the old ruins. '+(G.q.wrenK||0)+' of 5 so far. For science!'}]);
  }else startDlg([{n:'Scholar Wren',t:'Magic is a muscle — cast and it grows. The deeper arts hide in your own skill path… and merchants sometimes sell old scrolls. If you find Gale Step, buy it. Trust me. WHOOSH.'}]);
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
          if(!G.q.rhoaCamp)G.q.rhoa=2;
          toast('Quest: The Sand Road');refreshObjective();}},
        {t:'Another day',f(){}}]});
  }else if(G.q.rhoa===1){
    if(!G.q.rhoaCamp||flag('camp:'+G.q.rhoaCamp)){
      G.q.rhoa=2;addTrust('rhoa',40);addXP('charm',25);
      startDlg([{n:'Captain Rhoa',t:'Scouts confirm it — the sand road is open. You fight like a garrison of twenty. The claymore is yours; swing it for the small places.'}],
        {end(){
          const i=addWpn('knight');G.eqM=G.inv.w.indexOf(i);
          toast('Received the Knight\'s Claymore!');
          sfx('chest');refreshObjective();autosave();}});
    }else startDlg([{n:'Captain Rhoa',t:'The camp\'s marked in gold light. Watch the archers — raiders love shooting people who are busy.'}]);
  }else startDlg([{n:'Captain Rhoa',t:flag('kingdead')?'The caravans sing on the sand road again. Dunewatch remembers, wanderer.':'Steel serving you well? The wild\'s worth defending. All of it.'}]);
}
/* ---- shops: dynamic prices from trust + haggling, buy & sell ---- */
function shopItems(key){
  if(key==='sella')return[
    {label:'Health Potion',cost:15,f(){G.pot.hp++;refreshButtons();}},
    {label:'Return Scroll',cost:20,f(){G.scrolls++;}},
    {label:'5 Arrows',cost:8,f(){G.arrows+=5;}},
    G.spells.includes('mend')?null:{label:'Scroll: Mend',cost:60,f(){
      G.spells.push('mend');if(!G.spellEq)G.spellEq='mend';
      toast('Learned the MEND spell');refreshButtons();}},
    G.pouch?{label:'3 Bombs',cost:15,f(){G.bombs+=3;}}
           :{label:'Bomb Pouch',cost:25,f(){G.pouch=true;G.bombs+=3;refreshButtons();}}];
  if(key==='zef')return[
    {label:'Mana Potion',cost:12,f(){G.pot.mp++;refreshButtons();}},
    {label:'Return Scroll',cost:20,f(){G.scrolls++;}},
    {label:'2 Iron Ore',cost:14,f(){G.mat.ore+=2;}},
    G.spells.includes('gale')?null:{label:'Scroll: Gale Step',cost:60,f(){
      G.spells.push('gale');if(!G.spellEq)G.spellEq='gale';
      toast('Learned the GALE STEP spell');refreshButtons();}},
    G.pouch?{label:'3 Bombs',cost:15,f(){G.bombs+=3;}}
           :{label:'Bomb Pouch',cost:25,f(){G.pouch=true;G.bombs+=3;refreshButtons();}}];
  return[ // holt
    G.rod?null:{label:'Fishing Rod',cost:15,f(){G.rod=true;toast('Fishing rod — face water and cast');}},
    {label:'6 Arrows',cost:9,f(){G.arrows+=6;}},
    {label:'Raw Meat',cost:5,f(){addFood('meat',1);}}];
}
function sellables(){
  const out=[];
  if((G.food.gfish||0)>0)out.push({label:'Golden Koi',get:40,f(){G.food.gfish--;}});
  if((G.food.fish||0)>0)out.push({label:'Raw Fish',get:6,f(){G.food.fish--;}});
  if((G.food.meat||0)>0)out.push({label:'Raw Meat',get:4,f(){G.food.meat--;}});
  if(G.mat.leather>0)out.push({label:'Leather',get:7,f(){G.mat.leather--;}});
  const spareW=G.inv.w.map((w,i)=>({w,i})).filter(x=>x.i!==G.eqM&&x.i!==G.eqO)
    .sort((a,b)=>gearValue(b.w)-gearValue(a.w)).slice(0,2);
  for(const s2 of spareW)out.push({label:instName(s2.w),get:gearValue(s2.w),f(){
    const idx=G.inv.w.indexOf(s2.w);
    if(idx>=0){G.inv.w.splice(idx,1);
      if(G.eqM>idx)G.eqM--;if(G.eqO>idx)G.eqO--;}
  }});
  const spareA=G.inv.a.map((a,i)=>({a,i})).filter(x=>x.i!==G.eqA&&aDef(x.a).def>0).slice(0,1);
  for(const s3 of spareA)out.push({label:instName(s3.a),get:gearValue(s3.a),f(){
    const idx=G.inv.a.indexOf(s3.a);
    if(idx>=0){G.inv.a.splice(idx,1);if(G.eqA>idx)G.eqA--;}
  }});
  return out;
}
function shop(key){
  const items=shopItems(key).filter(Boolean);
  const ch=items.slice(0,4).map(it=>{
    const cost=priceFor(key,it.cost);
    return{t:it.label+' — '+cost+'c',f(){
      if(G.coins>=cost){G.coins-=cost;it.f();sfx('coin');addTrust(key,2);toast('Purchased!');shop(key);}
      else{sfx('err');startDlg([{n:npcName(key),t:'Your pouch is lighter than your ambition, friend. Come back with coin.'}],{choices:[{t:'Leave',f(){}}]});}
    }};
  });
  const sell=sellables();
  if(sell.length)ch.push({t:'Sell goods…',f(){shopSell(key);}});
  if(key==='zef')ch.push({t:'Gamble — 40c, unmarked steel',f(){gamble(key);}});
  ch.push({t:'Leave',f(){}});
  const disc=priceMod(key);
  const line=disc<1?'For you? Friendly prices.':(disc>1?'Prices are… higher, for some.':'Browse, browse.');
  startDlg([{n:npcName(key)+trustTag(key),t:line}],{choices:ch.slice(0,6)});
}
function gamble(key){
  const cost=priceFor(key,40);
  if(G.coins<cost){sfx('err');
    startDlg([{n:'Zef',t:'Gambling needs coin, friend. That is rather the point.'}],{choices:[{t:'Leave',f(){}}]});
    return;}
  G.coins-=cost;
  const r=Math.random();
  const i=rollInst(pick(areaWpnPool(G.p.x,G.p.y)),r<.06?4:(r<.3?2:1));
  if(i.rar<1){i.rar=1;i.pre=pick(Object.keys(PREFIX).filter(p=>!PREFIX[p].armOnly));}
  G.inv.w.push(i);
  sfx('chest');addXP('charm',4);
  toast('Gambled: '+RARN[i.rar]+instName(i));
  startDlg([{n:'Zef',t:i.rar>=3?'…Zef will pretend that did not just happen. Enjoy it, friend.':(i.rar>=2?'Ooh — the dice love you today.':'The dice giveth what the dice giveth.')}],
    {choices:[{t:'Again!',f(){gamble(key);}},{t:'Enough',f(){shop(key);}}]});
}
function gearValue(i){
  const base=(WPN[i.k]||ARM[i.k]||{tier:0}).tier+1;
  return Math.max(2,Math.round((base*8+(i.rar||0)*12+i.up*5)*(0.4+0.6*i.dur/i.mx)));
}
function shopSell(key){
  const ch=sellables().slice(0,4).map(it=>({t:'Sell '+it.label+' — +'+it.get+'c',f(){
    it.f();G.coins+=it.get;sfx('coin');addTrust(key,1);addXP('charm',2);shopSell(key);
  }}));
  if(!ch.length){shop(key);return;}
  ch.push({t:'Back',f(){shop(key);}});
  startDlg([{n:npcName(key),t:'"Show me what you\'ve got."'}],{choices:ch});
}
/* ---- quest bookkeeping ---- */
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
  const pt=s=>({x:s.tx*TILE+12,y:s.ty*TILE+12});
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

/* ---- remembered callings: class start + hardcore choice ---- */
function newGameFlow(){
  resetState();
  startDlg([{n:'The Dark Before Waking',t:'Before the grass, before the light — a memory of hands. What did they know best?'}],
    {choices:[
      {t:'⚔ The weight of a sword — Warrior',f(){G.origin='warrior';}},
      {t:'🏹 The quiet of the woods — Rogue',f(){G.origin='rogue';}},
      {t:'✦ The old burning words — Sorcerer',f(){G.origin='sorcerer';}}],
     end(){
       applyOrigin();
       startDlg([{n:'The Dark Before Waking',t:'And how tightly will fate hold this tale?'}],
         {choices:[
           {t:"Wanderer's Road — fall and rise again",f(){G.hardcore=false;}},
           {t:'HARDCORE — death erases everything',f(){G.hardcore=true;}}],
          end(){
            if(G.hardcore)toast('Hardcore — the wild will not forgive');
            fadeOut(()=>{setMode('intro');G.introI=0;G.introT=0;fadeIn(600);},350);
          }});
     }});
}
function applyOrigin(){
  if(G.origin==='warrior'){
    const i=addWpn('soldier');G.eqM=G.inv.w.indexOf(i);
    addArm('leather');G.eqA=G.inv.a.length-1;
    G.xp.blades=45;G.xp.guard=45;G.pts.blades=1;G.pts.guard=1;
  }else if(G.origin==='rogue'){
    const a=addWpn('dagger'),b=addWpn('dagger');
    G.eqM=G.inv.w.indexOf(a);G.eqO=G.inv.w.indexOf(b);
    G.xp.hunt=45;G.xp.agility=45;G.pts.hunt=1;G.pts.agility=1;
    G.coins+=15;
  }else if(G.origin==='sorcerer'){
    if(!G.spells.includes('bolt'))G.spells.push('bolt');
    G.spellEq='bolt';G.pot.mp+=2;
    G.xp.magic=45;G.xp.charm=45;G.pts.magic=1;G.pts.charm=1;
  }
  refreshButtons();
}
