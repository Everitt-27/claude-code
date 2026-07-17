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

/* deterministic hashing / value noise (the whole world derives from this) */
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
const NS=1207;                 // world seed — one canonical continent
const TILE=24, WORLD=512, CHUNK=16, NCH=WORLD/CHUNK;
const MCELL=40;                // poi placement cell (tiles)
const ECELL=8, EGRID=WORLD/ECELL; // explored-map cell resolution
const DAYLEN=480;              // seconds per in-game day

const T_DEEP=0,T_WATER=1,T_SAND=2,T_GRASS=3,T_MEADOW=4,T_FGRASS=5,T_TREE=6,T_ROCK=7,
      T_SNOW=8,T_STREE=9,T_DESERT=10,T_CACTUS=11,T_SWAMP=12,T_SWATER=13,T_ASH=14,
      T_BLIGHT=15,T_ROAD=16,T_STONE=17;
const SOLIDT=id=>id===T_TREE||id===T_STREE||id===T_CACTUS;
const WATERT=id=>id===T_DEEP||id===T_WATER||id===T_SWATER;
const CLIMBT=id=>id===T_ROCK;
/* map-screen color per tile id */
const COLB=['#24486b','#3f7fae','#e8d29a','#79b855','#8cc463','#4f9147','#2f6d3a','#8d8577',
  '#e9eff4','#5d7a52','#e3bd77','#8ba055','#64794b','#4a6357','#6f6468','#6d4a85','#c9b48f','#a8a29a'];

const WPN={
  rusty:{n:'Rusty Sword',d:2,c:'#9aa3ac',t:0},
  soldier:{n:"Soldier's Blade",d:4,c:'#c8d3dd',t:1},
  knight:{n:"Knight's Claymore",d:6,c:'#e4ecf4',t:2},
  ember:{n:'Ember Blade',d:9,c:'#ffb35c',t:3}};
const FOODS={
  apple:{n:'Apple',h:2,c:'#e05b4b',cook:'bapple'},
  bapple:{n:'Baked Apple',h:4,c:'#e08a3c'},
  shroom:{n:'Mushroom',h:2,c:'#c88ad2',cook:'rshroom'},
  rshroom:{n:'Roast Shroom',h:5,c:'#a86ac0'},
  meat:{n:'Raw Meat',h:2,c:'#d06a6a',cook:'steak'},
  steak:{n:'Seared Steak',h:8,c:'#a05436'}};
/* enemy base stats: r radius, hp, spd, aggro range, coins */
const EDEF={
  blob:{r:8,hp:4,spd:74,ag:150,coin:2},
  boar:{r:10,hp:7,spd:96,ag:80,coin:1},
  bandit:{r:9,hp:9,spd:86,ag:190,coin:4},
  brute:{r:12,hp:16,spd:70,ag:190,coin:8},
  archer:{r:8,hp:6,spd:92,ag:250,coin:4},
  skel:{r:8,hp:6,spd:120,ag:280,coin:3},
  wisp:{r:8,hp:5,spd:64,ag:260,coin:3},
  warden:{r:17,hp:75,spd:96,ag:170,coin:25},
  king:{r:18,hp:170,spd:110,ag:400,coin:0},
  npc:{r:8,hp:999,spd:16,ag:0,coin:0}};

/* ================= mutable state ================= */
const G={
  mode:'boot', tm:0, vt:0, dayT:.30, dayN:1, rain:0, rainT:20,
  cam:{x:0,y:0}, shake:0, slow:0, freeze:0, hurtT:0,
  ents:[], pr:[], px:[], ft:[],
  chunks:new Map(), atlas:null,
  flags:{}, q:{}, mq:-1,
  stats:{chests:0,shrines:0,stones:0,kills:0,deaths:0,steps:0},
  explored:new Uint8Array(EGRID*EGRID),
  camps:new Map(), trial:null, boss:null, king:null,
  p:null, lum:{x:0,y:0,vx:0,vy:0,t:0},
  coins:0, arrows:0, bombs:0, orbs:0, shards:0, totalShrines:0,
  wpn:'rusty', wpns:['rusty'], bow:false, pouch:false, food:{apple:2},
  lastSafe:null, audio:true, lowfx:false, healed:false, ended:false,
  saveT:0, ensT:0, expT:0, kbSeen:false};

const flag=k=>!!G.flags[k];
const setFlag=k=>{G.flags[k]=1;};
const newPlayer=(x,y)=>({x,y,vx:0,vy:0,r:7,face:Math.PI/2,hp:12,maxhp:12,st:100,maxst:100,
  exh:false,regenCd:0,anim:0,mv:0,act:'',actT:0,combo:0,chain:0,chargeT:0,charged:false,
  aim:false,aimAng:Math.PI/2,iv:0,flurry:0,kbx:0,kby:0,rollAng:0,lgx:x,lgy:y,climb:false,swim:false});

/* ================= storage (guarded — artifacts may sandbox it) ================= */
let storageOK=true, memSave=null;
const store={
  get(){try{return localStorage.getItem('emberwild1');}catch(e){storageOK=false;return memSave;}},
  set(v){memSave=v;try{localStorage.setItem('emberwild1',v);}catch(e){storageOK=false;}},
  del(){memSave=null;try{localStorage.removeItem('emberwild1');}catch(e){}}};

/* ================= DOM refs / view ================= */
const $=id=>document.getElementById(id);
const ew=$('ew'), cv=$('cv'), ctx=cv.getContext('2d');
let VW=320,VH=568,DPR=1,ZM=1,SCL=2,CS=2;

/* input snapshot consumed by the player update each frame */
const inp={mx:0,my:0,aP:false,aH:false,aR:false,rP:false,rH:false,rT:0,
  bowH:false,bowR:false,bombP:false,intP:false};
const keys={};
const joy={active:false,id:-1,ox:0,oy:0,dx:0,dy:0};

/* ================= audio: tiny procedural synth ================= */
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
  }
}
/* ambient music: pentatonic wanderer's tune, layered by situation */
let musNext=0,musStep=0;
const SC_DAY=[0,3,5,7,10,12,15],SC_NIGHT=[0,3,5,7,10],SC_BOSS=[0,2,3,5,7,8,10];
let melPos=3;
function musicTick(){
  if(!AC||!G.audio||AC.state!=='running')return;
  const bpm=G.boss?100:82, spb=60/bpm/4; // 16th note
  while(musNext<AC.currentTime+.25){
    const w=Math.max(0,musNext-AC.currentTime);
    const night=G.dayT>.72||G.dayT<.04;
    const combat=!!G.boss||G.ents.some(e=>e.aggro&&e.hp>0&&hyp(e.x-G.p.x,e.y-G.p.y)<340);
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
