/* ================= barrow delves: descending dungeons ================= */
const DUNW=44;
function dunTileAt(tx,ty){
  const D=G.dun;
  if(!D||tx<0||ty<0||tx>=DUNW||ty>=DUNW)return T_DWALL;
  return D.tiles[tx+ty*DUNW];
}
function genDun(seed,depth,poi){
  const R=i=>h01(seed,i*131+depth*17,977);
  const tiles=new Uint8Array(DUNW*DUNW).fill(T_DWALL);
  const rooms=[];
  const carve=(x,y,w,h)=>{
    for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)
      if(i>0&&j>0&&i<DUNW-1&&j<DUNW-1)tiles[i+j*DUNW]=T_STONE;
  };
  let ri=0;
  for(let a=0;a<10&&rooms.length<7;a++){
    const w=5+Math.floor(R(a*3)*5),h=5+Math.floor(R(a*3+1)*5);
    const x=2+Math.floor(R(a*3+2)*(DUNW-w-4)),y=2+Math.floor(R(a*3+7)*(DUNW-h-4));
    if(rooms.some(r=>x<r.x+r.w+2&&x+w>r.x-2&&y<r.y+r.h+2&&y+h>r.y-2))continue;
    carve(x,y,w,h);
    rooms.push({x,y,w,h,cx:x+(w>>1),cy:y+(h>>1)});
  }
  for(let i=1;i<rooms.length;i++){
    const a=rooms[i-1],b=rooms[i];
    const x0=Math.min(a.cx,b.cx),x1=Math.max(a.cx,b.cx);
    const y0=Math.min(a.cy,b.cy),y1=Math.max(a.cy,b.cy);
    carve(x0,a.cy-1,x1-x0+2,2);
    carve(b.cx-1,y0,2,y1-y0+2);
  }
  const px=t=>t*TILE+12;
  const entry=rooms[0],last=rooms[rooms.length-1];
  const props=[],enemies=[];
  props.push({t:'stairsU',x:px(entry.cx),y:px(entry.cy)-20,r:12,id:'su'});
  const isBoss=depth>=3;
  if(isBoss){
    props.push({t:'chest',x:px(last.cx),y:px(last.cy)-40,r:9,id:'dc'+seed+'_'+depth+'h',dun:1});
  }else{
    props.push({t:'stairsD',x:px(last.cx),y:px(last.cy),r:12,id:'sd'});
  }
  let urnN=0,goldN=0,torchN=0,chestN=0;
  rooms.forEach((r,i)=>{
    props.push({t:'torch',x:px(r.x)+6,y:px(r.y)+6,id:'t'+(torchN++)});
    props.push({t:'torch',x:px(r.x+r.w-1)+6,y:px(r.y)+6,id:'t'+(torchN++)});
    for(let u=0;u<2;u++)
      if(R(i*23+u)<.7)props.push({t:'urn',x:px(r.x+1+Math.floor(R(i*29+u)*(r.w-2))),
        y:px(r.y+1+Math.floor(R(i*31+u)*(r.h-2))),r:6,id:'u'+seed+'_'+depth+'_'+(urnN++)});
    if(R(i*37)<.5)props.push({t:'gold',x:px(r.cx+1),y:px(r.cy+1),
      id:'g'+seed+'_'+depth+'_'+(goldN++)});
    if(i>0&&chestN<2&&R(i*41)<.3){chestN++;
      props.push({t:'chest',x:px(r.cx)-20,y:px(r.cy),r:9,id:'dc'+seed+'_'+depth+'_'+i,dun:1});}
  });
  const D={seed,depth,poi,tiles,rooms,props,
    entry:{x:px(entry.cx),y:px(entry.cy)+16},
    surfX:poi.tx*TILE+12,surfY:poi.ty*TILE+44,
    pending:[],boss:null};
  const far=hyp(poi.tx-SP.spawn.tx,poi.ty-SP.spawn.ty)/60;
  const pow=depth+far;
  const pool=pow<2?['skel','blob','bandit']:(pow<3.5?['skel','bandit','archer','wisp']:['skel','brute','archer','wisp','bandit']);
  const champRoom=1+Math.floor(R(555)*(rooms.length-1));
  rooms.forEach((r,i)=>{
    if(i===0)return;
    if(isBoss&&i===rooms.length-1){
      const butcher=R(666)<.25;
      D.pending.push({t:'warden',x:px(r.cx),y:px(r.cy),o:{
        dunBoss:1,wname:butcher?'The Butcher':'The Barrow King',
        butcher,ax:px(r.cx),ay:px(r.cy),
        hpMul:.6+depth*.25+far*.15}});
      return;
    }
    const n=2+Math.floor(R(i*47)*2);
    for(let e2=0;e2<n;e2++){
      const t=pool[Math.floor(R(i*53+e2)*pool.length)];
      D.pending.push({t,
        x:px(r.x+1+Math.floor(R(i*59+e2)*(r.w-2))),
        y:px(r.y+1+Math.floor(R(i*61+e2)*(r.h-2))),
        o:{aggro:false,dunMul:1+(depth-1)*.25,
           elite:(i===champRoom&&e2===0)?1:0}});
    }
  });
  return D;
}
function spawnDunEnts(){
  for(const s of G.dun.pending){
    const e=mkE(s.t,s.x,s.y,s.o);
    if(s.o.dunMul){e.hp=Math.round(e.hp*s.o.dunMul);e.mhp=e.hp;}
    if(s.o.hpMul){e.hp=Math.round(e.hp*s.o.hpMul);e.mhp=e.hp;}
    if(s.o.butcher){e.spd=140;e.r=14;}
  }
  G.dun.pending=[];
}
function enterDun(prop){
  const poi=POIS.find(p=>p.id===prop.id)||{tx:Math.floor(prop.x/TILE),ty:Math.floor(prop.y/TILE)};
  sfx('gate');
  fadeOut(()=>{
    G.dunRun++;
    if(G.p.mount)dismount();
    G.p.fish=null;G.p.aim=false;
    G.ents=G.ents.filter(e=>e.t==='ally');
    G.pr=[];G.drops=[];G.boss=null;
    G.inDun=true;
    G.dun=genDun(hashi(poi.tx,poi.ty,NS+G.dunRun*29),1,poi);
    spawnDunEnts();
    G.p.x=G.dun.entry.x;G.p.y=G.dun.entry.y;
    G.cam.x=G.p.x;G.cam.y=G.p.y;G.lum.x=G.p.x;G.lum.y=G.p.y-30;
    G.lastSafe={x:G.dun.surfX,y:G.dun.surfY};
    ensureTeam();
    toast('The Barrow — depth 1. The dark is hungry; torches are honest.');
    if(!flag('tip:delve')){setFlag('tip:delve');
      startDlg([{n:'Lumen',t:'A barrow! Old dark, old bones, old TREASURE. Break the urns, mind the champions, and find the stairs — three floors down, something is beating like a heart.'}]);}
    fadeIn(600);
  },400);
}
function descendDun(){
  const D=G.dun;
  sfx('gate');
  fadeOut(()=>{
    G.ents=G.ents.filter(e=>e.t==='ally');
    G.pr=[];G.drops=[];G.boss=null;
    G.dun=genDun(D.seed,D.depth+1,D.poi);
    spawnDunEnts();
    G.p.x=G.dun.entry.x;G.p.y=G.dun.entry.y;
    G.cam.x=G.p.x;G.cam.y=G.p.y;
    ensureTeam();
    toast('Depth '+G.dun.depth+(G.dun.depth>=3?' — something is here.':' — the loot grows bolder.'));
    fadeIn(500);
  },380);
}
function ascendDun(){
  const D=G.dun;
  sfx('gate');
  fadeOut(()=>{
    G.ents=G.ents.filter(e=>e.t==='ally');
    G.pr=[];G.drops=[];G.boss=null;
    G.dun=genDun(D.seed,D.depth-1,D.poi);
    spawnDunEnts();
    G.p.x=G.dun.entry.x;G.p.y=G.dun.entry.y;
    G.cam.x=G.p.x;G.cam.y=G.p.y;
    ensureTeam();
    toast('Depth '+G.dun.depth);
    fadeIn(500);
  },380);
}
function exitDun(){
  const D=G.dun;
  sfx('travel');
  fadeOut(()=>{
    G.inDun=false;G.dun=null;
    G.ents=G.ents.filter(e=>e.t==='ally'||e.t==='npc');
    G.pr=[];G.boss=null;
    G.p.x=D.surfX;G.p.y=D.surfY;
    G.cam.x=G.p.x;G.cam.y=G.p.y;G.lum.x=G.p.x;G.lum.y=G.p.y-30;
    ensureTeam();
    toast('Daylight. You keep everything you carried out.');
    autosave();
    fadeIn(600);
  },400);
}
function dunBossDown(e){
  G.boss=null;
  sfx('orb');G.shake=8;
  spawnP(e.x,e.y,'#ffd66e',30,160,1.1,3,true);
  const far=hyp(e.x-SP.spawn.tx*TILE,e.y-SP.spawn.ty*TILE)/TILE;
  const i=rollInst(pick(areaWpnPool(e.x,e.y)),3);
  if(!i.uniq&&Math.random()<.5){const q=pick(UNIQ);i.uniq=q.n;i.k=q.base;i.pre=q.pre;i.suf=q.suf;i.rar=3;}
  addDropInst(e.x,e.y-10,i);
  for(let c=0;c<14;c++)addDrop(e.x,e.y,'coin');
  addDrop(e.x-12,e.y,'pot:hp');addDrop(e.x+12,e.y,'pot:hp');
  G.scrolls++;
  toast((e.wname||'The boss')+' falls — its hoard is yours (+1 Return Scroll)');
  G.dun.props.push({t:'portal',x:e.x,y:e.y+40,out:1,id:'bp'});
  addXP('blades',30);
}
/* ---- return scrolls: a portal home and back ---- */
function useScroll(){
  if(G.scrolls<1){sfx('err');toast('No Return Scrolls — merchants sell them');return false;}
  G.scrolls--;
  const ox=G.inDun&&G.dun?G.dun.surfX:G.p.x,
        oy=G.inDun&&G.dun?G.dun.surfY:G.p.y;
  let best=null,bd=1e9;
  for(const v of SP.vils){
    if(!flag('seen:v'+v.vi))continue;
    const d=hyp(v.tx*TILE-ox,v.ty*TILE-oy);
    if(d<bd){bd=d;best=v;}
  }
  if(!best)best=SP.vils[0];
  G.portal={ax:G.p.x,ay:G.p.y,aDun:G.inDun,dun:G.inDun?G.dun:null,
    bx:best.tx*TILE+12,by:best.ty*TILE+80};
  sfx('cast');ringP(G.p.x,G.p.y,'#9fd8ff');
  const wasDun=G.inDun;
  fadeOut(()=>{
    if(wasDun){G.inDun=false;G.ents=G.ents.filter(e=>e.t==='ally'||e.t==='npc');G.boss=null;}
    G.p.x=G.portal.bx;G.p.y=G.portal.by;
    G.cam.x=G.p.x;G.cam.y=G.p.y;G.lum.x=G.p.x;G.lum.y=G.p.y-30;
    ensureTeam();
    toast('The portal hums behind you — it will hold until you rest');
    fadeIn(500);
  },380);
  return true;
}
function enterPortal(side){
  const P=G.portal;if(!P)return;
  sfx('travel');
  fadeOut(()=>{
    if(side==='b'){ /* village → back to where the scroll was read */
      if(P.aDun&&P.dun){G.inDun=true;G.dun=P.dun;
        G.ents=G.ents.filter(e=>e.t==='ally');}
      G.p.x=P.ax;G.p.y=P.ay;
    }else{
      if(G.inDun){G.inDun=false;G.ents=G.ents.filter(e=>e.t==='ally'||e.t==='npc');G.boss=null;}
      G.p.x=P.bx;G.p.y=P.by;
    }
    G.cam.x=G.p.x;G.cam.y=G.p.y;G.lum.x=G.p.x;G.lum.y=G.p.y-30;
    ensureTeam();
    fadeIn(450);
  },350);
}
/* ---- quick potions ---- */
function usePotion(){
  const p=G.p;
  if(G.pot.hp>0&&p.hp<totHp()){
    G.pot.hp--;p.hp=Math.min(totHp(),p.hp+10);
    sfx('heal');spawnP(p.x,p.y-6,'#e05b4b',10,80,.6,2,true);
    addFt(p.x,p.y-22,'+♥','#e86a6a');
  }else if(G.pot.mp>0&&G.spells.length&&G.mana<maxMana()-5){
    G.pot.mp--;G.mana=Math.min(maxMana(),G.mana+40);
    sfx('heal');spawnP(p.x,p.y-6,'#6db8f0',10,80,.6,2,true);
    addFt(p.x,p.y-22,'+✦','#9fd8ff');
  }else{sfx('err');addFt(p.x,p.y-22,G.pot.hp?'Already hale':'No potions','#f2e9d8');}
  refreshButtons();
}
/* ---- darkness + torchlight: the dungeon render pass ---- */
function drawDun(){
  const hw=VW/2/ZM+TILE,hh=VH/2/ZM+TILE;
  const t0x=clamp(Math.floor((G.cam.x-hw)/TILE),0,DUNW-1),
        t1x=clamp(Math.floor((G.cam.x+hw)/TILE),0,DUNW-1),
        t0y=clamp(Math.floor((G.cam.y-hh)/TILE),0,DUNW-1),
        t1y=clamp(Math.floor((G.cam.y+hh)/TILE),0,DUNW-1);
  for(let ty=t0y;ty<=t1y;ty++)for(let tx=t0x;tx<=t1x;tx++){
    const t=dunTileAt(tx,ty);
    const v=hashi(tx,ty,G.dun.seed)%3;
    ctx.drawImage(G.atlas,(t*3+v)*ACELL,0,ACELL,ACELL,tx*TILE,ty*TILE,TILE,TILE);
  }
}
let lightCv=null,lightG=null;
function dunLight(){
  /* darkness lives on its own layer — holes are punched there, then the
     layer drapes over the scene, so light actually reveals the world */
  if(!lightCv){lightCv=document.createElement('canvas');lightG=lightCv.getContext('2d');}
  if(lightCv.width!==cv.width||lightCv.height!==cv.height){
    lightCv.width=cv.width;lightCv.height=cv.height;}
  const g=lightG;
  const w2s=(x,y)=>({x:(x-G.cam.x)*ZM+VW/2,y:(y-G.cam.y)*ZM+VH/2});
  g.setTransform(DPR,0,0,DPR,0,0);
  g.clearRect(0,0,VW,VH);
  g.fillStyle='rgba(4,3,8,.88)';
  g.fillRect(0,0,VW,VH);
  g.globalCompositeOperation='destination-out';
  const hole=(x,y,r,a)=>{
    const gr=g.createRadialGradient(x,y,r*.12,x,y,r);
    gr.addColorStop(0,'rgba(0,0,0,'+a+')');
    gr.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=gr;
    g.beginPath();g.arc(x,y,r,0,TAU);g.fill();
  };
  const pp=w2s(G.p.x,G.p.y);
  hole(pp.x,pp.y-8,180*ZM,1);
  const glows=[];
  for(const pr of G.dun.props){
    if(pr.t!=='torch'&&pr.t!=='portal'&&pr.t!=='stairsU'&&pr.t!=='stairsD')continue;
    const s=w2s(pr.x,pr.y);
    if(s.x<-90||s.y<-90||s.x>VW+90||s.y>VH+90)continue;
    hole(s.x,s.y,(pr.t==='torch'?(70+Math.sin(G.vt*8+pr.x)*7):58)*ZM,.95);
    if(pr.t==='torch')glows.push(s);
  }
  ctx.save();
  ctx.drawImage(lightCv,0,0,lightCv.width,lightCv.height,0,0,VW,VH);
  /* warm breath around live flames */
  ctx.globalCompositeOperation='lighter';
  for(const s of glows){
    const gr=ctx.createRadialGradient(s.x,s.y,4,s.x,s.y,54*ZM);
    gr.addColorStop(0,'rgba(232,137,74,.16)');
    gr.addColorStop(1,'rgba(232,137,74,0)');
    ctx.fillStyle=gr;
    ctx.beginPath();ctx.arc(s.x,s.y,54*ZM,0,TAU);ctx.fill();
  }
  ctx.restore();
}
/* the dungeon floor plan replaces the world map while below */
function renderDunMap(){
  const mc=$('mapcv');
  const size=Math.min(VW*.92,VH-150);
  mc.width=Math.round(size*DPR);mc.height=Math.round(size*DPR);
  mc.style.width=size+'px';mc.style.height=size+'px';
  const g=mc.getContext('2d');
  g.setTransform(DPR,0,0,DPR,0,0);
  g.fillStyle='#0c0a10';g.fillRect(0,0,size,size);
  const cs=size/DUNW;
  for(let y=0;y<DUNW;y++)for(let x=0;x<DUNW;x++){
    if(dunTileAt(x,y)===T_STONE){
      g.fillStyle='#4a4152';
      g.fillRect(x*cs,y*cs,cs+.5,cs+.5);
    }
  }
  for(const pr of G.dun.props){
    const x=pr.x/(DUNW*TILE)*size,y=pr.y/(DUNW*TILE)*size;
    if(pr.t==='stairsD'){g.fillStyle='#ffd66e';g.fillRect(x-3,y-3,6,6);}
    else if(pr.t==='stairsU'){g.fillStyle='#9fd8ff';g.fillRect(x-3,y-3,6,6);}
    else if(pr.t==='torch'){g.fillStyle='#e8894a';g.fillRect(x-1,y-1,2,2);}
  }
  const px=G.p.x/(DUNW*TILE)*size,py=G.p.y/(DUNW*TILE)*size;
  g.fillStyle='#fff';g.beginPath();g.arc(px,py,3.4,0,TAU);g.fill();
  g.fillStyle='rgba(242,233,216,.7)';
  g.font='700 11px -apple-system,system-ui,sans-serif';g.textAlign='center';
  g.fillText('THE BARROW — DEPTH '+G.dun.depth,size/2,14);
  G.mapNodes=[];
}
