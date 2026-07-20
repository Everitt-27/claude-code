<script>
(()=>{ 'use strict';
/* ================= core utils ================= */
const TAU=Math.PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const hyp=(x,y)=>Math.sqrt(x*x+y*y);
const angTo=(x1,y1,x2,y2)=>Math.atan2(y2-y1,x2-x1);
const angDiff=(a,b)=>{let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;};
const rnd=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const irnd=(a,b)=>Math.floor(rnd(a,b+1));
const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
const smw=t=>t*t*(3-2*t);

const hashi=(x,y,s)=>{let h=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(s,974634721))|0;
  h=Math.imul(h^(h>>>13),1274126177);return (h^(h>>>16))>>>0;};
const h01=(x,y,s)=>hashi(x,y,s)/4294967295;
const vnoise=(x,y,s)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const a=h01(xi,yi,s),b=h01(xi+1,yi,s),c=h01(xi,yi+1,s),d=h01(xi+1,yi+1,s);
  const u=smw(xf),v=smw(yf);return lerp(lerp(a,b,u),lerp(c,d,u),v);};
const fbm=(x,y,s,o=3)=>{let v=0,amp=.5,f=1;for(let i=0;i<o;i++){v+=amp*vnoise(x*f,y*f,s+i*57);f*=2;amp*=.5;}
  return v/(1-Math.pow(.5,o));};

if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){
    if(typeof r==='number')r=[r,r,r,r];
    this.moveTo(x+r[0],y);this.arcTo(x+w,y,x+w,y+h,r[1]);this.arcTo(x+w,y+h,x,y+h,r[2]);
    this.arcTo(x,y+h,x,y,r[3]);this.arcTo(x,y,x+w,y,r[0]);this.closePath();return this;};
}

/* ================= config ================= */
const NS=1207;
const TILE=24, WORLD=512, CHUNK=16, NCH=WORLD/CHUNK;
const MCELL=40, ECELL=8, EGRID=WORLD/ECELL;
const DAYLEN=480;

const T_DEEP=0,T_WATER=1,T_SAND=2,T_GRASS=3,T_MEADOW=4,T_FGRASS=5,T_TREE=6,T_ROCK=7,
      T_SNOW=8,T_STREE=9,T_DESERT=10,T_CACTUS=11,T_SWAMP=12,T_SWATER=13,T_ASH=14,
      T_BLIGHT=15,T_ROAD=16,T_STONE=17,T_DWALL=18;
const SOLIDT=id=>id===T_TREE||id===T_STREE||id===T_CACTUS||id===T_DWALL;
const WATERT=id=>id===T_DEEP||id===T_WATER||id===T_SWATER;
const CLIMBT=id=>id===T_ROCK;
const COLB=['#24486b','#3f7fae','#e8d29a','#79b855','#8cc463','#4f9147','#2f6d3a','#8d8577',
  '#e9eff4','#5d7a52','#e3bd77','#8ba055','#64794b','#4a6357','#6f6468','#6d4a85','#c9b48f','#a8a29a','#241f28'];

/* ---- weapons: diverse types; instances carry durability + upgrades ---- */
const WPN={
  rusty:{n:'Rusty Sword',t:'sword',d:2,spd:1,rc:0,kb:1,c:'#9aa3ac',tier:0},
  soldier:{n:"Soldier's Blade",t:'sword',d:4,spd:1,rc:0,kb:1,c:'#c8d3dd',tier:1},
  forged:{n:'Forged Blade',t:'sword',d:5,spd:1,rc:0,kb:1,c:'#d8e3ea',tier:1},
  knight:{n:"Knight's Claymore",t:'sword',d:6,spd:.9,rc:4,kb:1.2,c:'#e4ecf4',tier:2},
  ember:{n:'Ember Blade',t:'sword',d:9,spd:1,rc:2,kb:1.2,c:'#ffb35c',tier:3},
  dagger:{n:'Hunting Dagger',t:'dagger',d:2,spd:1.5,rc:-8,kb:.6,c:'#cdd6de',tier:0},
  twinfang:{n:'Twinfang',t:'dagger',d:4,spd:1.5,rc:-8,kb:.6,c:'#bfe3ff',tier:2},
  axe:{n:'Woodsman Axe',t:'axe',d:5,spd:.78,rc:0,kb:1.5,c:'#c9b48f',tier:1},
  waraxe:{n:'War Axe',t:'axe',d:8,spd:.72,rc:2,kb:1.7,c:'#e0c8a0',tier:2},
  spear:{n:'Ash Spear',t:'spear',d:4,spd:.95,rc:16,kb:1,c:'#c9b48f',tier:1},
  ironspear:{n:'Iron Spear',t:'spear',d:6,spd:.95,rc:18,kb:1.1,c:'#d8e3ea',tier:2},
  hammer:{n:'Forge Hammer',t:'hammer',d:7,spd:.62,rc:0,kb:2.4,c:'#b8aa9a',tier:2}};
const FIST={n:'Fists',t:'fist',d:1,spd:1.2,rc:-10,kb:.5,c:'#f2c9a0',tier:0};
const TIERC=['#f2e9d8','#8fce6a','#6db8f0','#ffd66e','#ff9a4a'];
const mkInst=(k,dur)=>({k,dur:dur===undefined?100:dur,mx:100,up:0});
const wDef=i=>(i&&WPN[i.k])?WPN[i.k]:FIST;
/* ---- Diablo-style magic affixes: prefixes, suffixes, rarities, uniques ---- */
const PREFIX={
  sharp:{n:'Sharp',dmg:2},
  brutal:{n:'Brutal',kb:.7},
  swift:{n:'Swift',spd:.2},
  sturdy:{n:'Sturdy',stur:1,arm:1},
  keen:{n:'Keen',crit:.14},
  warded:{n:'Warded',def:1,armOnly:1,arm:1},
  gilded:{n:'Gilded',gold:1,arm:1}};
const SUFFIX={
  fox:{n:'of the Fox',stam:25,arm:1},
  bear:{n:'of the Bear',hp:4,arm:1},
  embers:{n:'of Embers',burn:1},
  frost:{n:'of Frost',chill:1},
  leech:{n:'of the Leech',leech:1},
  fortune:{n:'of Fortune',gold:1,arm:1}};
const UNIQ=[
  {n:'Thornsong',base:'forged',pre:'sharp',suf:'leech'},
  {n:'Wolfsbane',base:'waraxe',pre:'keen',suf:'frost'},
  {n:'Dawnpiercer',base:'ironspear',pre:'swift',suf:'embers'},
  {n:'Gravedigger',base:'hammer',pre:'brutal',suf:'bear'},
  {n:'Duskfang',base:'twinfang',pre:'swift',suf:'fortune'}];
const RARC=['#f2e9d8','#6db8f0','#ffd66e','#ff9a4a'];
const RARN=['','Magic ','Rare ','UNIQUE '];
function rollInst(k,boost){
  const isArm=!!ARM[k];
  const i=isArm?{k,dur:irnd(60,100),mx:100,up:0}:mkInst(k,irnd(55,95));
  const r=Math.random()-(boost||0)*.08;
  let rar=r<.03?3:(r<.14?2:(r<.42?1:0));
  if(rar===3&&!isArm){
    const u=UNIQ.filter(u=>u.base===k);
    if(u.length){const q=pick(u);i.uniq=q.n;i.pre=q.pre;i.suf=q.suf;}
    else rar=2;
  }else if(rar===3)rar=2;
  const pres=Object.keys(PREFIX).filter(p=>isArm?PREFIX[p].arm:!PREFIX[p].armOnly);
  const sufs=Object.keys(SUFFIX).filter(s=>isArm?SUFFIX[s].arm:true);
  if(rar>=1&&!i.pre)i.pre=pick(pres);
  if(rar>=2&&!i.suf)i.suf=pick(sufs);
  if(i.pre==='sturdy'){i.mx=180;i.dur=Math.min(i.mx,i.dur+80);}
  i.rar=rar;
  return i;
}
function instName(i){
  if(!i)return FIST.n;
  if(i.uniq)return i.uniq;
  const base=(WPN[i.k]||ARM[i.k]||FIST).n;
  return (i.pre?PREFIX[i.pre].n+' ':'')+base+(i.suf?' '+SUFFIX[i.suf].n:'');
}
const instColor=i=>RARC[(i&&i.rar)||0];
const affix=(i,f)=>((i&&i.pre&&PREFIX[i.pre][f])||0)+((i&&i.suf&&SUFFIX[i.suf][f])||0);
const wDmg=i=>wDef(i).d+(i?i.up:0)+affix(i,'dmg');
const wSpdOf=i=>wDef(i).spd*(1+affix(i,'spd'));
const wKbOf=i=>wDef(i).kb+affix(i,'kb');

const ARM={
  cloth:{n:'Traveler Cloth',def:0,c:'#3f8f8a',c2:'#2d6a66',tier:0},
  leather:{n:'Leather Jerkin',def:1,c:'#8a6b4a',c2:'#6f5638',tier:1},
  mail:{n:'Soldier Mail',def:2,c:'#8a95a5',c2:'#5c6a7a',tier:2},
  plate:{n:'Knight Plate',def:3,c:'#c8d3dd',c2:'#9aa8b8',helm:1,tier:3},
  emberplate:{n:'Ember Plate',def:4,c:'#4a4250',c2:'#e8894a',helm:1,tier:4}};
const aDef=i=>(i&&ARM[i.k])?ARM[i.k]:ARM.cloth;

const MATS={wood:{n:'Wood',c:'#8a6b4a'},ore:{n:'Iron Ore',c:'#8d95a5'},leather:{n:'Leather',c:'#a8724a'}};
/* crafting recipes: [wood,ore,leather,coins] */
const RECIPES=[
  {k:'dagger',w:1,o:1,l:0,c:10},{k:'spear',w:2,o:1,l:0,c:15},{k:'axe',w:1,o:2,l:0,c:20},
  {k:'forged',w:1,o:3,l:0,c:30},{k:'twinfang',w:1,o:3,l:0,c:45},{k:'ironspear',w:2,o:3,l:0,c:40},
  {k:'hammer',w:2,o:3,l:0,c:35},{k:'waraxe',w:2,o:4,l:0,c:60},
  {k:'A:leather',w:0,o:0,l:3,c:10},{k:'A:mail',w:0,o:4,l:2,c:50},{k:'A:plate',w:0,o:6,l:2,c:100},
  {k:'I:arrows',w:1,o:0,l:0,c:0,n:'4 Arrows'},{k:'I:bombs',w:0,o:1,l:0,c:5,n:'2 Bombs'},
  {k:'I:rod',w:2,o:0,l:0,c:5,n:'Fishing Rod'}];

const FOODS={
  apple:{n:'Apple',h:2,c:'#e05b4b',cook:'bapple'},
  bapple:{n:'Baked Apple',h:4,c:'#e08a3c'},
  shroom:{n:'Mushroom',h:2,c:'#c88ad2',cook:'rshroom'},
  rshroom:{n:'Roast Shroom',h:5,c:'#a86ac0'},
  meat:{n:'Raw Meat',h:2,c:'#d06a6a',cook:'steak'},
  steak:{n:'Seared Steak',h:8,c:'#a05436'},
  fish:{n:'Raw Fish',h:3,c:'#7ab8d8',cook:'sfish'},
  sfish:{n:'Seared Fish',h:10,c:'#5a98c8'},
  gfish:{n:'Golden Koi',h:6,c:'#ffd66e'}};

const SPELLS={
  bolt:{n:'Ember Bolt',mp:10,c:'#ffb35c',d:'Hurl a searing bolt'},
  gale:{n:'Gale Step',mp:14,c:'#e8f4ff',d:'Blink forward through danger'},
  mend:{n:'Mend',mp:26,c:'#8fce6a',d:'Knit two hearts closed'},
  frost:{n:'Frost Ring',mp:22,c:'#9fd8ff',d:'Freeze every nearby foe'},
  storm:{n:'Storm Call',mp:34,c:'#d8b4f0',d:'Lightning strikes three foes'}};

/* ---- action-driven skill tree: 8 branches fed by what you actually do ---- */
const BRANCHES=['blades','archery','agility','guard','magic','craft','charm','hunt'];
const BRINFO={
  blades:{n:'Blades',c:'#e05b4b',src:'striking with melee weapons'},
  archery:{n:'Archery',c:'#8fce6a',src:'landing arrows'},
  agility:{n:'Agility',c:'#6db8f0',src:'sprinting, climbing and rolling'},
  guard:{n:'Guard',c:'#c9b48f',src:'enduring and dodging blows'},
  magic:{n:'Magic',c:'#b78ad2',src:'casting spells'},
  craft:{n:'Craft',c:'#e8894a',src:'gathering, cooking and smithing'},
  charm:{n:'Charm',c:'#e8b04a',src:'talking, trading and helping'},
  hunt:{n:'Hunt',c:'#79b855',src:'hunting, fishing and skulking'}};
const SKILLS={
  sharp:{br:'blades',tier:1,n:'Sharpened Edge',d:'+25% melee damage'},
  whirl:{br:'blades',tier:2,n:'Whirlwind',d:'Spin attacks cost half stamina'},
  bstorm:{br:'blades',tier:3,n:'Bladestorm',d:'Final combo hit strikes all around'},
  steady:{br:'archery',tier:1,n:'Steady Hand',d:'+50% arrow damage'},
  split:{br:'archery',tier:2,n:'Split Shot',d:'Loose three arrows in a fan'},
  hawk:{br:'archery',tier:3,n:'Hawk Eye',d:'Time crawls while you aim'},
  runner:{br:'agility',tier:1,n:"Runner's Breath",d:'Stamina drains 30% slower'},
  cat:{br:'agility',tier:2,n:"Cat's Grace",d:'Rolls cost half, dodge lasts longer'},
  flow:{br:'agility',tier:3,n:'Flow State',d:'Perfect-dodge slow-mo lasts twice as long'},
  skin:{br:'guard',tier:1,n:'Thick Skin',d:'Take 25% less damage'},
  wind2:{br:'guard',tier:2,n:'Second Wind',d:'Once a day, survive a lethal blow'},
  retrib:{br:'guard',tier:3,n:'Retribution',d:'Attackers are hurled back and singed'},
  spark:{br:'magic',tier:1,n:'Inner Spark',d:'+40 max mana'},
  frostS:{br:'magic',tier:2,n:'Frost Ring',d:'Learn the Frost Ring spell'},
  stormS:{br:'magic',tier:3,n:'Storm Call',d:'Learn the Storm Call spell'},
  forager:{br:'craft',tier:1,n:'Forager',d:'Gathering yields are doubled'},
  smith:{br:'craft',tier:2,n:'Blacksmith',d:'Craft, repair and upgrade anywhere'},
  master:{br:'craft',tier:3,n:'Masterwork',d:'Upgrades reach +5'},
  haggle:{br:'charm',tier:1,n:'Haggler',d:'Shops charge 20% less'},
  silver:{br:'charm',tier:2,n:'Silver Tongue',d:'Trust grows twice as fast'},
  leader:{br:'charm',tier:3,n:'Leader',d:'Companions fight 50% harder'},
  tracker:{br:'hunt',tier:1,n:'Tracker',d:'Hunts yield double meat and hides'},
  angler:{br:'hunt',tier:2,n:'Angler',d:'Fish bite fast; rare catches appear'},
  shadow:{br:'hunt',tier:3,n:'Shadowfoot',d:'Steal safely; foes notice you later'}};
const XPLVL=[0,40,120,260,480,800,1200,1800];
const lvlFor=xp=>{let l=0;while(l<XPLVL.length-1&&xp>=XPLVL[l+1])l++;return l;};

const EDEF={
  blob:{r:8,hp:4,spd:74,ag:150,coin:2},
  boar:{r:10,hp:7,spd:96,ag:80,coin:1},
  deer:{r:9,hp:5,spd:165,ag:0,coin:0},
  wolf:{r:9,hp:8,spd:135,ag:240,coin:1},
  bandit:{r:9,hp:9,spd:86,ag:190,coin:4},
  brute:{r:12,hp:16,spd:70,ag:190,coin:8},
  archer:{r:8,hp:6,spd:92,ag:250,coin:4},
  skel:{r:8,hp:6,spd:120,ag:280,coin:3},
  wisp:{r:8,hp:5,spd:64,ag:260,coin:3},
  warden:{r:17,hp:75,spd:96,ag:170,coin:25},
  king:{r:18,hp:170,spd:110,ag:400,coin:0},
  ally:{r:8,hp:30,spd:130,ag:0,coin:0},
  npc:{r:8,hp:999,spd:16,ag:0,coin:0}};

/* companions: who can join, how they fight, how they look */
const ALLYDEF={
  holt:{n:'Holt',cls:'archer',hp:26,w:'dagger',look:{body:'#5d5448',hood:'#8a6b4a'}},
  rhoa:{n:'Rhoa',cls:'blade',hp:38,w:'knight',look:{body:'#5c6a7a',hair:'#241c16',skin:'#c98d5f'}},
  wren:{n:'Wren',cls:'mage',hp:22,w:null,look:{body:'#4a6a8f',hair:'#8a6b4a',glasses:1}},
  boro:{n:'Boro',cls:'hammer',hp:44,w:'hammer',look:{body:'#6a4a38',apron:'#4a3b30',hair:'#3a2d22',skin:'#d9a878'}}};

/* ================= mutable state ================= */
const G={
  mode:'boot', tm:0, vt:0, dayT:.30, dayN:1, rain:0, rainT:20,
  cam:{x:0,y:0}, shake:0, slow:0, freeze:0, hurtT:0,
  ents:[], pr:[], px:[], ft:[],
  chunks:new Map(), atlas:null,
  flags:{}, q:{}, mq:-1,
  stats:{chests:0,shrines:0,stones:0,kills:0,deaths:0,steps:0,fish:0,hunts:0,crafted:0},
  explored:new Uint8Array(EGRID*EGRID),
  camps:new Map(), trial:null, boss:null,
  p:null, lum:{x:0,y:0,vx:0,vy:0,t:0},
  coins:0, arrows:0, bombs:0, orbs:0, shards:0, totalShrines:0,
  inv:{w:[mkInst('rusty')],a:[{k:'cloth',dur:100,mx:100,up:0}]},
  eqM:0, eqO:-1, eqA:0,
  mat:{wood:0,ore:0,leather:0},
  xp:{}, pts:{}, skills:{},
  spells:[], spellEq:'', mana:50, manaCd:0,
  trust:{}, team:[],
  horse:null, boat:null, rod:false,
  bow:false, pouch:false, food:{apple:2},
  pot:{hp:1,mp:0}, scrolls:0, hxp:0, hlvl:0, hardcore:false, origin:'',
  inDun:false, dun:null, dunRun:0, portal:null, pburn:0, pbAcc:0, chill:0,
  brokenUrns:new Set(), takenGold:new Set(),
  lastSafe:null, audio:true, lowfx:false, healed:false,
  saveT:0, ensT:0, expT:0, kbSeen:false};
BRANCHES.forEach(b=>{G.xp[b]=0;G.pts[b]=0;});

const flag=k=>!!G.flags[k];
const setFlag=k=>{G.flags[k]=1;};
const hasSkill=k=>!!G.skills[k];
const maxMana=()=>50+(hasSkill('spark')?40:0)+lvlFor(G.xp.magic)*10;
const eqMain=()=>G.inv.w[G.eqM]||null;
const eqOff=()=>G.eqO>=0?G.inv.w[G.eqO]||null:null;
const eqArm=()=>G.inv.a[G.eqA]||null;
function gearB(f){
  let v=0;
  for(const i of[eqMain(),eqOff(),eqArm()])v+=affix(i,f);
  return v;
}
const totHp=()=>G.p.maxhp+gearB('hp');
const totSt=()=>G.p.maxst+gearB('stam');
const goldMul=()=>1+gearB('gold')*.5;
const HXPL=n=>Math.round(100*Math.pow(n,1.6));
function heroLvlFor(x){let l=0;while(l<60&&HXPL(l+1)<=x)l++;return l;}
const newPlayer=(x,y)=>({x,y,vx:0,vy:0,r:7,face:Math.PI/2,hp:12,maxhp:12,st:100,maxst:100,
  exh:false,regenCd:0,anim:0,mv:0,act:'',actT:0,dur:.26,combo:0,chain:0,chargeT:0,charged:false,
  aim:false,aimAng:Math.PI/2,iv:0,flurry:0,kbx:0,kby:0,rollAng:0,lgx:x,lgy:y,climb:false,swim:false,
  mount:null,fish:null,hand:0,undyDay:0});

/* xp → branch levels → skill points, earned by doing; also feeds hero level */
function addXP(br,amt){
  if(!BRINFO[br]||amt<=0||G.mq<0)return;
  const l0=lvlFor(G.xp[br]);
  G.xp[br]+=amt;
  const l1=lvlFor(G.xp[br]);
  if(l1>l0){
    G.pts[br]=(G.pts[br]||0)+(l1-l0);
    sfx('orb');
    toast(BRINFO[br].n+' rank '+l1+' — skill point earned ('+BRINFO[br].src+')');
    refreshButtons();
  }
  G.hxp+=amt;
  const h1=heroLvlFor(G.hxp);
  if(h1>G.hlvl){
    G.hlvl=h1;
    if(h1%2)G.p.maxhp=Math.min(48,G.p.maxhp+2);
    else G.p.maxst=Math.min(220,G.p.maxst+6);
    G.p.hp=totHp();G.p.st=totSt();
    sfx('levelup');G.shake=Math.max(G.shake,3);
    if(typeof ringP==='function')ringP(G.p.x,G.p.y,'#ffd66e');
    toast('LEVEL '+h1+' — the wild takes notice');
  }
}
function learnSkill(id){
  const s=SKILLS[id];
  if(!s||G.skills[id])return false;
  const lvl=lvlFor(G.xp[s.br]);
  const needLvl=s.tier===1?1:(s.tier===2?2:4);
  const prev=Object.keys(SKILLS).find(k=>SKILLS[k].br===s.br&&SKILLS[k].tier===s.tier-1);
  if(lvl<needLvl||(G.pts[s.br]||0)<1||(prev&&!G.skills[prev]))return false;
  G.pts[s.br]--;G.skills[id]=1;
  if(id==='frostS'&&!G.spells.includes('frost'))G.spells.push('frost');
  if(id==='stormS'&&!G.spells.includes('storm'))G.spells.push('storm');
  if(!G.spellEq&&G.spells.length)G.spellEq=G.spells[0];
  sfx('chest');toast('Learned: '+s.n);
  refreshButtons();
  return true;
}
/* trust: every named NPC remembers how you treat them */
function addTrust(key,amt){
  if(amt>0&&hasSkill('silver'))amt*=2;
  const t0=G.trust[key]||0;
  const t1=clamp(t0+amt,-100,100);
  G.trust[key]=t1;
  if(amt>0)addXP('charm',Math.min(6,amt));
  if(t0<30&&t1>=30)toast(npcName(key)+' trusts you — better prices, warmer words');
  if(t0<60&&t1>=60){toast(npcName(key)+' confides in you…');revealSecret(key);}
  if(t0<80&&t1>=80&&ALLYDEF[key])toast(npcName(key)+' would follow you — ask them to join');
  if(t0>-30&&t1<=-30)toast(npcName(key)+' distrusts you — expect worse prices');
  if(t0>-60&&t1<=-60)toast(npcName(key)+' wants nothing to do with you');
}
const trustOf=key=>G.trust[key]||0;
function npcName(key){
  const N={elder:'Elder Maren',boro:'Boro',pip:'Pip',sella:'Sella',wren:'Wren',holt:'Holt',
    rhoa:'Captain Rhoa',zef:'Zef',juno:'Juno'};
  return N[key]||key;
}
function priceMod(key){
  let m=1;
  if(hasSkill('haggle'))m*=.8;
  const t=trustOf(key);
  if(t>=30)m*=.9;
  if(t<=-30)m*=1.25;
  return m;
}
const priceFor=(key,base)=>Math.max(1,Math.round(base*priceMod(key)));

/* ================= storage ================= */
let storageOK=true, memSave=null;
const store={
  get(){try{return localStorage.getItem('emberwild1');}catch(e){storageOK=false;return memSave;}},
  set(v){memSave=v;try{localStorage.setItem('emberwild1',v);}catch(e){storageOK=false;}},
  del(){memSave=null;try{localStorage.removeItem('emberwild1');}catch(e){}}};

/* ================= DOM refs / view ================= */
const $=id=>document.getElementById(id);
const ew=$('ew'), cv=$('cv'), ctx=cv.getContext('2d');
let VW=320,VH=568,DPR=1,ZM=1,SCL=2,CS=2;

const inp={mx:0,my:0,aP:false,aH:false,aR:false,rP:false,rH:false,rT:0,
  bowH:false,bowR:false,bombP:false,intP:false,spellP:false,potP:false};
const keys={};
const joy={active:false,id:-1,ox:0,oy:0,dx:0,dy:0};

/* ================= audio ================= */
let AC=null,sfxG=null,musG=null,noiseBuf=null;
function ensureAC(){
  if(!G.audio)return;
  if(AC){if(AC.state==='suspended')AC.resume().catch(()=>{});return;}
  try{
    const C=window.AudioContext||window.webkitAudioContext; if(!C)return;
    AC=new C(); sfxG=AC.createGain(); sfxG.gain.value=.5; sfxG.connect(AC.destination);
    musG=AC.createGain(); musG.gain.value=.34; musG.connect(AC.destination);
    noiseBuf=AC.createBuffer(1,AC.sampleRate,AC.sampleRate);
    const d=noiseBuf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  }catch(e){AC=null;}
}
function tone(f0,f1,dur,type,vol,dest,when=0){
  if(!AC)return;const t=AC.currentTime+when;
  const o=AC.createOscillator(),g=AC.createGain();
  o.type=type;o.frequency.setValueAtTime(f0,t);
  if(f1!==f0)o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g);g.connect(dest||sfxG);o.start(t);o.stop(t+dur+.02);
}
function noise(dur,vol,fq,when=0){
  if(!AC)return;const t=AC.currentTime+when;
  const s=AC.createBufferSource();s.buffer=noiseBuf;
  const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=fq;
  const g=AC.createGain();g.gain.setValueAtTime(vol,t);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  s.connect(f);f.connect(g);g.connect(sfxG);s.start(t);s.stop(t+dur+.02);
}
function sfx(n){
  if(!AC||!G.audio)return;
  switch(n){
    case'swing':noise(.09,.10,2600);break;
    case'hit':tone(240,90,.08,'square',.10);noise(.05,.08,1800);break;
    case'thud':tone(120,50,.12,'sine',.14);noise(.08,.10,700);break;
    case'hurt':tone(170,55,.22,'sawtooth',.12);break;
    case'pick':tone(660,990,.09,'sine',.08);break;
    case'coin':tone(880,880,.06,'sine',.06);tone(1318,1318,.09,'sine',.06,null,.05);break;
    case'chest':[523,659,784,1046].forEach((f,i)=>tone(f,f,.16,'triangle',.08,null,i*.09));break;
    case'orb':[784,1046,1318,1568].forEach((f,i)=>tone(f,f,.5,'sine',.05,null,i*.12));break;
    case'heal':[523,659,880].forEach((f,i)=>tone(f,f,.14,'sine',.06,null,i*.07));break;
    case'roll':noise(.12,.06,900);break;
    case'bow':tone(700,420,.08,'triangle',.09);break;
    case'boom':noise(.4,.22,420);tone(95,38,.4,'sine',.2);break;
    case'blip':tone(940,940,.03,'square',.022);break;
    case'err':tone(150,120,.12,'square',.06);break;
    case'roar':tone(110,45,.55,'sawtooth',.16);noise(.5,.12,500);break;
    case'alert':tone(520,720,.09,'square',.05);break;
    case'flurry':[880,1174,1568].forEach((f,i)=>tone(f,f,.22,'sine',.06,null,i*.05));break;
    case'travel':noise(.5,.10,1400);tone(300,900,.45,'sine',.05);break;
    case'gate':tone(70,42,.9,'sawtooth',.14);noise(.8,.1,300);break;
    case'sizzle':noise(.5,.08,2400);break;
    case'shake':noise(.2,.07,1200);break;
    case'anvil':tone(1200,900,.1,'square',.07);noise(.06,.1,3000);tone(600,500,.14,'sine',.06,null,.06);break;
    case'crack':noise(.2,.14,900);tone(300,80,.2,'square',.08);break;
    case'cast':tone(500,900,.2,'sine',.07);noise(.15,.05,3000);break;
    case'frost':tone(1400,400,.4,'sine',.08);noise(.3,.06,5000);break;
    case'zap':noise(.12,.16,6000);tone(1800,200,.18,'sawtooth',.1);break;
    case'gallop':noise(.07,.08,600);break;
    case'splash':noise(.25,.1,1000);tone(300,150,.2,'sine',.05);break;
    case'levelup':[659,784,1046,1318].forEach((f,i)=>tone(f,f,.3,'triangle',.07,null,i*.08));break;
  }
}
let musNext=0,musStep=0;
const SC_DAY=[0,3,5,7,10,12,15],SC_NIGHT=[0,3,5,7,10],SC_BOSS=[0,2,3,5,7,8,10];
let melPos=3;
function musicTick(){
  if(!AC||!G.audio||AC.state!=='running')return;
  const bpm=G.boss?100:82, spb=60/bpm/4;
  while(musNext<AC.currentTime+.25){
    const w=Math.max(0,musNext-AC.currentTime);
    const night=G.inDun||G.dayT>.72||G.dayT<.04;
    const combat=!!G.boss||G.ents.some(e=>e.aggro&&e.hp>0&&e.t!=='ally'&&hyp(e.x-G.p.x,e.y-G.p.y)<340);
    const root=night?98:130.81;
    const sc=G.boss?SC_BOSS:(night?SC_NIGHT:SC_DAY);
    const s=musStep%16;
    if(s===0||s===8)tone(root/2,root/2,.30,'triangle',.07,musG,w);
    else if(combat&&(s===4||s===12))tone(root/2*1.5,root/2*1.5,.2,'triangle',.06,musG,w);
    if(combat&&s%4===2)noise(.03,.018,6000,w);
    const prob=G.boss?.34:(combat?.3:(night?.11:.2));
    if(h01(musStep,G.dayN,77)<prob){
      melPos=clamp(melPos+irnd(-2,2),0,sc.length-1);
      const f=root*2*Math.pow(2,sc[melPos]/12);
      tone(f,f,.34,'triangle',.05,musG,w);
    }
    if(s===0&&(musStep%64===0)&&!combat){
      [0,7,12].forEach(sm=>{const f=root*Math.pow(2,sm/12);
        tone(f,f,3.2,'sine',.022,musG,w);});
    }
    musNext+=spb;musStep++;
  }
  if(musNext<AC.currentTime)musNext=AC.currentTime;
}
