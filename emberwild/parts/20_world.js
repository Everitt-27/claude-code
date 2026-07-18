/* ================= world generation ================= */
let SP=null; const POIS=[]; const chunkPois=new Map();

const elevAt=(tx,ty)=>{
  const nx=tx/WORLD-.5,ny=ty/WORLD-.5,d=Math.sqrt(nx*nx+ny*ny)*2;
  let e=fbm(tx*.012,ty*.012,NS,4)*.75+fbm(tx*.045,ty*.045,NS+9,2)*.25;
  return e*(1-.85*smw(clamp((d-.58)/.40,0,1)))+.06*(1-d);
};
const moistAt=(tx,ty)=>fbm(tx*.016+40,ty*.016,NS+31,3);
const tempAt=(tx,ty,e)=>clamp(ty/WORLD*1.25-.12+(fbm(tx*.02,ty*.02,NS+63,2)-.5)*.34-Math.max(0,e-.62)*.6,0,1);
const riverAt=(tx,ty)=>Math.abs(vnoise(tx*.006,ty*.006,NS+77)-.5)<.012;

function baseTileAt(tx,ty){
  if(tx<0||ty<0||tx>=WORLD||ty>=WORLD)return T_DEEP;
  const e=elevAt(tx,ty);
  if(e<.30)return T_DEEP;
  if(e<.352)return T_WATER;
  const dc=hyp(tx-SP.cit.tx,ty-SP.cit.ty);
  if(dc<11)return T_STONE;
  if(e<.378)return T_SAND;
  if(dc<30){const h=h01(tx,ty,NS+5);
    if(G.healed)return h<.18?T_MEADOW:T_GRASS;
    return h<.45?T_ASH:T_BLIGHT;}
  if(riverAt(tx,ty)&&e<.74)return T_WATER;
  if(e>.76)return T_ROCK;
  const t=tempAt(tx,ty,e),m=moistAt(tx,ty);
  if(t<.30)return (h01(tx,ty,NS+4)<.13&&e<.62)?T_STREE:T_SNOW;
  if(m>.74&&t>.38&&t<.62&&e<.5)return h01(tx,ty,NS+6)<.26?T_SWATER:T_SWAMP;
  if(t>.68&&m<.46)return h01(tx,ty,NS+3)<.03?T_CACTUS:T_DESERT;
  if(m>.60)return h01(tx,ty,NS+7)<.32?T_TREE:T_FGRASS;
  const h=h01(tx,ty,NS+8);
  return h<.05?T_TREE:(h<.17?T_MEADOW:T_GRASS);
}

function stampTile(base,tx,ty,stamps){
  let t=base;
  for(const p of stamps){
    const d=hyp(tx-p.tx,ty-p.ty);
    switch(p.k){
      case'vil':if(d<8.5){if(SOLIDT(t)||WATERT(t)||CLIMBT(t))t=T_GRASS;if(d<2.8)t=T_ROAD;}break;
      case'ruins':if(d<5.5)t=T_STONE;else if(d<7.5&&(SOLIDT(t)||WATERT(t)))t=T_FGRASS;break;
      case'shrine':if(d<2.4)t=T_STONE;else if(d<3.6&&SOLIDT(t))t=T_GRASS;break;
      case'tower':if(d<2.2)t=T_STONE;else if(d<3.4&&SOLIDT(t))t=T_GRASS;break;
      case'camp':if(d<4.6&&(SOLIDT(t)||WATERT(t)))t=T_GRASS;break;
      case'glade':if(d<5&&SOLIDT(t))t=T_MEADOW;break;
      case'lonetree':if(d<4&&(SOLIDT(t)||WATERT(t)))t=T_GRASS;break;
      case'grove':if(d<4&&SOLIDT(t))t=T_GRASS;break;
      case'stone':case'chest':case'fire':if(d<2&&(SOLIDT(t)||WATERT(t)))t=T_GRASS;break;
      case'dock':if(d<1.6&&SOLIDT(t))t=T_SAND;break;
      case'field':if(d<4&&(SOLIDT(t)||WATERT(t)))t=T_GRASS;break;
    }
  }
  return t;
}

/* ---- chunks ---- */
let canvasCount=0;
const chunkKey=(cx,cy)=>cx+cy*NCH;
function getChunk(cx,cy){
  const k=chunkKey(cx,cy);
  let c=G.chunks.get(k);
  if(!c){
    const tiles=new Uint8Array(CHUNK*CHUNK);
    const stamps=chunkPois.get(k)||[];
    for(let y=0;y<CHUNK;y++)for(let x=0;x<CHUNK;x++)
      tiles[x+y*CHUNK]=stampTile(baseTileAt(cx*CHUNK+x,cy*CHUNK+y),cx*CHUNK+x,cy*CHUNK+y,stamps);
    c={cx,cy,tiles,canvas:null,props:null,use:0};
    G.chunks.set(k,c);
    if(G.chunks.size>460)evictChunks();
  }
  c.use=G.vt;
  return c;
}
function evictChunks(){
  const arr=[...G.chunks.values()].sort((a,b)=>a.use-b.use);
  for(let i=0;i<arr.length-360;i++){
    if(arr[i].canvas)canvasCount--;
    G.chunks.delete(chunkKey(arr[i].cx,arr[i].cy));
  }
}
function freeCanvases(){
  if(canvasCount<=26)return;
  const arr=[...G.chunks.values()].filter(c=>c.canvas).sort((a,b)=>a.use-b.use);
  for(let i=0;i<arr.length-22;i++){arr[i].canvas=null;canvasCount--;}
}
function clearWorldCache(){
  for(const c of G.chunks.values()){c.canvas=null;}
  canvasCount=0;G.chunks.clear();
}
function tileAt(tx,ty){
  if(tx<0||ty<0||tx>=WORLD||ty>=WORLD)return T_DEEP;
  const c=getChunk(tx>>4,ty>>4);
  return c.tiles[(tx&15)+(ty&15)*CHUNK];
}
const tileAtPx=(x,y)=>tileAt(Math.floor(x/TILE),Math.floor(y/TILE));

/* ---- specials & POIs ---- */
function landPred(tx,ty){const e=elevAt(tx,ty);return e>.40&&e<.72&&!riverAt(tx,ty);}
function snap(fx,fy,pred){
  let bx=Math.floor(fx*WORLD),by=Math.floor(fy*WORLD);
  pred=pred||landPred;
  if(pred(bx,by))return{tx:bx,ty:by};
  for(let r=3;r<=72;r+=3)for(let a=0;a<16;a++){
    const tx=Math.round(bx+Math.cos(a/16*TAU)*r),ty=Math.round(by+Math.sin(a/16*TAU)*r);
    if(tx>4&&ty>4&&tx<WORLD-4&&ty<WORLD-4&&pred(tx,ty))return{tx,ty};
  }
  return{tx:bx,ty:by};
}
function initWorld(){
  SP={};
  SP.cit=snap(.5,.40);
  SP.spawn=snap(.505,.662);
  SP.vils=[
    Object.assign(snap(.548,.612),{name:'Emberhearth',vi:0}),
    Object.assign(snap(.40,.150),{name:'Frosthollow',vi:1}),
    Object.assign(snap(.765,.688),{name:'Dunewatch',vi:2})];
  const TNAMES=['Meadow Tower','Tide Tower','Dune Tower','Mire Tower','Frost Tower','Peak Tower'];
  SP.towers=[];
  for(let i=0;i<6;i++){
    const a=i/6*TAU-1.25;
    SP.towers.push(Object.assign(snap(.5+Math.cos(a)*.26,.47+Math.sin(a)*.25),{name:TNAMES[i],ti:i}));
  }
  const WD=[[.355,.215,'Warden of Snows'],[.665,.255,'Warden of Woods'],
            [.695,.565,'Warden of Sands'],[.325,.575,'Warden of Mists']];
  SP.wardens=WD.map((w,i)=>Object.assign(snap(w[0],w[1]),{name:w[2],wi:i}));
  const ST=[[.30,.58],[.70,.545],[.55,.225],[.28,.26],[.75,.32],[.26,.77],[.71,.79],[.50,.845]];
  SP.stones=ST.map((s,i)=>Object.assign(snap(s[0],s[1]),{li:i}));
  SP.borocamp=snap(.478,.610);
  SP.lonetree=snap(.605,.598);
  const coastPred=(x,y)=>{
    const e=elevAt(x,y);
    if(!(e>=.354&&e<.378))return false;
    return elevAt(x+1,y)<.35||elevAt(x-1,y)<.35||elevAt(x,y+1)<.35||elevAt(x,y-1)<.35;
  };
  SP.docks=[Object.assign(snap(.13,.52,coastPred),{di:0,name:'West Pier'}),
            Object.assign(snap(.88,.42,coastPred),{di:1,name:'East Pier'})];
  SP.fields=SP.vils.map((v,i)=>Object.assign(snap((v.tx+15)/WORLD,(v.ty+7)/WORLD),{vi:i}));

  const specials=[{...SP.cit,rr:44},{...SP.spawn,rr:20},...SP.vils.map(v=>({...v,rr:22})),
    ...SP.towers.map(t=>({...t,rr:18})),...SP.wardens.map(w=>({...w,rr:22})),
    {...SP.borocamp,rr:16},{...SP.lonetree,rr:12}];
  const tooClose=p=>specials.some(s=>hyp(p.tx-s.tx,p.ty-s.ty)<s.rr);

  POIS.length=0;
  const NCELL=Math.floor(WORLD/MCELL);
  for(let cy=0;cy<NCELL;cy++)for(let cx=0;cx<NCELL;cx++){
    const roll=hashi(cx,cy,NS+101)%100;
    let k=null;
    if(roll<8)k='shrine';else if(roll<22)k='camp';else if(roll<34)k='chest';
    else if(roll<44)k='grove';else if(roll<52)k='fire';else continue;
    const ox=(hashi(cx,cy,NS+102)%(MCELL-12))+6,oy=(hashi(cx,cy,NS+103)%(MCELL-12))+6;
    const fx=(cx*MCELL+ox)/WORLD,fy=(cy*MCELL+oy)/WORLD;
    const pos=k==='chest'
      ?snap(fx,fy,(x,y)=>{const e=elevAt(x,y);return e>.39&&!riverAt(x,y);})
      :snap(fx,fy);
    if(!landPred(pos.tx,pos.ty)&&k!=='chest')continue;
    if(tooClose(pos))continue;
    if(hyp(pos.tx-SP.cit.tx,pos.ty-SP.cit.ty)<40&&k!=='chest')continue;
    POIS.push({k,id:k[0]+cx+'_'+cy,tx:pos.tx,ty:pos.ty});
  }
  SP.towers.forEach((t,i)=>POIS.push({k:'tower',id:'t'+i,tx:t.tx,ty:t.ty,name:t.name}));
  SP.wardens.forEach((w,i)=>POIS.push({k:'ruins',id:'w'+i,tx:w.tx,ty:w.ty,name:w.name,wi:i}));
  SP.stones.forEach((s,i)=>POIS.push({k:'stone',id:'s'+i,tx:s.tx,ty:s.ty,lore:i}));
  SP.vils.forEach((v,i)=>POIS.push({k:'vil',id:'v'+i,tx:v.tx,ty:v.ty,name:v.name,vi:i}));
  POIS.push({k:'cit',id:'cit',tx:SP.cit.tx,ty:SP.cit.ty,name:'Sunken Citadel'});
  POIS.push({k:'glade',id:'glade',tx:SP.spawn.tx,ty:SP.spawn.ty});
  POIS.push({k:'camp',id:'borocamp',tx:SP.borocamp.tx,ty:SP.borocamp.ty});
  POIS.push({k:'lonetree',id:'lonetree',tx:SP.lonetree.tx,ty:SP.lonetree.ty});
  SP.docks.forEach((d,i)=>POIS.push({k:'dock',id:'dock'+i,tx:d.tx,ty:d.ty,name:d.name}));
  SP.fields.forEach((f,i)=>POIS.push({k:'field',id:'field'+i,tx:f.tx,ty:f.ty,vi:i}));
  G.totalShrines=POIS.filter(p=>p.k==='shrine').length;

  chunkPois.clear();
  for(const p of POIS){
    const rr=p.k==='cit'?15:(p.k==='vil'?11:(p.k==='ruins'?9:6));
    const c0x=Math.max(0,(p.tx-rr)>>4),c1x=Math.min(NCH-1,(p.tx+rr)>>4);
    const c0y=Math.max(0,(p.ty-rr)>>4),c1y=Math.min(NCH-1,(p.ty+rr)>>4);
    for(let y=c0y;y<=c1y;y++)for(let x=c0x;x<=c1x;x++){
      const k=chunkKey(x,y);
      if(!chunkPois.has(k))chunkPois.set(k,[]);
      chunkPois.get(k).push(p);
    }
  }
}

/* ---- props ---- */
function buildProps(c){
  const props=[];
  const list=chunkPois.get(chunkKey(c.cx,c.cy))||[];
  for(const poi of list){
    if((poi.tx>>4)!==c.cx||(poi.ty>>4)!==c.cy)continue;
    const X=poi.tx*TILE+12,Y=poi.ty*TILE+12;
    switch(poi.k){
      case'shrine':props.push({t:'shrine',x:X,y:Y,r:15,id:poi.id,sol:1});break;
      case'tower':props.push({t:'tower',x:X,y:Y,r:13,id:poi.id,name:poi.name,sol:1});break;
      case'chest':props.push({t:'chest',x:X,y:Y,r:9,id:poi.id,sol:1});break;
      case'stone':props.push({t:'stone',x:X,y:Y,r:8,id:poi.id,lore:poi.lore,sol:1});break;
      case'fire':props.push({t:'fire',x:X,y:Y,r:8,id:poi.id});break;
      case'grove':for(let i=0;i<3;i++){const a=i/3*TAU+.5;
        props.push({t:'ftree',x:X+Math.cos(a)*34,y:Y+Math.sin(a)*30,r:9,id:poi.id+'f'+i,sol:1});}break;
      case'camp':
        props.push({t:'fire',x:X,y:Y,r:8,id:poi.id+'f'});
        props.push({t:'tent',x:X-32,y:Y-12,r:13,id:poi.id+'t0',sol:1});
        props.push({t:'tent',x:X+30,y:Y-18,r:13,id:poi.id+'t1',sol:1});
        props.push({t:'chest',x:X+4,y:Y-38,r:9,id:poi.id+'c',camp:poi.id,sol:1});
        break;
      case'ruins':
        for(let i=0;i<5;i++){const a=i/5*TAU+.3;
          props.push({t:'pillar',x:X+Math.cos(a)*64,y:Y+Math.sin(a)*58,r:8,id:poi.id+'p'+i,sol:1});}
        props.push({t:'chest',x:X,y:Y-52,r:9,id:poi.id+'c',ward:poi.id,sol:1});
        break;
      case'vil':{
        const H=[[-56,-42],[56,-36],[-60,30],[50,42]];
        H.forEach((h,i)=>props.push({t:'hut',x:X+h[0],y:Y+h[1],w:58,h:46,rect:1,id:poi.id+'h'+i,sol:1,vi:poi.vi,sale:i===0?1:0}));
        props.push({t:'fire',x:X,y:Y+8,r:8,id:poi.id+'f'});
        props.push({t:'statue',x:X,y:Y-44,r:9,id:poi.id+'s',sol:1});
        props.push({t:'stall',x:X-4,y:Y+46,r:11,id:poi.id+'m',sol:1,vi:poi.vi});
        if(poi.vi===0||poi.vi===2)props.push({t:'stable',x:X+72,y:Y+6,r:14,id:poi.id+'st',vi:poi.vi});
        if(poi.vi===0)props.push({t:'forge',x:X+46,y:Y-26,r:9,id:poi.id+'fg',sol:1});
        break;}
      case'dock':{
        props.push({t:'dock',x:X,y:Y,r:12,id:poi.id,name:poi.name});
        break;}
      case'field':{
        props.push({t:'field',x:X,y:Y,r:14,id:poi.id,vi:poi.vi});
        break;}
      case'cit':{
        props.push({t:'gate',x:X,y:Y+10*TILE,r:22,id:'gate',sol:1});
        props.push({t:'throne',x:X,y:Y-56,r:11,id:'throne',sol:1});
        for(let i=0;i<16;i++){const a=i/16*TAU;
          if(Math.abs(angDiff(a,Math.PI/2))<.42)continue;
          props.push({t:'pillar',x:X+Math.cos(a)*240,y:Y+Math.sin(a)*240,r:11,id:'citp'+i,sol:1,big:1});}
        break;}
      case'lonetree':
        props.push({t:'bigtree',x:X,y:Y,r:13,id:'lonetree',sol:1});
        props.push({t:'doll',x:X+22,y:Y+16,r:6,id:'doll'});
        break;
    }
  }
  for(let i=0;i<5;i++){
    const hx=hashi(c.cx*5+i,c.cy,NS+401)%CHUNK,hy=hashi(c.cx,c.cy*5+i,NS+402)%CHUNK;
    const ttx=c.cx*CHUNK+hx,tty=c.cy*CHUNK+hy;
    const t=c.tiles[hx+hy*CHUNK];
    const near=list.some(p=>hyp(ttx-p.tx,tty-p.ty)<8);
    if(near)continue;
    const h=h01(ttx,tty,NS+403+i*7);
    if(i<3){
      if((t===T_GRASS||t===T_MEADOW)&&h<.55)
        props.push({t:'bush',x:ttx*TILE+12,y:tty*TILE+12,r:7,id:'b'+ttx+'_'+tty});
      else if(t===T_ROCK&&h<.22)
        props.push({t:'boulder',x:ttx*TILE+12,y:tty*TILE+12,r:10,id:'o'+ttx+'_'+tty,sol:1});
      else if((t===T_FGRASS||t===T_SWAMP)&&h<.4)
        props.push({t:'shroomp',x:ttx*TILE+12,y:tty*TILE+12,r:6,id:'m'+ttx+'_'+tty});
    }else{
      if(t===T_FGRASS&&h<.34)
        props.push({t:'branch',x:ttx*TILE+12,y:tty*TILE+12,r:6,id:'w'+ttx+'_'+tty});
      else if(t===T_ROCK&&h<.3)
        props.push({t:'orevein',x:ttx*TILE+12,y:tty*TILE+12,r:9,id:'v'+ttx+'_'+tty,sol:1});
    }
  }
  c.props=props;
}
function propsNear(x,y,rad){
  rad=rad||1;
  const cx=Math.floor(x/(TILE*CHUNK)),cy=Math.floor(y/(TILE*CHUNK));
  const out=[];
  for(let j=-rad;j<=rad;j++)for(let i=-rad;i<=rad;i++){
    const ax=cx+i,ay=cy+j;
    if(ax<0||ay<0||ax>=NCH||ay>=NCH)continue;
    const c=getChunk(ax,ay);
    if(!c.props)buildProps(c);
    for(const p of c.props)out.push(p);
  }
  return out;
}
function propSolid(p){
  if(!p.sol)return false;
  if(p.t==='gate')return !flag('gateopen');
  if(p.t==='boulder')return !flag('op:'+p.id);
  return true;
}
function propBlk(list,x,y){
  for(const p of list){
    if(!propSolid(p))continue;
    if(p.rect){if(Math.abs(x-p.x)<p.w/2&&Math.abs(y-p.y)<p.h/2)return true;}
    else{const dx=x-p.x,dy=y-p.y;if(dx*dx+dy*dy<p.r*p.r)return true;}
  }
  return false;
}

/* ---- tile atlas (all art is procedural — zero asset bytes) ---- */
let ACELL=48;
function buildAtlas(){
  ACELL=Math.round(TILE*CS);
  const cnv=document.createElement('canvas');
  cnv.width=ACELL*18*3;cnv.height=ACELL;
  const g=cnv.getContext('2d');
  for(let id=0;id<18;id++)for(let v=0;v<3;v++)tileArt(g,id,v,(id*3+v)*ACELL,0,ACELL);
  G.atlas=cnv;
}
function tileArt(g,id,vr,X,Y,s){
  const R=i=>h01(id*7+vr*3,i*13+vr,NS+301+i);
  const u=f=>f*s;
  g.save();g.translate(X,Y);
  const fill=c=>{g.fillStyle=c;g.fillRect(0,0,s,s);};
  const dot=(x,y,r,c,a)=>{g.globalAlpha=a===undefined?1:a;g.fillStyle=c;
    g.beginPath();g.arc(u(x),u(y),u(r),0,TAU);g.fill();g.globalAlpha=1;};
  const blade=(x,y,c)=>{g.strokeStyle=c;g.lineWidth=u(.045);g.beginPath();
    g.moveTo(u(x),u(y));g.lineTo(u(x+.02),u(y-.13));g.stroke();};
  switch(id){
    case T_DEEP:fill('#2c5f8a');dot(.3+R(1)*.4,.3+R(2)*.4,.22,'#254f74',.5);break;
    case T_WATER:fill('#3f7fae');g.strokeStyle='rgba(255,255,255,.12)';g.lineWidth=u(.05);
      g.beginPath();g.moveTo(u(.15),u(.3+R(1)*.4));g.quadraticCurveTo(u(.5),u(.22+R(1)*.4),u(.85),u(.3+R(1)*.4));g.stroke();break;
    case T_SAND:fill('#ecd9a0');for(let i=0;i<6;i++)dot(R(i)*1,R(i+9)*1,.03,'#d9c084');
      if(vr===2)dot(.5,.5,.06,'#c9b078');break;
    case T_GRASS:fill('#79b855');for(let i=0;i<7;i++)blade(R(i)*.9+.05,R(i+11)*.8+.15,'#67a748');
      for(let i=0;i<2;i++)blade(R(i+20)*.9+.05,R(i+31)*.8+.15,'#8cc766');break;
    case T_MEADOW:{fill('#8cc463');for(let i=0;i<5;i++)blade(R(i)*.9+.05,R(i+11)*.8+.15,'#77af52');
      const fc=['#f6f2e4','#f2d24b','#e08ab8'][vr];
      for(let i=0;i<3;i++){const fx=.2+R(i+40)*.6,fy=.2+R(i+50)*.6;
        dot(fx,fy,.06,fc);dot(fx,fy,.025,'#e8b04a');}break;}
    case T_FGRASS:fill('#4f9147');for(let i=0;i<6;i++)blade(R(i)*.9+.05,R(i+11)*.8+.15,'#427e3b');
      if(vr===1)dot(.5,.55,.05,'#3a7034');break;
    case T_TREE:{fill('#4f9147');
      g.fillStyle='#6b4a2e';g.fillRect(u(.44),u(.52),u(.12),u(.3));
      dot(.5,.8,.3,'rgba(0,0,0,.18)');
      dot(.5,.42,.34,'#2f6d3a');dot(.42,.34,.22,'#3f8a4c');
      for(let i=0;i<3;i++)dot(.3+R(i)*.4,.25+R(i+7)*.3,.045,'#57a35f');break;}
    case T_ROCK:{fill('#8d8577');
      g.fillStyle='#7b7466';g.beginPath();g.moveTo(u(.1),u(.9));g.lineTo(u(.45),u(.25+R(1)*.2));
      g.lineTo(u(.8),u(.85));g.closePath();g.fill();
      g.fillStyle='#9c968a';g.beginPath();g.moveTo(u(.45),u(.25+R(1)*.2));g.lineTo(u(.8),u(.85));
      g.lineTo(u(.95),u(.5));g.closePath();g.fill();
      g.strokeStyle='#6a6458';g.lineWidth=u(.04);g.beginPath();
      g.moveTo(u(.2+R(2)*.3),u(.2));g.lineTo(u(.4+R(3)*.3),u(.7));g.stroke();break;}
    case T_SNOW:fill('#e9eff4');for(let i=0;i<4;i++)dot(R(i),R(i+9),.035,'#d3dfe9');
      if(vr===1)dot(.5,.4,.045,'#ffffff');break;
    case T_STREE:{fill('#e9eff4');
      dot(.5,.85,.26,'rgba(0,0,0,.12)');
      g.fillStyle='#35634a';
      for(let l=0;l<3;l++){const w=.38-l*.1,ty=.62-l*.22;
        g.beginPath();g.moveTo(u(.5-w),u(ty));g.lineTo(u(.5+w),u(ty));g.lineTo(u(.5),u(ty-.26));g.closePath();g.fill();}
      g.fillStyle='#e9eff4';g.fillRect(u(.3),u(.36),u(.4),u(.045));
      g.fillStyle='#5a4630';g.fillRect(u(.46),u(.62),u(.08),u(.2));break;}
    case T_DESERT:fill('#e3bd77');g.strokeStyle='#d3a961';g.lineWidth=u(.05);
      g.beginPath();g.moveTo(u(.1),u(.3+R(1)*.3));g.quadraticCurveTo(u(.5),u(.2+R(1)*.3),u(.9),u(.3+R(1)*.3));g.stroke();
      g.beginPath();g.moveTo(u(.1),u(.65+R(2)*.2));g.quadraticCurveTo(u(.5),u(.55+R(2)*.2),u(.9),u(.65+R(2)*.2));g.stroke();break;
    case T_CACTUS:{fill('#e3bd77');dot(.5,.82,.2,'rgba(0,0,0,.14)');
      g.fillStyle='#5d9950';g.beginPath();g.roundRect(u(.42),u(.3),u(.16),u(.5),u(.08));g.fill();
      g.beginPath();g.roundRect(u(.26),u(.4),u(.12),u(.2),u(.06));g.fill();
      g.fillStyle='#4d8342';for(let i=0;i<3;i++)g.fillRect(u(.48),u(.36+i*.13),u(.04),u(.05));
      if(vr===2)dot(.5,.28,.05,'#e88ab8');break;}
    case T_SWAMP:fill('#64794b');for(let i=0;i<4;i++)dot(R(i),R(i+9),.05,'#55693f');
      g.strokeStyle='#7a9159';g.lineWidth=u(.04);
      for(let i=0;i<3;i++){const x=.2+R(i+20)*.6;g.beginPath();g.moveTo(u(x),u(.8));g.lineTo(u(x),u(.45));g.stroke();dot(x,.42,.035,'#8ba368');}break;
    case T_SWATER:fill('#4a6357');g.strokeStyle='rgba(255,255,255,.07)';g.lineWidth=u(.05);
      g.beginPath();g.arc(u(.5),u(.5),u(.3),0,Math.PI);g.stroke();
      if(vr===1){dot(.55,.4,.14,'#6f8f5b');dot(.55,.4,.045,'#5d7a4b');}break;
    case T_ASH:fill('#6f6468');for(let i=0;i<5;i++)dot(R(i),R(i+9),.04,'#5d5458');
      if(vr!==0)dot(.3+R(11)*.4,.3+R(12)*.4,.03,'#e8894a',.9);break;
    case T_BLIGHT:{fill('#6d4a85');dot(.3+R(1)*.4,.3+R(2)*.4,.24,'#5f3e77',.6);
      g.strokeStyle='#8f65ad';g.lineWidth=u(.045);g.beginPath();
      g.moveTo(u(R(3)),u(R(4)));g.quadraticCurveTo(u(.5),u(.5),u(R(5)),u(R(6)));g.stroke();
      dot(.25+R(7)*.5,.25+R(8)*.5,.045,'#b78ad2',.8);break;}
    case T_ROAD:fill('#c9b48f');g.strokeStyle='#b19c76';g.lineWidth=u(.04);
      for(let i=0;i<3;i++){g.beginPath();
        g.roundRect(u(.1+R(i)*.5),u(.1+R(i+5)*.55),u(.3),u(.22),u(.08));g.stroke();}break;
    case T_STONE:fill('#a8a29a');g.strokeStyle='#948e84';g.lineWidth=u(.035);
      g.beginPath();g.moveTo(0,u(.5));g.lineTo(s,u(.5));g.moveTo(u(.5),0);g.lineTo(u(.5),u(.5));
      g.moveTo(u(.25),u(.5));g.lineTo(u(.25),s);g.stroke();
      if(vr===2){g.beginPath();g.moveTo(u(.6),u(.6));g.lineTo(u(.8),u(.85));g.stroke();}break;
  }
  g.restore();
}
function renderChunk(c){
  const px=CHUNK*ACELL;
  const cnv=document.createElement('canvas');cnv.width=px;cnv.height=px;
  const g=cnv.getContext('2d');
  for(let y=0;y<CHUNK;y++)for(let x=0;x<CHUNK;x++){
    const t=c.tiles[x+y*CHUNK];
    const v=hashi(c.cx*CHUNK+x,c.cy*CHUNK+y,NS+201)%3;
    g.drawImage(G.atlas,(t*3+v)*ACELL,0,ACELL,ACELL,x*ACELL,y*ACELL,ACELL,ACELL);
  }
  g.strokeStyle='rgba(255,255,255,.28)';g.lineWidth=ACELL*.06;g.lineCap='round';
  for(let y=0;y<CHUNK;y++)for(let x=0;x<CHUNK;x++){
    const tx=c.cx*CHUNK+x,ty=c.cy*CHUNK+y;
    if(!WATERT(c.tiles[x+y*CHUNK]))continue;
    const landN=!WATERT(tileAt(tx,ty-1)),landW=!WATERT(tileAt(tx-1,ty));
    if(landN){g.beginPath();g.moveTo(x*ACELL+ACELL*.15,y*ACELL+ACELL*.1);
      g.lineTo(x*ACELL+ACELL*.85,y*ACELL+ACELL*.1);g.stroke();}
    if(landW){g.beginPath();g.moveTo(x*ACELL+ACELL*.1,y*ACELL+ACELL*.15);
      g.lineTo(x*ACELL+ACELL*.1,y*ACELL+ACELL*.85);g.stroke();}
  }
  c.canvas=cnv;canvasCount++;
  freeCanvases();
}

/* ---- world drawing (called inside camera transform) ---- */
function drawWorld(){
  const hw=VW/2/ZM+TILE,hh=VH/2/ZM+TILE;
  const c0x=clamp(Math.floor((G.cam.x-hw)/(TILE*CHUNK)),0,NCH-1),
        c1x=clamp(Math.floor((G.cam.x+hw)/(TILE*CHUNK)),0,NCH-1),
        c0y=clamp(Math.floor((G.cam.y-hh)/(TILE*CHUNK)),0,NCH-1),
        c1y=clamp(Math.floor((G.cam.y+hh)/(TILE*CHUNK)),0,NCH-1);
  let budget=2;
  for(let cy=c0y;cy<=c1y;cy++)for(let cx=c0x;cx<=c1x;cx++){
    const c=getChunk(cx,cy);
    if(!c.canvas&&budget>0){renderChunk(c);budget--;}
    if(c.canvas)
      ctx.drawImage(c.canvas,0,0,c.canvas.width,c.canvas.height,
        cx*CHUNK*TILE,cy*CHUNK*TILE,CHUNK*TILE,CHUNK*TILE);
    else{ctx.fillStyle=COLB[c.tiles[136]];
      ctx.fillRect(cx*CHUNK*TILE,cy*CHUNK*TILE,CHUNK*TILE,CHUNK*TILE);}
  }
  // animated water shimmer + ambient tile fx over the static cache
  const t0x=clamp(Math.floor((G.cam.x-hw)/TILE),0,WORLD-1),
        t1x=clamp(Math.floor((G.cam.x+hw)/TILE),0,WORLD-1),
        t0y=clamp(Math.floor((G.cam.y-hh)/TILE),0,WORLD-1),
        t1y=clamp(Math.floor((G.cam.y+hh)/TILE),0,WORLD-1);
  if(!G.lowfx){
    ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=1.6;ctx.lineCap='round';
    for(let ty=t0y;ty<=t1y;ty++)for(let tx=t0x;tx<=t1x;tx++){
      const h=(tx*31+ty*17)%7;
      const t=tileAt(tx,ty);
      if(WATERT(t)&&h===0){
        const ph=G.vt*1.4+tx*.7+ty*.3;
        const ox=Math.sin(ph)*4;
        ctx.beginPath();ctx.moveTo(tx*TILE+6+ox,ty*TILE+12);ctx.lineTo(tx*TILE+15+ox,ty*TILE+12);ctx.stroke();
      }else if(t===T_BLIGHT&&h===3){
        const ph=(G.vt*.5+h01(tx,ty,5))%1;
        ctx.fillStyle='rgba(183,138,210,'+(.5-Math.abs(ph-.5))+')';
        ctx.beginPath();ctx.arc(tx*TILE+12,ty*TILE+14-ph*16,1.6,0,TAU);ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.16)';
      }
    }
  }
}
/* guiding light-pillars: wayfinding without a gps chevron */
function drawBeams(){
  ctx.save();ctx.globalCompositeOperation='lighter';
  const draw=(x,y,col,w,hgt,a)=>{
    const gr=ctx.createLinearGradient(0,y-hgt,0,y);
    gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,col);
    ctx.globalAlpha=a;ctx.fillStyle=gr;
    ctx.fillRect(x-w/2,y-hgt,w,hgt);ctx.globalAlpha=1;};
  for(const p of POIS){
    const x=p.tx*TILE+12,y=p.ty*TILE+6;
    const d=hyp(x-G.cam.x,y-G.cam.y);
    if(d>1500)continue;
    if(p.k==='tower')draw(x,y-40,flag('tower:'+p.id)?'rgba(120,190,255,.30)':'rgba(255,150,60,.45)',10,300,.8);
    else if(p.k==='shrine'&&!flag('shrine:'+p.id))draw(x,y,'rgba(110,190,255,.4)',7,170,.75);
  }
  for(const t of questTargets()){
    const x=t.x,y=t.y,d=hyp(x-G.cam.x,y-G.cam.y);
    if(d>2200||d<60)continue;
    draw(x,y,'rgba(255,214,110,.5)',8,260,.5+.2*Math.sin(G.vt*3));
  }
  ctx.restore();
}
function reveal(tx,ty,r){
  const cx=Math.floor(tx/ECELL),cy=Math.floor(ty/ECELL);
  for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){
    if(i*i+j*j>r*r+1)continue;
    const x=cx+i,y=cy+j;
    if(x>=0&&y>=0&&x<EGRID&&y<EGRID)G.explored[x+y*EGRID]=1;
  }
}
