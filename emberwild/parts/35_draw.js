/* ================= drawing: articulated rig, props, fx ================= */
function shadow(x,y,rx){
  ctx.fillStyle='rgba(20,16,12,.22)';
  ctx.beginPath();ctx.ellipse(x,y,rx,rx*.45,0,0,TAU);ctx.fill();
}
function rr(x,y,w,h,r,c){ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function dotc(x,y,r,c,a){if(a!==undefined)ctx.globalAlpha=a;ctx.fillStyle=c;
  ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();if(a!==undefined)ctx.globalAlpha=1;}
function limb(x,y,ang,len,w,c){
  ctx.save();ctx.translate(x,y);ctx.rotate(ang);
  ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(-w/2,-w/2,len+w,w,w/2);ctx.fill();
  ctx.restore();
}
/* weapon silhouettes, drawn along +x from the hand */
function drawWeapon(w,s,inst){
  if(!w||w.t==='fist')return;
  const glow=inst&&wDef(inst).tier>=3;
  if(glow){ctx.save();ctx.globalCompositeOperation='lighter';
    dotc(9*s,0,7*s,'rgba(255,179,92,.25)');ctx.restore();}
  switch(w.t){
    case'sword':
      rr(1.5*s,-2.6*s,1.6*s,5.2*s,.8*s,'#8a6b4a');
      rr(3*s,-1.1*s,15*s,2.2*s,[.4*s,1.1*s,1.1*s,.4*s],w.c);
      rr(3*s,-1.1*s,15*s,.8*s,.4*s,'rgba(255,255,255,.35)');
      break;
    case'dagger':
      rr(1.5*s,-1.8*s,1.4*s,3.6*s,.7*s,'#6f5638');
      rr(2.6*s,-.9*s,9*s,1.8*s,[.3*s,.9*s,.9*s,.3*s],w.c);
      break;
    case'axe':
      rr(0,-1*s,15*s,2*s,1*s,'#8a6b4a');
      ctx.fillStyle=w.c;
      ctx.beginPath();ctx.moveTo(11*s,-1.5*s);ctx.quadraticCurveTo(17*s,-6*s,18.5*s,0);
      ctx.quadraticCurveTo(17*s,4*s,11*s,1.5*s);ctx.closePath();ctx.fill();
      break;
    case'spear':
      rr(0,-.8*s,22*s,1.6*s,.8*s,'#8a6b4a');
      ctx.fillStyle=w.c;
      ctx.beginPath();ctx.moveTo(21*s,-2.4*s);ctx.lineTo(27*s,0);ctx.lineTo(21*s,2.4*s);ctx.closePath();ctx.fill();
      break;
    case'hammer':
      rr(0,-1*s,13*s,2*s,1*s,'#8a6b4a');
      rr(11*s,-4*s,6*s,8*s,1.4*s,w.c);
      rr(11*s,-4*s,6*s,2.6*s,1.2*s,'rgba(255,255,255,.25)');
      break;
  }
}
function drawBow(s,drawn){
  ctx.strokeStyle='#8a6b4a';ctx.lineWidth=2.2*s;
  ctx.beginPath();ctx.arc(9*s,0,8*s,-1.25,1.25);ctx.stroke();
  ctx.strokeStyle='#d8ccb4';ctx.lineWidth=1*s;
  const px=drawn?4*s:8*s;
  ctx.beginPath();
  ctx.moveTo(9*s+Math.cos(-1.25)*8*s,Math.sin(-1.25)*8*s);
  ctx.lineTo(px,0);
  ctx.lineTo(9*s+Math.cos(1.25)*8*s,Math.sin(1.25)*8*s);ctx.stroke();
  if(drawn)rr(px,-.9*s,12*s,1.8*s,.8*s,'#c9b48f');
}
/* the articulated body — adult proportions, 2-bone IK limbs, shaded volumes */
const _shadeCache=new Map();
function shade(c,f){
  const k=c+f;
  let v=_shadeCache.get(k);
  if(v)return v;
  const n=parseInt(c.slice(1),16);
  const r=clamp(Math.round(((n>>16)&255)*f),0,255),
        g2=clamp(Math.round(((n>>8)&255)*f),0,255),
        b=clamp(Math.round((n&255)*f),0,255);
  v='rgb('+r+','+g2+','+b+')';
  _shadeCache.set(k,v);
  return v;
}
/* shaded capsule segment: lit along its top edge, dark under */
function seg(x,y,ang,len,w,c){
  ctx.save();ctx.translate(x,y);ctx.rotate(ang);
  ctx.fillStyle=c;
  ctx.beginPath();ctx.roundRect(-w/2,-w/2,len+w,w,w/2);ctx.fill();
  ctx.fillStyle='rgba(0,0,0,.17)';
  ctx.beginPath();ctx.roundRect(-w/2,0,len+w,w/2,[0,0,w/2,w/2]);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.12)';
  ctx.beginPath();ctx.roundRect(-w/2,-w/2,len+w,w/3,[w/3,w/3,0,0]);ctx.fill();
  ctx.restore();
}
/* two-bone IK: shoulder/hip → target, joint bent to `side` */
function ik2(sx,sy,tx,ty,l1,l2,side){
  let dx=tx-sx,dy=ty-sy,d=hyp(dx,dy);
  d=clamp(d,Math.abs(l1-l2)+.05,l1+l2-.05);
  const base=Math.atan2(dy,dx);
  const off=Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1))*side;
  const a1=base+off;
  const mx=sx+Math.cos(a1)*l1,my=sy+Math.sin(a1)*l1;
  const a2=Math.atan2(sy+dy-my,sx+dx-mx);
  return{a1,a2,mx,my};
}
function drawLimb(sx,sy,tx,ty,l1,l2,w,c,side){
  const j=ik2(sx,sy,tx,ty,l1,l2,side);
  seg(sx,sy,j.a1,l1,w,c);
  seg(j.mx,j.my,j.a2,l2,w*.86,shade(c,.92));
  return j;
}
function rig(x,y,o){
  const s=o.size||1;
  const kid=s<.8;
  const arm=o.arm||null;
  const bodyC=o.flash?'#fff':(arm?arm.c:(o.body||'#3f8f8a'));
  const trimC=arm?arm.c2:(o.c2||shade(o.body||'#3f8f8a',.72));
  const skin=o.skin||'#e9bd93';
  const pants=o.pants||'#463527';
  const pose=o.pose||'idle';
  const pT=o.poseT||0;
  const face=o.face||0;
  const mdir=o.mdir!==undefined?o.mdir:face;
  const run=o.mv&&o.mvv>150;
  const ph=(o.anim||0)*2.6;
  const persp=.45;
  ctx.save();ctx.translate(x,y);
  if(pose==='down'){ctx.rotate(1.35);ctx.globalAlpha*=.85;}
  shadow(0,10.5*s,6.6*s);
  /* gait bob + lean into the run */
  const bobY=o.mv?-Math.abs(Math.cos(ph))*1.15*s:Math.sin(G.vt*1.7)*.35*s;
  const lean=o.mv?(run?1.9:1.0)*s:0;
  const lx=Math.cos(mdir)*lean,ly=Math.sin(mdir)*persp*lean;
  const gy=10*s;                       // ground line under hips
  const hipY=2.8*s+bobY*.45;
  const shY=-5.6*s+bobY,shX=4.3*s;
  const hy=shY-5.1*s-(kid?0.4*s:0);    // head center
  const headR=(kid?4.2:3.5)*s;
  /* ---- feet targets ---- */
  const stride=(o.mv?(run?5.4:3.7):0)*s;
  const dx=Math.cos(mdir),dy=Math.sin(mdir)*persp;
  let f1,f2,planted=false;
  if(pose==='ride'){f1=f2=null;}
  else if(pose==='climb'){
    const c1=Math.sin(ph),c2=Math.sin(ph+Math.PI);
    f1={x:-2.6*s,y:gy-2*s-c1*1.6*s};
    f2={x:2.6*s,y:gy-2*s-c2*1.6*s};
  }else if(o.mv){
    const sw1=Math.sin(ph),sw2=Math.sin(ph+Math.PI);
    const lift1=Math.max(0,Math.sin(ph+1.1))*2.4*s,
          lift2=Math.max(0,Math.sin(ph+Math.PI+1.1))*2.4*s;
    f1={x:-2.1*s+dx*stride*sw1,y:gy+dy*stride*sw1-lift1};
    f2={x:2.1*s+dx*stride*sw2,y:gy+dy*stride*sw2-lift2};
  }else if(pose==='swing'||pose==='over'||pose==='thrust'||pose==='spin'||pose==='aim'||pose==='cast'){
    planted=true; /* fighting stance: front foot toward the work */
    f1={x:Math.cos(face)*3.6*s-1.4*s,y:gy+Math.sin(face)*persp*3.6*s};
    f2={x:-Math.cos(face)*2.8*s+1.4*s,y:gy-Math.sin(face)*persp*2.8*s};
  }else{
    f1={x:-2.7*s,y:gy};
    f2={x:2.7*s,y:gy+.4*s};
  }
  /* ---- legs (hip→knee→foot) + boots ---- */
  if(f1){
    drawLimb(-2.1*s,hipY,f1.x,f1.y,4.8*s,4.8*s,2.7*s,pants,-1);
    drawLimb(2.1*s,hipY,f2.x,f2.y,4.8*s,4.8*s,2.7*s,pants,1);
    const bootA1=o.mv?Math.atan2(dy,dx)*0:0,boot='#2e241b';
    for(const f of[f1,f2]){
      ctx.save();ctx.translate(f.x,f.y);ctx.rotate(o.mv?Math.atan2(Math.sin(mdir)*persp,Math.cos(mdir))*.5:0);
      ctx.fillStyle=boot;
      ctx.beginPath();ctx.roundRect(-1.9*s,-1.2*s,4.2*s,2.5*s,1.1*s);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.09)';
      ctx.beginPath();ctx.roundRect(-1.9*s,-1.2*s,4.2*s,1*s,1.1*s);ctx.fill();
      ctx.restore();
    }
  }
  /* ---- arm targets by pose ---- */
  const pol=(cx,cy,a,r2)=>({x:cx+Math.cos(a)*r2,y:cy+Math.sin(a)*r2*(pose==='swing'||pose==='spin'?.8:.9)});
  const S1={x:shX+lx,y:shY+ly},S2={x:-shX+lx,y:shY+ly};
  let T1,T2,wAng=null,offAng=null;
  const swing1=Math.sin(ph+Math.PI)* (o.mv?1:0.15),swing2=Math.sin(ph)*(o.mv?1:0.15);
  if(pose==='swing'){
    const dir=o.swingDir||1;
    const wind=Math.min(1,pT/.3);
    const strike=pT<.3?0:smw((pT-.3)/.7);
    wAng=face+dir*(-2.1+strike*3.9)-(1-wind)*dir*.4;
    T1=pol(S1.x,S1.y,wAng,10.5*s);
    T2=pol(S2.x,S2.y,face+Math.PI*.85,5.5*s);
  }else if(pose==='thrust'){
    const strike=pT<.3?-(pT/.3)*.35:smw((pT-.3)/.7);
    wAng=face;
    T1=pol(S1.x,S1.y,face,(4.5+strike*8.5)*s);
    T2=pol(S2.x,S2.y,face+Math.PI-.5,5*s);
  }else if(pose==='over'){
    const up=pT<.35?smw(pT/.35):1;
    const slam=pT<.35?0:smw((pT-.35)/.65);
    wAng=face-1.9*up+slam*2.7;
    T1={x:S1.x+Math.cos(face)*3*s,y:S1.y-8*s*up+slam*11*s};
    T2=pol(S2.x,S2.y,face+Math.PI*.8,5*s);
  }else if(pose==='spin'){
    wAng=face;
    T1=pol(S1.x,S1.y,face,10.5*s);
    T2=pol(S2.x,S2.y,face+Math.PI,8.5*s);
  }else if(pose==='aim'){
    T1=pol(S1.x,S1.y,face,9.5*s);
    T2=pol(S1.x,S1.y,face,3.4*s);
  }else if(pose==='cast'){
    wAng=face;
    T1={x:S1.x+Math.cos(face)*8.5*s,y:S1.y+Math.sin(face)*persp*8.5*s-2*s-pT*2*s};
    T2=pol(S2.x,S2.y,face+Math.PI-.6,5*s);
  }else if(pose==='climb'){
    T1={x:3.4*s,y:hy-3*s-Math.sin(ph)*1.8*s};
    T2={x:-3.4*s,y:hy-3*s-Math.sin(ph+Math.PI)*1.8*s};
  }else if(pose==='ride'){
    T1={x:Math.cos(face)*5.5*s+1.5*s,y:0};
    T2={x:Math.cos(face)*5.5*s-1.5*s,y:0};
  }else if(pose==='fish'){
    wAng=face;
    T1=pol(S1.x,S1.y,face,8.5*s);
    T2={x:-shX*.9,y:hipY+2.5*s};
  }else{ /* idle & walk: arms hang, counter-swinging with knees bent slightly */
    T1={x:shX+1.2*s+dx*swing1*2.6*s,y:hipY+4.6*s+dy*swing1*2.6*s+Math.sin(G.vt*1.7)*.2*s};
    T2={x:-shX-1.2*s+dx*swing2*2.6*s,y:hipY+4.6*s+dy*swing2*2.6*s+Math.sin(G.vt*1.7+1)*.2*s};
  }
  /* ---- back arm behind torso ---- */
  const j2=drawLimb(S2.x,S2.y,T2.x,T2.y,4.4*s,4.4*s,2.5*s,bodyC,1);
  dotc(T2.x,T2.y,1.5*s,skin);
  if(pose==='aim'){/* string hand — drawn over bow later */}
  else if(o.wOff&&(pose==='idle'||pose==='swing'||pose==='spin')){
    ctx.save();ctx.translate(T2.x,T2.y);
    ctx.rotate(pose==='idle'?Math.PI/2+.5:j2.a2+.4);
    drawWeapon(wDef(o.wOff),s*.88,o.wOff);ctx.restore();
  }
  /* ---- torso: broad shoulders tapering to the hips ---- */
  ctx.beginPath();
  ctx.moveTo(-4.9*s+lx,shY+ly);
  ctx.quadraticCurveTo(-5.5*s,(shY+hipY)/2,-3.5*s,hipY+2.4*s);
  ctx.lineTo(3.5*s,hipY+2.4*s);
  ctx.quadraticCurveTo(5.5*s,(shY+hipY)/2,4.9*s+lx,shY+ly);
  ctx.quadraticCurveTo(lx,shY-2.6*s+ly,-4.9*s+lx,shY+ly);
  ctx.closePath();
  ctx.fillStyle=bodyC;ctx.fill();
  ctx.save();ctx.clip();
  const tg=ctx.createLinearGradient(0,shY-2*s,0,hipY+3*s);
  tg.addColorStop(0,'rgba(255,255,255,.13)');
  tg.addColorStop(.45,'rgba(0,0,0,0)');
  tg.addColorStop(1,'rgba(0,0,0,.22)');
  ctx.fillStyle=tg;ctx.fillRect(-6*s,shY-3*s,12*s,14*s);
  ctx.restore();
  if(arm){
    if(arm.def===1){
      ctx.strokeStyle=trimC;ctx.lineWidth=1.7*s;
      ctx.beginPath();ctx.moveTo(-4.4*s+lx,shY+ly-.5*s);ctx.lineTo(3.8*s,hipY+1.6*s);ctx.stroke();
    }else if(arm.def===2){
      for(let ry=0;ry<3;ry++)for(let rx=0;rx<3;rx++)
        dotc((-2.6+rx*2.6)*s,shY+(1.6+ry*2.6)*s,.62*s,trimC);
    }else if(arm.def>=3){
      ctx.strokeStyle=trimC;ctx.lineWidth=1*s;
      ctx.beginPath();ctx.moveTo(lx,shY-1.5*s);ctx.lineTo(0,hipY+2*s);ctx.stroke();
    }
  }
  if(o.apron){
    ctx.fillStyle=o.apron;
    ctx.beginPath();ctx.moveTo(-2.8*s,shY+2*s);ctx.lineTo(2.8*s,shY+2*s);
    ctx.lineTo(3.2*s,hipY+2.2*s);ctx.lineTo(-3.2*s,hipY+2.2*s);ctx.closePath();ctx.fill();
  }
  /* belt */
  ctx.fillStyle='rgba(24,18,13,.55)';
  ctx.beginPath();ctx.roundRect(-3.7*s,hipY-.4*s,7.4*s,1.7*s,.8*s);ctx.fill();
  dotc(0,hipY+.45*s,.7*s,'#c9a86a');
  /* pauldrons over the shoulder line */
  if(arm&&arm.def>=3){
    for(const px2 of[-1,1]){
      ctx.save();ctx.translate(px2*4.6*s+lx,shY+ly-.6*s);ctx.rotate(px2*.22);
      ctx.fillStyle=trimC;
      ctx.beginPath();ctx.roundRect(-2.4*s,-1.6*s,4.8*s,3.4*s,1.5*s);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.16)';
      ctx.beginPath();ctx.roundRect(-2.4*s,-1.6*s,4.8*s,1.4*s,1.2*s);ctx.fill();
      ctx.restore();
    }
  }
  /* scarf at the neck, trailing */
  if(o.scarf){
    const sa=face+Math.PI;
    ctx.save();ctx.translate(Math.cos(sa)*3.5*s+lx,shY+ly-1*s);
    ctx.rotate(sa+Math.sin(G.vt*6)*.18);
    ctx.fillStyle='#e8894a';
    ctx.beginPath();ctx.roundRect(0,-1.7*s,(8+(o.mv?2.5:0))*s,3.4*s,1.7*s);ctx.fill();
    ctx.fillStyle='rgba(0,0,0,.15)';
    ctx.beginPath();ctx.roundRect(0,0,(8+(o.mv?2.5:0))*s,1.7*s,1.7*s);ctx.fill();
    ctx.restore();
  }
  /* neck + head */
  seg(lx,shY+ly-1.2*s,-Math.PI/2,1.6*s,2.2*s,shade(skin,.9));
  dotc(lx,hy+ly,headR,skin);
  ctx.save();
  ctx.beginPath();ctx.arc(lx,hy+ly,headR,0,TAU);ctx.clip();
  ctx.fillStyle='rgba(0,0,0,.16)';
  ctx.beginPath();ctx.arc(lx+headR*.35,hy+ly+headR*.4,headR,0,TAU);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.14)';
  ctx.beginPath();ctx.arc(lx-headR*.35,hy+ly-headR*.45,headR*.8,0,TAU);ctx.fill();
  ctx.restore();
  if(arm&&arm.helm){
    ctx.fillStyle=arm.c2;
    ctx.beginPath();ctx.arc(lx,hy+ly-.3*s,headR+.4*s,Math.PI*.93,Math.PI*2.07);ctx.fill();
    ctx.beginPath();ctx.roundRect(lx-headR-.4*s,hy+ly-1.2*s,(headR+.4*s)*2,1.9*s,.9*s);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.15)';
    ctx.beginPath();ctx.arc(lx-headR*.3,hy+ly-headR*.5,headR*.55,Math.PI,Math.PI*1.8);ctx.fill();
    if(arm.tier>=4){ctx.fillStyle='#e8894a';
      ctx.beginPath();ctx.moveTo(lx-.8*s,hy+ly-headR-1*s);ctx.lineTo(lx+.8*s,hy+ly-headR-1*s);
      ctx.lineTo(lx,hy+ly-headR-3.6*s);ctx.closePath();ctx.fill();}
  }else if(o.hood){
    ctx.fillStyle=o.hood;
    ctx.beginPath();ctx.arc(lx,hy+ly-.3*s,headR+.5*s,Math.PI*.92,Math.PI*2.08);ctx.fill();
    ctx.beginPath();ctx.roundRect(lx-headR-.5*s,hy+ly-.6*s,(headR+.5*s)*2,2*s,.9*s);ctx.fill();
    ctx.fillStyle='rgba(0,0,0,.2)';
    ctx.beginPath();ctx.roundRect(lx-headR-.5*s,hy+ly+.4*s,(headR+.5*s)*2,1*s,.5*s);ctx.fill();
  }else if(o.hat){
    ctx.fillStyle=o.hat;
    ctx.beginPath();ctx.roundRect(lx-headR-1.6*s,hy+ly-1.9*s,(headR+1.6*s)*2,1.9*s,.9*s);ctx.fill();
    ctx.beginPath();ctx.roundRect(lx-headR*.8,hy+ly-headR-2*s,headR*1.6,headR+.6*s,1.2*s);ctx.fill();
  }else{
    ctx.fillStyle=o.hair||'#4a3826';
    ctx.beginPath();ctx.arc(lx,hy+ly-.55*s,headR*.99,Math.PI*.83,Math.PI*2.17);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.1)';
    ctx.beginPath();ctx.arc(lx-headR*.3,hy+ly-headR*.55,headR*.5,Math.PI,Math.PI*1.9);ctx.fill();
  }
  const fx=Math.cos(face)*1.7*s,fy2=Math.sin(face)*1.1*s;
  dotc(lx+fx-1.35*s,hy+ly+.6*s+fy2,.6*s,'#241c16');
  dotc(lx+fx+1.35*s,hy+ly+.6*s+fy2,.6*s,'#241c16');
  if(o.glasses){ctx.strokeStyle='#241c16';ctx.lineWidth=.6*s;
    ctx.beginPath();ctx.arc(lx+fx-1.35*s,hy+ly+.6*s+fy2,1.3*s,0,TAU);
    ctx.arc(lx+fx+1.35*s,hy+ly+.6*s+fy2,1.3*s,0,TAU);ctx.stroke();}
  /* ---- front arm + weapon ---- */
  const j1=drawLimb(S1.x,S1.y,T1.x,T1.y,4.4*s,4.4*s,2.5*s,bodyC,-1);
  dotc(T1.x,T1.y,1.6*s,skin);
  if(pose==='aim'){
    ctx.save();ctx.translate(T1.x,T1.y);ctx.rotate(face);drawBow(s,true);ctx.restore();
    dotc(T2.x,T2.y,1.5*s,skin);
  }else if(pose==='cast'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    dotc(T1.x,T1.y,(3+pT*5)*s,(SPELLS[G.spellEq]?SPELLS[G.spellEq].c:'#ffb35c'));
    ctx.restore();
  }else if(pose==='fish'&&o.rodLine){
    ctx.save();ctx.translate(T1.x,T1.y);ctx.rotate(face);
    rr(0,-.6*s,15*s,1.2*s,.6*s,'#8a6b4a');ctx.restore();
    ctx.strokeStyle='rgba(242,233,216,.5)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(T1.x+Math.cos(face)*15*s,T1.y+Math.sin(face)*15*s);
    ctx.lineTo(o.rodLine.x-x,o.rodLine.y-y);ctx.stroke();
  }else if(o.wMain){
    ctx.save();ctx.translate(T1.x,T1.y);
    ctx.rotate(wAng!==null?wAng:(Math.PI/2+.55));
    drawWeapon(wDef(o.wMain),s,o.wMain);ctx.restore();
  }
  if((pose==='idle'||pose==='climb')&&o.backBow){
    ctx.save();ctx.translate(-1*s+lx,shY+ly-1*s);ctx.rotate(.9);
    ctx.strokeStyle='#8a6b4a';ctx.lineWidth=1.7*s;
    ctx.beginPath();ctx.arc(0,0,6.5*s,-.9,.9);ctx.stroke();ctx.restore();
  }
  ctx.restore();
}
const NPCLOOK={
  elder:{body:'#8d8577',hair:'#dfe6ea',skin:'#e8bd97'},
  boro:{body:'#6a4a38',apron:'#4a3b30',hair:'#3a2d22',skin:'#d9a878'},
  pip:{body:'#c9704a',hair:'#7a4a2d',size:.72},
  sella:{body:'#7a5c8f',hat:'#e8b04a'},
  wren:{body:'#4a6a8f',hair:'#8a6b4a',glasses:1},
  holt:{body:'#5d5448',hood:'#8a6b4a'},
  rhoa:{body:'#5c6a7a',hair:'#241c16',skin:'#c98d5f'},
  zef:{body:'#a8683a',hat:'#f2e9d8'},
  juno:{body:'#5d9950',hair:'#241c16',size:.72}};

function drawHorse(x,y,face,anim,rider){
  ctx.save();ctx.translate(x,y);
  shadow(0,10,13);
  const sp=rider?1:.3;
  const bob=Math.abs(Math.sin(anim*5.2))*1.6*sp;
  const dir=Math.cos(face)>=0?1:-1;
  ctx.scale(dir,1);
  ctx.translate(0,-bob);
  for(const[lx,ph]of[[-8,0],[-4,.5],[5,Math.PI],[9,Math.PI+.5]]){
    const a=Math.PI/2+Math.sin(anim*5.2+ph)*.55*sp;
    const kick=Math.max(0,Math.sin(anim*5.2+ph+1))* .3*sp;
    limb(lx,3,a-kick,7,3,'#6f4830');
  }
  rr(-13,-8,26,13,6,'#8a5b38');
  rr(-13,-8,26,5,4,'#9c6a44');
  ctx.fillStyle='rgba(0,0,0,.15)';
  ctx.beginPath();ctx.roundRect(-13,1,26,4,3);ctx.fill();
  const nk=Math.sin(anim*5.2)*.12*sp;
  limb(10,-6,-.9+nk,8,5,'#8a5b38');
  dotc(15.5,-13+nk*6,3.6,'#8a5b38');
  rr(14,-15.5+nk*6,6,3,1.4,'#9c6a44');
  ctx.fillStyle='#3a2d22';
  ctx.beginPath();ctx.moveTo(9,-12);ctx.quadraticCurveTo(13+nk*4,-16,16,-15+nk*6);ctx.lineTo(13,-9);ctx.closePath();ctx.fill();
  limb(-12,-5,2.4+Math.sin(anim*2.6)*.25,9,2.4,'#3a2d22');
  dotc(17,-13.6+nk*6,.8,'#241c16');
  rr(-4,-9,9,4,2,'#5a2d3a');
  ctx.restore();
}
function drawBoat(x,y,face,sail){
  ctx.save();ctx.translate(x,y);
  ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.ellipse(0,4,17+Math.sin(G.vt*3)*2,7,0,0,TAU);ctx.stroke();
  ctx.save();ctx.rotate(face);
  ctx.fillStyle='#6f4830';
  ctx.beginPath();ctx.moveTo(-14,-7);ctx.quadraticCurveTo(18,-9,22,0);
  ctx.quadraticCurveTo(18,9,-14,7);ctx.quadraticCurveTo(-18,0,-14,-7);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#5d3d28';ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(-13,-3);ctx.quadraticCurveTo(14,-4.5,19,0);
  ctx.moveTo(-13,3);ctx.quadraticCurveTo(14,4.5,19,0);ctx.stroke();
  ctx.restore();
  rr(-1.5,-26,3,26,1.4,'#8a6b4a');
  if(sail){
    ctx.fillStyle='#f2e9d8';
    ctx.beginPath();ctx.moveTo(1,-24);ctx.quadraticCurveTo(15+Math.sin(G.vt*2)*2,-16,1,-6);ctx.closePath();ctx.fill();
  }else{
    rr(-1,-24,10,3,1.4,'#e8dcc4');
  }
  ctx.restore();
}

function drawEnt(e){
  if(e.hidden)return;
  const fl=e.flash>0;
  ctx.save();
  if(e.frozen>0){ctx.globalAlpha*=.9;}
  if(fl){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.9;}
  const mv=hyp(e.vx,e.vy)>4;
  switch(e.t){
    case'npc':{
      if(e.vface===undefined)e.vface=e.face;
      e.vface+=angDiff(e.vface,e.face)*Math.min(1,(G.ldt||.016)*10);
      rig(e.x,e.y,Object.assign({face:e.vface,anim:e.anim,mv,
        mvv:hyp(e.vx,e.vy),mdir:mv?Math.atan2(e.vy,e.vx):e.vface},
        NPCLOOK[e.key]||{body:'#7a6a5a'}));
      break;}
    case'ally':{
      const m=G.team.find(m=>m.key===e.key);
      const a=ALLYDEF[e.key]||{};
      const look=Object.assign({},a.look||{});
      const pose=e.down?'down':(e.st==='windup'||e.st==='swing'?(e.cls==='hammer'?'over':'swing'):(e.st==='shoot'?'aim':'idle'));
      if(e.vface===undefined)e.vface=e.face;
      e.vface+=angDiff(e.vface,e.face)*Math.min(1,(G.ldt||.016)*11);
      rig(e.x,e.y,Object.assign(look,{face:e.vface,anim:e.anim,mv,
        mvv:hyp(e.vx,e.vy),mdir:mv?Math.atan2(e.vy,e.vx):e.vface,pose,
        poseT:e.st==='windup'?.2:(e.st==='swing'?.7:0),swingDir:1,
        arm:m&&m.a?aDef(m.a):null,
        wMain:(e.cls==='archer'||e.cls==='mage')?null:(m&&m.w?m.w:(a.w?mkInst(a.w):null))}));
      if(e.down){
        ctx.font='700 9px -apple-system,system-ui,sans-serif';ctx.textAlign='center';
        ctx.fillStyle='#e05b4b';ctx.fillText('HELP',e.x,e.y-22);
      }else if(e.cls==='mage'&&e.st==='shoot'){
        ctx.save();ctx.globalCompositeOperation='lighter';
        dotc(e.x+Math.cos(e.face)*12,e.y+Math.sin(e.face)*12,4,'rgba(255,179,92,.7)');ctx.restore();
      }
      break;}
    case'blob':{
      const sq=e.st==='hop'?1.25:1+Math.sin(e.anim*3)*.08;
      shadow(e.x,e.y+6,8);
      ctx.fillStyle=fl?'#fff':'#6db85f';
      ctx.beginPath();ctx.ellipse(e.x,e.y,9*(2-sq)*.9,8*sq,0,0,TAU);ctx.fill();
      ctx.fillStyle='#5aa04e';ctx.beginPath();ctx.ellipse(e.x,e.y+3,7*(2-sq)*.9,4*sq,0,0,TAU);ctx.fill();
      const a=angTo(e.x,e.y,G.p.x,G.p.y);
      dotc(e.x-2.6+Math.cos(a),e.y-3+Math.sin(a),2,'#fff');dotc(e.x+2.6+Math.cos(a),e.y-3+Math.sin(a),2,'#fff');
      dotc(e.x-2.6+Math.cos(a)*1.8,e.y-3+Math.sin(a)*1.4,.9,'#241c16');dotc(e.x+2.6+Math.cos(a)*1.8,e.y-3+Math.sin(a)*1.4,.9,'#241c16');
      break;}
    case'boar':{
      shadow(e.x,e.y+7,11);
      ctx.translate(e.x,e.y);ctx.rotate(e.face);
      const wu=e.st==='windup';
      rr(-11,-7,22,14,6,fl?'#fff':(wu?'#a05436':'#8a5b38'));
      rr(-12,-6,8,12,4,'#6f4830');
      rr(8,-4.5,7,9,3,'#9c6a44');
      ctx.fillStyle='#f2e9d8';
      ctx.beginPath();ctx.moveTo(12,-4);ctx.lineTo(16,-7);ctx.lineTo(13.5,-2.5);ctx.fill();
      ctx.beginPath();ctx.moveTo(12,4);ctx.lineTo(16,7);ctx.lineTo(13.5,2.5);ctx.fill();
      dotc(10,-2,1,'#241c16');dotc(10,2,1,'#241c16');
      break;}
    case'deer':{
      shadow(e.x,e.y+7,10);
      ctx.translate(e.x,e.y);
      const dir=Math.cos(e.face)>=0?1:-1;ctx.scale(dir,1);
      for(const[lx,ph]of[[-6,0],[-3,Math.PI],[4,Math.PI*.6],[7,Math.PI*1.6]])
        limb(lx,2,Math.PI/2+Math.sin(e.anim*6+ph)*(mv?.5:.05),6.5,2,'#b8905f');
      rr(-9,-7,18,10,5,fl?'#fff':'#c9a06a');
      limb(7,-6,-1.1,7,3.4,'#c9a06a');
      dotc(11,-13,3,'#c9a06a');
      ctx.strokeStyle='#8a6b4a';ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(10,-15.5);ctx.lineTo(8,-20);ctx.moveTo(9,-18);ctx.lineTo(6.5,-19);
      ctx.moveTo(12,-15.5);ctx.lineTo(14,-20);ctx.moveTo(13,-18);ctx.lineTo(15.5,-19);ctx.stroke();
      dotc(12.4,-13.6,.7,'#241c16');
      dotc(-9,-4,2,'#f2e9d8');
      break;}
    case'wolf':{
      shadow(e.x,e.y+6,10);
      ctx.translate(e.x,e.y);
      const dir=Math.cos(e.face)>=0?1:-1;ctx.scale(dir,1);
      for(const[lx,ph]of[[-6,0],[-3,Math.PI],[3,Math.PI*.5],[6,Math.PI*1.5]])
        limb(lx,2,Math.PI/2+Math.sin(e.anim*7+ph)*(mv?.5:.08),5.5,2.2,'#4a4440');
      rr(-9,-6,17,9,4,fl?'#fff':'#5d5448');
      limb(-9,-3,2.6+Math.sin(e.anim*3)*.2,8,2.2,'#4a4440');
      dotc(10,-8,3.4,'#5d5448');
      ctx.fillStyle='#5d5448';
      ctx.beginPath();ctx.moveTo(8,-11);ctx.lineTo(9.5,-14.5);ctx.lineTo(11,-11);ctx.fill();
      ctx.beginPath();ctx.moveTo(11.5,-11);ctx.lineTo(13,-14);ctx.lineTo(14,-10.5);ctx.fill();
      rr(10,-8,6,3,1.4,'#4a4440');
      dotc(11.5,-8.6,.9,e.st==='windup'?'#e05b4b':'#ffd66e');
      break;}
    case'bandit':case'brute':{
      const s=e.t==='brute'?1.35:1,wu=e.st==='windup';
      if(e.vface===undefined)e.vface=e.face;
      e.vface+=angDiff(e.vface,e.face)*Math.min(1,(G.ldt||.016)*11);
      rig(e.x,e.y,{face:(wu||e.st==='swing')?e.face:e.vface,anim:e.anim,mv,
        mvv:hyp(e.vx,e.vy),mdir:mv?Math.atan2(e.vy,e.vx):e.vface,size:s,
        body:fl?'#fff':(e.t==='brute'?'#4a3b45':'#6a4a38'),
        hood:wu?'#a05436':'#7a5c46',skin:'#c9976a',
        pose:(wu||e.st==='swing')?(e.t==='brute'?'over':'swing'):'idle',
        poseT:wu?clamp(1-e.tm/.6,0,.3):(e.st==='swing'?.75:0),
        swingDir:1,
        wMain:mkInst(e.t==='brute'?'hammer':'axe')});
      break;}
    case'archer':{
      if(e.vface===undefined)e.vface=e.face;
      e.vface+=angDiff(e.vface,e.face)*Math.min(1,(G.ldt||.016)*11);
      rig(e.x,e.y,{face:e.st==='aim'?e.face:e.vface,anim:e.anim,mv,
        mvv:hyp(e.vx,e.vy),mdir:mv?Math.atan2(e.vy,e.vx):e.vface,
        body:fl?'#fff':'#55603f',hood:'#5c6a46',skin:'#c9976a',
        pose:e.st==='aim'?'aim':'idle',backBow:e.st!=='aim'});
      if(e.st==='aim'){ctx.strokeStyle='rgba(255,100,80,'+(.3+.4*Math.sin(G.vt*12))+')';ctx.lineWidth=1;
        ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.face);
        ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(120,0);ctx.stroke();ctx.restore();}
      break;}
    case'skel':{
      shadow(e.x,e.y+7,7);
      ctx.translate(e.x,e.y);
      const rat=Math.sin(e.anim*6)*1.5;
      ctx.strokeStyle=fl?'#fff':'#dfe6ea';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-5,2+rat*.3);ctx.lineTo(5,2-rat*.3);
      ctx.moveTo(-4,5);ctx.lineTo(4,5);ctx.moveTo(0,-2);ctx.lineTo(0,7);ctx.stroke();
      limb(-3,-1,Math.PI/2+.6+rat*.1,5,1.8,'#dfe6ea');
      limb(3,-1,e.st==='windup'?angTo(e.x,e.y,G.p.x,G.p.y):Math.PI/2-.6-rat*.1,5,1.8,'#dfe6ea');
      dotc(0,-7+rat*.4,5,fl?'#fff':'#eef2f4');
      dotc(-1.8,-7.5,1.2,'#9fd8ff');dotc(1.8,-7.5,1.2,'#9fd8ff');
      break;}
    case'wisp':{
      const fk=1+Math.sin(G.vt*9+e.anim)*.15;
      ctx.globalCompositeOperation='lighter';
      dotc(e.x,e.y,10*fk,'rgba(109,74,133,.5)');
      dotc(e.x,e.y,6*fk,'#b78ad2');
      dotc(e.x,e.y-1,2.6,'#f2e9ff');
      if(e.st==='cast')dotc(e.x,e.y,13*fk,'rgba(183,138,210,.35)');
      break;}
    case'warden':{
      if(e.st==='chargeW'){ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.face);
        ctx.fillStyle='rgba(224,91,75,'+(.16+.12*Math.sin(G.vt*14))+')';
        ctx.fillRect(0,-14,300,28);ctx.restore();}
      if(e.st==='slamW'){ctx.strokeStyle='rgba(224,91,75,'+(.3+.25*Math.sin(G.vt*14))+')';
        ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,90,0,TAU);ctx.stroke();}
      if(e.st==='slam'){ctx.strokeStyle='rgba(255,179,92,.7)';ctx.lineWidth=6;
        ctx.beginPath();ctx.arc(e.x,e.y,e.slamR,0,TAU);ctx.stroke();}
      shadow(e.x,e.y+12,15);
      ctx.save();ctx.translate(e.x,e.y);
      rr(-13,-2,26,16,5,'#5a2d3a');
      rr(-11,-14,22,24,7,fl?'#fff':'#3a3f4a');
      rr(-13,-16,10,8,3,'#4a505c');rr(3,-16,10,8,3,'#4a505c');
      rr(-7,-24,14,12,4,fl?'#fff':'#2d323c');
      ctx.fillStyle=e.hp<e.mhp*.5?'#ff6a4a':'#ff9a4a';
      ctx.fillRect(-4,-20,8,2.4);
      ctx.save();ctx.rotate(e.face+(e.st==='slash'?Math.sin(e.tm*22)*1.5:-.7));
      rr(10,-3,26,6,2,'#c8d3dd');rr(8,-4.5,4,9,1.5,'#8a6b4a');
      ctx.restore();
      if(e.st==='stun'){for(let i=0;i<3;i++)dotc(Math.cos(G.vt*4+i*2.1)*10,-30,1.6,'#ffd66e');}
      ctx.restore();
      break;}
    case'king':{
      if(e.st==='chargeW'){ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.face);
        ctx.fillStyle='rgba(183,138,210,'+(.18+.12*Math.sin(G.vt*14))+')';
        ctx.fillRect(0,-15,320,30);ctx.restore();}
      if(e.st==='slamW'){ctx.strokeStyle='rgba(183,138,210,'+(.35+.25*Math.sin(G.vt*14))+')';
        ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,95,0,TAU);ctx.stroke();}
      if(e.st==='slam'){ctx.strokeStyle='rgba(183,138,210,.75)';ctx.lineWidth=6;
        ctx.beginPath();ctx.arc(e.x,e.y,e.slamR,0,TAU);ctx.stroke();}
      shadow(e.x,e.y+13,16);
      ctx.save();ctx.translate(e.x,e.y);
      ctx.globalCompositeOperation='lighter';
      dotc(0,-6,24+Math.sin(G.vt*3)*3,'rgba(109,74,133,.25)');
      ctx.globalCompositeOperation='source-over';
      ctx.fillStyle=fl?'#fff':'#2d2438';
      ctx.beginPath();ctx.moveTo(-13,14);ctx.lineTo(-9,-18);ctx.lineTo(9,-18);ctx.lineTo(13,14);
      ctx.lineTo(8,10);ctx.lineTo(4,15);ctx.lineTo(0,10);ctx.lineTo(-4,15);ctx.lineTo(-8,10);ctx.closePath();ctx.fill();
      dotc(0,-22,6.5,'#3a3145');
      dotc(-2.2,-22,1.4,e.p3?'#ff6a4a':'#b78ad2');dotc(2.2,-22,1.4,e.p3?'#ff6a4a':'#b78ad2');
      ctx.strokeStyle='#e8b04a';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-6,-27);ctx.lineTo(-6,-31);ctx.moveTo(0,-27);ctx.lineTo(0,-33);
      ctx.moveTo(6,-27);ctx.lineTo(6,-29);ctx.stroke();
      ctx.save();ctx.rotate(e.face+(e.st==='slash'?Math.sin(e.tm*22)*1.5:-.8));
      rr(11,-3,30,6,2,'#8f65ad');ctx.restore();
      ctx.restore();
      break;}
  }
  ctx.restore();
  if(e.frozen>0){
    ctx.save();ctx.globalAlpha=.5;
    ctx.fillStyle='#9fd8ff';
    ctx.beginPath();ctx.moveTo(e.x-6,e.y+4);ctx.lineTo(e.x-3,e.y-10);ctx.lineTo(e.x,e.y+4);ctx.fill();
    ctx.beginPath();ctx.moveTo(e.x+1,e.y+5);ctx.lineTo(e.x+4,e.y-7);ctx.lineTo(e.x+7,e.y+5);ctx.fill();
    ctx.restore();
  }
  if(e.elite&&!e.dead&&e.hp>0){
    const afc={swift:'#bfe3ff',molten:'#ff9a4a',frost:'#9fd8ff',vamp:'#e05b6e'}[e.eaf]||'#ffd66e';
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.5;
    ctx.strokeStyle=afc;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(e.x,e.y+e.r*.8,e.r+5,(e.r+5)*.4,0,0,TAU);ctx.stroke();
    ctx.restore();
    ctx.font='800 8px -apple-system,system-ui,sans-serif';ctx.textAlign='center';
    ctx.fillStyle=afc;
    ctx.fillText(((e.eaf||'').toUpperCase()+' FIERCE').trim(),e.x,e.y-e.r-16);
  }
  if((e.t==='warden'||e.t==='king')&&e.aggro&&e.hp>0){
    ctx.fillStyle='rgba(16,14,13,.6)';
    ctx.fillRect(e.x-20,e.y-e.r-22,40,4);
    ctx.fillStyle='#e05b4b';
    ctx.fillRect(e.x-20,e.y-e.r-22,40*clamp(e.hp/e.mhp,0,1),4);
  }else if(e.t!=='npc'&&e.t!=='ally'&&e.hp>0&&e.hp<e.mhp){
    ctx.fillStyle='rgba(16,14,13,.55)';
    ctx.fillRect(e.x-11,e.y-e.r-12,22,3);
    ctx.fillStyle='#8fce6a';
    ctx.fillRect(e.x-11,e.y-e.r-12,22*clamp(e.hp/e.mhp,0,1),3);
  }else if(e.t==='ally'&&!e.down){
    ctx.fillStyle='rgba(16,14,13,.55)';
    ctx.fillRect(e.x-11,e.y-e.r-13,22,3);
    ctx.fillStyle='#6db8f0';
    ctx.fillRect(e.x-11,e.y-e.r-13,22*clamp(e.hp/e.mhp,0,1),3);
  }
}

function drawPlayer(){
  const p=G.p;
  ctx.save();
  if(p.iv>0&&p.act!=='roll'&&Math.floor(G.vt*18)%2)ctx.globalAlpha=.45;
  if(p.mount==='horse'){
    drawHorse(p.x,p.y,p.face,p.anim,true);
    rig(p.x,p.y-13,{face:p.face,anim:p.anim,mv:0,pose:'ride',scarf:1,
      arm:eqArm()?aDef(eqArm()):null,size:.94});
    ctx.restore();return;
  }
  if(p.mount==='boat'){
    drawBoat(p.x,p.y+4,p.face,true);
    rig(p.x,p.y-6,{face:p.face,anim:p.anim,mv:0,pose:p.fish?'fish':'ride',scarf:1,
      rodLine:p.fish?{x:p.fish.x,y:p.fish.y}:null,
      arm:eqArm()?aDef(eqArm()):null,size:.94});
    ctx.restore();return;
  }
  if(p.flurry>0){ctx.save();ctx.translate(p.x,p.y);
    ctx.globalCompositeOperation='lighter';
    dotc(0,-2,16+Math.sin(G.vt*10)*2,'rgba(159,216,255,.18)');
    ctx.restore();}
  if(p.charged||p.chargeT>=.5){ctx.save();ctx.translate(p.x,p.y);
    ctx.globalCompositeOperation='lighter';
    dotc(0,-2,13+Math.sin(G.vt*12)*2,'rgba(255,179,92,.3)');
    ctx.restore();}
  if(p.swim){
    ctx.save();ctx.translate(p.x,p.y);
    ctx.strokeStyle='rgba(255,255,255,.4)';ctx.lineWidth=1.6;
    ctx.beginPath();ctx.ellipse(0,4,11+Math.sin(G.vt*5)*1.5,5,0,0,TAU);ctx.stroke();
    const bob=Math.sin(p.anim*2.2)*1;
    dotc(0,-4+bob,4.6,'#f2c9a0');
    ctx.fillStyle='#5a4630';ctx.beginPath();ctx.arc(0,-5+bob,4.4,Math.PI*.9,Math.PI*2.1);ctx.fill();
    rr(-5,-1+bob,10,5,2,eqArm()?aDef(eqArm()).c:'#3f8f8a');
    ctx.restore();ctx.restore();return;
  }
  if(p.act==='roll'){
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rollAng);
    ctx.globalAlpha*=.9;
    shadow(0,6,7);
    dotc(0,0,7.5,eqArm()?aDef(eqArm()).c:'#3f8f8a');
    ctx.strokeStyle='rgba(20,16,12,.4)';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,7.5,p.actT*22,p.actT*22+4);ctx.stroke();
    dotc(3,0,3,'#f2c9a0');
    ctx.restore();ctx.restore();return;
  }
  const wM=eqMain(),wO=eqOff();
  const active=(p.hand===1&&wO)?wO:wM;
  const wt=wDef(active).t;
  let pose='idle',pT=0,swingDir=1;
  if(p.act==='swing'){
    pT=clamp(p.actT/p.dur,0,1);
    pose=wt==='spear'?'thrust':((wt==='hammer'||wt==='axe')?'over':'swing');
    swingDir=(p.combo%2)?-1:1;
  }else if(p.act==='spin'){pose='spin';pT=clamp(p.actT/.5,0,1);}
  else if(p.act==='cast'){pose='cast';pT=clamp(p.actT/.3,0,1);}
  else if(p.aim){pose='aim';}
  else if(p.climb){pose='climb';}
  else if(p.fish){pose='fish';}
  /* weapon trail */
  if(p.act==='swing'&&pose==='swing'){
    const strike=pT<.3?0:smw((pT-.3)/.7);
    const a0=p.face+swingDir*(-2.0),a1=p.face+swingDir*(-2.0+strike*4.0);
    ctx.save();ctx.translate(p.x,p.y);
    ctx.strokeStyle='rgba(246,237,217,'+(.5*(1-pT))+')';
    ctx.lineWidth=10;ctx.beginPath();
    ctx.arc(0,-2,24+wDef(active).rc,Math.min(a0,a1),Math.max(a0,a1));ctx.stroke();
    ctx.restore();
  }else if(p.act==='swing'&&pose==='thrust'){
    const strike=pT<.3?0:smw((pT-.3)/.7);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.face);
    ctx.strokeStyle='rgba(246,237,217,'+(.45*(1-pT))+')';
    ctx.lineWidth=4;
    for(let i=0;i<3;i++){ctx.beginPath();
      ctx.moveTo(10+strike*10,-4+i*4);ctx.lineTo(26+strike*22,-4+i*4);ctx.stroke();}
    ctx.restore();
  }else if(p.act==='spin'){
    const swp=p.face+pT*TAU*1.15;
    ctx.save();ctx.translate(p.x,p.y);
    ctx.strokeStyle='rgba(255,214,110,'+(.55*(1-pT))+')';
    ctx.lineWidth=12;ctx.beginPath();ctx.arc(0,-2,27,swp-2.4,swp);ctx.stroke();
    ctx.restore();
  }
  const spinFace=p.act==='spin'?p.face+pT*TAU*1.15:p.face;
  rig(p.x,p.y,{
    face:pose==='spin'?spinFace:p.face,
    anim:p.anim,mv:p.mv>10,mvv:p.mv,
    mdir:p.mv>10?Math.atan2(p.vy,p.vx):p.face,
    pose,poseT:pT,swingDir,scarf:1,
    arm:eqArm()?aDef(eqArm()):null,
    wMain:(pose==='aim'||pose==='fish')?null:active,
    wOff:wO&&pose!=='aim'?((p.hand===1&&wO)?wM:wO):null,
    backBow:G.bow&&pose==='idle'&&!p.aim,
    rodLine:p.fish?{x:p.fish.x,y:p.fish.y}:null,
    hair:'#4a3826'});
  if(pose==='aim'){
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.aimAng);
    ctx.strokeStyle='rgba(246,237,217,.35)';ctx.lineWidth=1;
    ctx.setLineDash([4,6]);ctx.beginPath();ctx.moveTo(16,0);ctx.lineTo(150,0);ctx.stroke();ctx.setLineDash([]);
    ctx.restore();
  }
  if(p.fish&&p.fish.st){
    const b=p.fish;
    const bob2=Math.sin(G.vt*4)*1.5+(b.st==='bite'?Math.sin(G.vt*30)*3:0);
    dotc(b.x,b.y+bob2,3.2,'#e05b4b');
    dotc(b.x,b.y-2+bob2,2,'#f2e9d8');
    ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(b.x,b.y,7+Math.sin(G.vt*3)*2,0,TAU);ctx.stroke();
  }
  ctx.restore();
}
function drawLumen(){
  ctx.save();ctx.globalCompositeOperation='lighter';
  const pu=1+Math.sin(G.vt*5)*.12;
  dotc(G.lum.x,G.lum.y,8*pu,'rgba(255,214,110,.25)');
  dotc(G.lum.x,G.lum.y,4*pu,'rgba(255,214,110,.7)');
  dotc(G.lum.x,G.lum.y,1.8,'#fff6dd');
  ctx.restore();
}
function drawProp(p){
  const op=flag('op:'+p.id);
  switch(p.t){
    case'chest':{
      const locked=(p.camp&&!flag('camp:'+p.camp))||(p.ward&&!flag('warden:'+p.ward));
      shadow(p.x,p.y+6,9);
      if(!op&&!locked){ctx.save();ctx.globalCompositeOperation='lighter';
        dotc(p.x,p.y-2,11+Math.sin(G.vt*4)*2,'rgba(255,214,110,.14)');ctx.restore();}
      rr(p.x-9,p.y-6,18,12,3,op?'#6f4830':'#8a5b38');
      if(op){rr(p.x-9,p.y-13,18,6,2,'#5d3d28');rr(p.x-7,p.y-4,14,8,2,'#241c16');}
      else{rr(p.x-9,p.y-9,18,5,2,'#9c6a44');
        rr(p.x-1.6,p.y-7,3.2,8,1,locked?'#7a7468':'#e8b04a');}
      break;}
    case'tent':{shadow(p.x,p.y+8,13);
      ctx.fillStyle='#8a6b4a';
      ctx.beginPath();ctx.moveTo(p.x-14,p.y+8);ctx.lineTo(p.x,p.y-12);ctx.lineTo(p.x+14,p.y+8);ctx.closePath();ctx.fill();
      ctx.fillStyle='#3a2d22';
      ctx.beginPath();ctx.moveTo(p.x-5,p.y+8);ctx.lineTo(p.x,p.y-2);ctx.lineTo(p.x+5,p.y+8);ctx.closePath();ctx.fill();
      break;}
    case'fire':{
      ctx.strokeStyle='#5d4a38';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(p.x-7,p.y+3);ctx.lineTo(p.x+7,p.y-1);
      ctx.moveTo(p.x-7,p.y-1);ctx.lineTo(p.x+7,p.y+3);ctx.stroke();
      const f=Math.sin(G.vt*11+p.x)*.2+1;
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(p.x,p.y-2,16*f,'rgba(232,137,74,.14)');
      ctx.restore();
      ctx.fillStyle='#e8894a';
      ctx.beginPath();ctx.moveTo(p.x-5,p.y+1);ctx.quadraticCurveTo(p.x-4,p.y-8*f,p.x,p.y-10*f);
      ctx.quadraticCurveTo(p.x+4,p.y-8*f,p.x+5,p.y+1);ctx.closePath();ctx.fill();
      ctx.fillStyle='#ffd66e';
      ctx.beginPath();ctx.moveTo(p.x-2.5,p.y+1);ctx.quadraticCurveTo(p.x,p.y-5*f,p.x,p.y-6*f);
      ctx.quadraticCurveTo(p.x+2,p.y-4*f,p.x+2.5,p.y+1);ctx.closePath();ctx.fill();
      break;}
    case'shrine':{
      const done=flag('shrine:'+p.id);
      shadow(p.x,p.y+8,16);
      dotc(p.x,p.y,16,'#a8a29a');dotc(p.x,p.y,12,'#948e84');
      const c=done?'#9fd8ff':'#ffb35c';
      ctx.strokeStyle=c;ctx.lineWidth=2;ctx.setLineDash([5,7]);
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(G.vt*(done?.2:.6));
      ctx.beginPath();ctx.arc(0,0,14,0,TAU);ctx.stroke();ctx.restore();ctx.setLineDash([]);
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(p.x,p.y-6,5+Math.sin(G.vt*3)*1.2,done?'rgba(159,216,255,.5)':'rgba(255,179,92,.55)');
      ctx.restore();
      rr(p.x-3,p.y-12,6,10,2,'#7b7466');
      break;}
    case'tower':{
      const on=flag('tower:'+p.id);
      shadow(p.x,p.y+8,15);
      rr(p.x-13,p.y-4,26,12,3,'#948e84');
      rr(p.x-8,p.y-56,16,56,3,'#a8a29a');
      rr(p.x-8,p.y-56,5,56,2,'#bab4aa');
      rr(p.x-10,p.y-62,20,8,2,'#7b7466');
      const c=on?'#9fd8ff':'#ffb35c';
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(p.x,p.y-68,6+Math.sin(G.vt*3)*1.5,c);
      ctx.restore();
      ctx.fillStyle=c;
      ctx.beginPath();ctx.moveTo(p.x,p.y-74);ctx.lineTo(p.x+4,p.y-68);ctx.lineTo(p.x,p.y-62);ctx.lineTo(p.x-4,p.y-68);ctx.closePath();ctx.fill();
      break;}
    case'stone':{
      shadow(p.x,p.y+7,9);
      rr(p.x-6,p.y-16,12,24,4,'#7b7466');
      rr(p.x-6,p.y-16,4,24,3,'#8d8577');
      const read=flag('stone:'+p.id);
      ctx.strokeStyle=read?'#948e84':'#9fd8ff';ctx.lineWidth=1.4;
      ctx.beginPath();
      ctx.moveTo(p.x-2,p.y-10);ctx.lineTo(p.x+2,p.y-10);ctx.moveTo(p.x,p.y-10);ctx.lineTo(p.x,p.y-4);
      ctx.moveTo(p.x-2,p.y);ctx.lineTo(p.x+2,p.y+2);ctx.stroke();
      break;}
    case'statue':{
      shadow(p.x,p.y+7,10);
      ctx.fillStyle='#8d8577';
      ctx.beginPath();ctx.moveTo(p.x-8,p.y+6);ctx.lineTo(p.x-3,p.y-14);ctx.lineTo(p.x+3,p.y-14);ctx.lineTo(p.x+8,p.y+6);ctx.closePath();ctx.fill();
      dotc(p.x,p.y-15,4.5,'#7b7466');
      dotc(p.x,p.y+2,5,'#6a6458');
      if(G.orbs>0){ctx.save();ctx.globalCompositeOperation='lighter';
        dotc(p.x,p.y+1,3+Math.sin(G.vt*4),'rgba(159,216,255,.6)');ctx.restore();}
      break;}
    case'hut':{
      shadow(p.x,p.y+p.h/2+3,p.w/2);
      rr(p.x-p.w/2,p.y-p.h/2+6,p.w,p.h-6,3,'#8a6b4a');
      rr(p.x-p.w/2-3,p.y-p.h/2-8,p.w+6,p.h*.55,4,'#6a4a34');
      rr(p.x-p.w/2-3,p.y-p.h/2-8,p.w+6,4,2,'#7a5940');
      rr(p.x-5,p.y+p.h/2-12,10,12,2,'#3a2d22');
      const night=G.dayT>.7||G.dayT<.05;
      if(night){ctx.save();ctx.globalCompositeOperation='lighter';
        dotc(p.x-p.w/4,p.y,7,'rgba(255,214,110,.25)');ctx.restore();}
      ctx.fillStyle=night?'#ffd66e':'#5d4a38';
      ctx.fillRect(p.x-p.w/4-3,p.y-3,7,6);
      if(p.sale){
        if(!flag('home:'+p.vi)){
          rr(p.x+p.w/2-4,p.y+p.h/2-8,3,14,1,'#6f5638');
          rr(p.x+p.w/2-12,p.y+p.h/2-12,20,8,2,'#e8dcc4');
          ctx.fillStyle='#5d4a38';ctx.font='700 5px sans-serif';ctx.textAlign='center';
          ctx.fillText('SALE',p.x+p.w/2-2,p.y+p.h/2-6);
        }else{
          ctx.fillStyle='#e8894a';
          ctx.beginPath();ctx.moveTo(p.x,p.y-p.h/2-14);ctx.lineTo(p.x+8,p.y-p.h/2-10);ctx.lineTo(p.x,p.y-p.h/2-6);ctx.closePath();ctx.fill();
        }
      }
      break;}
    case'stall':{
      shadow(p.x,p.y+6,12);
      rr(p.x-12,p.y-2,24,8,2,'#8a6b4a');
      for(let i=0;i<4;i++)rr(p.x-12+i*6,p.y-14,6,5,1,i%2?'#e8894a':'#f2e9d8');
      rr(p.x-12,p.y-14,24,2,1,'#6a4a34');
      dotc(p.x-5,p.y-4,2.4,'#e05b4b');dotc(p.x+1,p.y-4,2.4,'#f2d24b');dotc(p.x+6,p.y-4,2.4,'#8fce6a');
      break;}
    case'stable':{
      shadow(p.x,p.y+8,16);
      ctx.strokeStyle='#8a6b4a';ctx.lineWidth=2.5;
      ctx.beginPath();
      ctx.moveTo(p.x-18,p.y+6);ctx.lineTo(p.x-18,p.y-8);
      ctx.moveTo(p.x,p.y+6);ctx.lineTo(p.x,p.y-8);
      ctx.moveTo(p.x+18,p.y+6);ctx.lineTo(p.x+18,p.y-8);
      ctx.moveTo(p.x-19,p.y-6);ctx.lineTo(p.x+19,p.y-6);
      ctx.moveTo(p.x-19,p.y+1);ctx.lineTo(p.x+19,p.y+1);ctx.stroke();
      rr(p.x-10,p.y+2,10,5,2,'#e8c86a');
      if(!G.horse)drawHorse(p.x+6,p.y-2,Math.PI,G.vt*.5,false);
      break;}
    case'forge':{
      shadow(p.x,p.y+6,10);
      rr(p.x-8,p.y-2,16,8,2,'#5d5750');
      rr(p.x-6,p.y-8,12,7,2,'#3a3f4a');
      rr(p.x+3,p.y-11,4,4,1,'#3a3f4a');
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(p.x-2,p.y-4,3+Math.sin(G.vt*9)*1,'rgba(255,150,60,.6)');ctx.restore();
      break;}
    case'dock':{
      shadow(p.x,p.y+8,14);
      rr(p.x-6,p.y-30,12,44,2,'#8a6b4a');
      for(let i=0;i<4;i++)rr(p.x-7,p.y-26+i*11,14,3,1,'#7a5940');
      dotc(p.x-7,p.y+12,2.4,'#6f5638');dotc(p.x+7,p.y+12,2.4,'#6f5638');
      dotc(p.x-7,p.y-28,2.4,'#6f5638');dotc(p.x+7,p.y-28,2.4,'#6f5638');
      if(!G.boat)drawBoat(p.x+26,p.y-14,0,false);
      break;}
    case'field':{
      const owned=flag('land:'+p.vi);
      for(let r2=0;r2<3;r2++){
        rr(p.x-22,p.y-14+r2*11,44,7,3,'#6f5638');
        for(let i2=0;i2<5;i2++){
          const gx=p.x-17+i2*9,gy=p.y-11+r2*11;
          if(owned&&G.flags['hv:'+p.vi]===G.dayN){dotc(gx,gy,1.4,'#8a6b4a');}
          else{dotc(gx,gy,2.2,'#79b855');dotc(gx,gy-2.6,1.6,owned?'#e8b04a':'#8cc463');}
        }
      }
      rr(p.x+24,p.y+2,2.6,12,1,'#6f5638');
      rr(p.x+18,p.y-2,14,7,1.4,'#e8dcc4');
      break;}
    case'pillar':{
      shadow(p.x,p.y+6,p.big?12:8);
      const h=p.big?34:20;
      rr(p.x-(p.big?8:6),p.y-h,(p.big?16:12),h+6,3,'#948e84');
      rr(p.x-(p.big?8:6),p.y-h,(p.big?5:4),h+6,2,'#a8a29a');
      rr(p.x-(p.big?10:8),p.y-h-4,(p.big?20:16),6,2,'#7b7466');
      break;}
    case'gate':{
      const open=flag('gateopen');
      shadow(p.x,p.y+10,26);
      if(open){
        rr(p.x-30,p.y-26,16,34,3,'#241c2e');rr(p.x+14,p.y-26,16,34,3,'#241c2e');
      }else{
        rr(p.x-24,p.y-30,48,40,4,'#241c2e');
        rr(p.x-24,p.y-30,48,5,2,'#382b45');
        for(let i=0;i<4;i++){
          const sx=p.x-15+i*10;
          dotc(sx,p.y-12,3.4,'#171221');
          if(i<G.shards){ctx.save();ctx.globalCompositeOperation='lighter';
            dotc(sx,p.y-12,3.2+Math.sin(G.vt*5+i)*.8,'rgba(255,179,92,.85)');ctx.restore();}
        }
      }
      break;}
    case'throne':{
      shadow(p.x,p.y+6,11);
      rr(p.x-10,p.y-22,20,26,3,'#4a3f5c');
      rr(p.x-13,p.y-4,26,8,2,'#5c5070');
      ctx.strokeStyle='#e8b04a';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(p.x-6,p.y-22);ctx.lineTo(p.x-6,p.y-27);
      ctx.moveTo(p.x,p.y-22);ctx.lineTo(p.x,p.y-29);ctx.moveTo(p.x+6,p.y-22);ctx.lineTo(p.x+6,p.y-27);ctx.stroke();
      break;}
    case'bigtree':case'ftree':{
      shadow(p.x,p.y+8,p.t==='bigtree'?16:11);
      const s=p.t==='bigtree'?1.6:1;
      rr(p.x-3*s,p.y-6*s,6*s,14*s,2,'#6b4a2e');
      const sw=Math.sin(G.vt*1.2+p.x*.1)*1.5;
      dotc(p.x+sw,p.y-16*s,13*s,'#2f6d3a');
      dotc(p.x-4*s+sw,p.y-20*s,9*s,'#3f8a4c');
      if(p.t==='ftree'&&fruitReady(p)){
        dotc(p.x-6+sw,p.y-14,2.2,'#e05b4b');dotc(p.x+5+sw,p.y-18,2.2,'#e05b4b');dotc(p.x+1+sw,p.y-10,2.2,'#e05b4b');}
      break;}
    case'doll':{
      if(flag('dollfound'))break;
      dotc(p.x,p.y,3.4,'#e8a0b8');dotc(p.x,p.y-4,2.6,'#f2c9a0');
      dotc(p.x-.9,p.y-4.3,.6,'#241c16');dotc(p.x+.9,p.y-4.3,.6,'#241c16');
      break;}
    case'bush':{
      if(G.cutBush.has(p.id)){dotc(p.x,p.y,3.5,'#6f5638');break;}
      shadow(p.x,p.y+5,8);
      dotc(p.x,p.y,8,'#4f9147');dotc(p.x-4,p.y-3,5,'#5aa04e');dotc(p.x+4,p.y-2,5.4,'#5aa04e');
      break;}
    case'boulder':{
      if(op){dotc(p.x,p.y,9,'#7b7466');dotc(p.x-4,p.y+2,4,'#6a6458');dotc(p.x+5,p.y-1,3,'#6a6458');break;}
      shadow(p.x,p.y+7,11);
      dotc(p.x,p.y-2,10,'#8d8577');dotc(p.x-3,p.y-5,6,'#9c968a');
      ctx.strokeStyle='#5d5750';ctx.lineWidth=1.6;
      ctx.beginPath();ctx.moveTo(p.x-4,p.y-8);ctx.lineTo(p.x+1,p.y);ctx.lineTo(p.x-2,p.y+6);ctx.stroke();
      break;}
    case'orevein':{
      const mined=G.flags['ov:'+p.id]===G.dayN;
      shadow(p.x,p.y+6,10);
      dotc(p.x,p.y-1,9,'#7b7466');dotc(p.x-3,p.y-4,5,'#8d8577');
      if(!mined){
        dotc(p.x-3,p.y-2,1.6,'#b8c4d4');dotc(p.x+3,p.y-4,1.4,'#b8c4d4');dotc(p.x+1,p.y+2,1.4,'#b8c4d4');
        ctx.save();ctx.globalCompositeOperation='lighter';
        dotc(p.x,p.y-2,5,'rgba(184,196,212,'+(.12+.08*Math.sin(G.vt*3))+')');ctx.restore();
      }
      break;}
    case'branch':{
      if(op)break;
      ctx.strokeStyle='#8a6b4a';ctx.lineWidth=2.4;
      ctx.beginPath();ctx.moveTo(p.x-6,p.y+3);ctx.lineTo(p.x+6,p.y-3);
      ctx.moveTo(p.x-1,p.y);ctx.lineTo(p.x+3,p.y+4);ctx.stroke();
      break;}
    case'delve':{
      shadow(p.x,p.y+10,18);
      dotc(p.x-10,p.y-2,9,'#6a6458');dotc(p.x+10,p.y-3,10,'#7b7466');
      dotc(p.x,p.y-8,12,'#8d8577');
      ctx.fillStyle='#0c0a10';
      ctx.beginPath();ctx.ellipse(p.x,p.y+2,9,7,0,Math.PI,TAU);ctx.fill();
      ctx.fillStyle='#171319';ctx.fillRect(p.x-9,p.y+2,18,4);
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(p.x,p.y,7+Math.sin(G.vt*2)*1.5,'rgba(143,101,173,.22)');ctx.restore();
      ctx.strokeStyle='#5d5750';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(p.x-6,p.y-14);ctx.lineTo(p.x-2,p.y-12);
      ctx.moveTo(p.x+3,p.y-15);ctx.lineTo(p.x+6,p.y-12);ctx.stroke();
      break;}
    case'stairsD':{
      ctx.fillStyle='#171319';ctx.fillRect(p.x-11,p.y-9,22,18);
      for(let i=0;i<4;i++){ctx.fillStyle=['#4a4152','#3a3444','#2b2634','#1d1926'][i];
        ctx.fillRect(p.x-11+i*3,p.y-9+i*3,22-i*6,18-i*6);}
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(p.x,p.y,10,'rgba(255,214,110,'+(.1+.06*Math.sin(G.vt*3))+')');ctx.restore();
      break;}
    case'stairsU':{
      ctx.fillStyle='#4a4152';ctx.fillRect(p.x-11,p.y-6,22,16);
      for(let i=0;i<3;i++){ctx.fillStyle=['#5c5170','#6d6182','#8d8577'][i];
        ctx.fillRect(p.x-11+i*2,p.y-6-i*4,22-i*4,5);}
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(p.x,p.y-14,9,'rgba(159,216,255,.18)');ctx.restore();
      break;}
    case'torch':{
      rr(p.x-1.6,p.y-8,3.2,10,1.4,'#5d4a38');
      const f=Math.sin(G.vt*10+p.x*.7)*.25+1;
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(p.x,p.y-10,10*f,'rgba(232,137,74,.30)');ctx.restore();
      ctx.fillStyle='#e8894a';
      ctx.beginPath();ctx.moveTo(p.x-2.6,p.y-8);ctx.quadraticCurveTo(p.x-2,p.y-14*f,p.x,p.y-15*f);
      ctx.quadraticCurveTo(p.x+2,p.y-13*f,p.x+2.6,p.y-8);ctx.closePath();ctx.fill();
      dotc(p.x,p.y-10,1.6,'#ffd66e');
      break;}
    case'urn':{
      if(G.brokenUrns.has(p.id)){
        dotc(p.x-3,p.y+2,2.4,'#8d7a68');dotc(p.x+3,p.y+1,2,'#8d7a68');dotc(p.x,p.y+4,1.6,'#6f5d4e');
        break;}
      shadow(p.x,p.y+5,6);
      ctx.fillStyle='#c9a06a';
      ctx.beginPath();ctx.moveTo(p.x-4,p.y+4);ctx.quadraticCurveTo(p.x-6,p.y-4,p.x-2.6,p.y-8);
      ctx.lineTo(p.x+2.6,p.y-8);ctx.quadraticCurveTo(p.x+6,p.y-4,p.x+4,p.y+4);ctx.closePath();ctx.fill();
      rr(p.x-3.4,p.y-10,6.8,2.6,1.2,'#a8845a');
      ctx.strokeStyle='#a8845a';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(p.x-4.5,p.y-2);ctx.quadraticCurveTo(p.x,p.y-.5,p.x+4.5,p.y-2);ctx.stroke();
      break;}
    case'gold':{
      if(G.takenGold.has(p.id))break;
      dotc(p.x,p.y+1,5.5,'#e8b04a');dotc(p.x-4,p.y+2.6,3.4,'#e8b04a');dotc(p.x+4.4,p.y+2.4,3,'#e8b04a');
      dotc(p.x-1,p.y-1,1.4,'#f6d47c');dotc(p.x+3,p.y+1,1.2,'#f6d47c');
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(p.x,p.y,7,'rgba(255,214,110,'+(.12+.1*Math.abs(Math.sin(G.vt*3+p.x)))+')');ctx.restore();
      break;}
    case'portal':{
      ctx.save();ctx.globalCompositeOperation='lighter';
      for(let i=0;i<3;i++){
        const ph=G.vt*3+i*2.1;
        ctx.strokeStyle='rgba(159,216,255,'+(.5-i*.13)+')';
        ctx.lineWidth=2.6-i*.6;
        ctx.beginPath();
        ctx.ellipse(p.x,p.y-12,7+i*3+Math.sin(ph)*1.5,13+i*3+Math.cos(ph)*1.5,Math.sin(ph*.5)*.2,0,TAU);
        ctx.stroke();
      }
      dotc(p.x,p.y-12,5,'rgba(191,227,255,.55)');
      ctx.restore();
      if(Math.random()<.15)G.px.length<400&&G.px.push({x:p.x+rnd(-6,6),y:p.y-4,vx:rnd(-8,8),vy:-24,t:0,ttl:.7,c:'#bfe3ff',r:1.4,add:true});
      break;}
    case'shroomp':{
      if(op)break;
      rr(p.x-1.5,p.y-3,3,5,1,'#e8dcc4');
      ctx.fillStyle='#c88ad2';
      ctx.beginPath();ctx.ellipse(p.x,p.y-4,5,3.4,0,Math.PI,TAU);ctx.fill();
      dotc(p.x-2,p.y-5,.9,'#e8d4f0');dotc(p.x+1.5,p.y-6,.9,'#e8d4f0');
      break;}
  }
}
function drawDrops(){
  for(const d of G.drops){
    const bo=Math.sin(d.t*5)*2;
    if(d.kind==='coin'){
      const w=Math.abs(Math.sin(d.t*6))*3+1;
      ctx.fillStyle='#e8b04a';
      ctx.beginPath();ctx.ellipse(d.x,d.y-4+bo,w,4,0,0,TAU);ctx.fill();
      ctx.fillStyle='#f6d47c';ctx.beginPath();ctx.ellipse(d.x,d.y-4+bo,w*.55,2.2,0,0,TAU);ctx.fill();
    }else if(d.kind==='heart'){
      ctx.fillStyle='#e05b4b';
      ctx.save();ctx.translate(d.x,d.y-4+bo);ctx.scale(.5,.5);
      heartPath(0,0,10);ctx.fill();ctx.restore();
    }else if(d.kind==='arrow'){
      ctx.save();ctx.translate(d.x,d.y-3+bo);ctx.rotate(.8);
      rr(-6,-1,12,2,1,'#c9b48f');
      ctx.fillStyle='#8d8577';ctx.beginPath();ctx.moveTo(6,-3);ctx.lineTo(10,0);ctx.lineTo(6,3);ctx.fill();
      ctx.restore();
    }else if(d.kind==='bomb'){
      dotc(d.x,d.y-4+bo,5,'#3a3f4a');dotc(d.x-1.5,d.y-6+bo,1.6,'#5c6a7a');
    }else if(d.kind.startsWith('food:')){
      const f=FOODS[d.kind.slice(5)];
      dotc(d.x,d.y-4+bo,4.4,f.c);
      dotc(d.x-1.2,d.y-5.4+bo,1.4,'rgba(255,255,255,.5)');
    }else if(d.kind.startsWith('mat:')){
      const m=d.kind.slice(4);
      if(m==='wood'){ctx.save();ctx.translate(d.x,d.y-3+bo);ctx.rotate(.5);
        rr(-5,-1.6,10,3.2,1.4,'#8a6b4a');ctx.restore();}
      else if(m==='ore'){dotc(d.x,d.y-3+bo,4,'#8d95a5');dotc(d.x-1,d.y-4.4+bo,1.4,'#b8c4d4');}
      else{rr(d.x-4,d.y-6+bo,8,5,2,'#a8724a');}
    }else if(d.kind==='wi'){
      const w=WPN[d.inst.k]||null;
      const tc=instColor(d.inst);
      ctx.save();ctx.globalCompositeOperation='lighter';
      const gr=ctx.createLinearGradient(0,d.y-52,0,d.y);
      gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,tc);
      ctx.globalAlpha=.42+.16*Math.sin(d.t*4);
      ctx.fillStyle=gr;ctx.fillRect(d.x-3,d.y-52,6,50);
      ctx.globalAlpha=1;ctx.restore();
      ctx.save();ctx.translate(d.x,d.y-5+bo);ctx.rotate(-.9+Math.sin(d.t*2)*.1);
      if(w)drawWeapon(w,.8,null);
      else{rr(-5,-6,10,11,3,ARM[d.inst.k].c);rr(-5,-6,10,4,2,ARM[d.inst.k].c2);}
      ctx.restore();
    }else if(d.kind==='pot:hp'||d.kind==='pot:mp'){
      const c=d.kind==='pot:hp'?'#e05b4b':'#6db8f0';
      rr(d.x-1.6,d.y-10+bo,3.2,3,1,'#c9b48f');
      ctx.fillStyle=c;
      ctx.beginPath();ctx.moveTo(d.x-1.6,d.y-7+bo);ctx.quadraticCurveTo(d.x-5,d.y-4+bo,d.x-4,d.y-1+bo);
      ctx.quadraticCurveTo(d.x-3,d.y+2+bo,d.x,d.y+2+bo);
      ctx.quadraticCurveTo(d.x+3,d.y+2+bo,d.x+4,d.y-1+bo);
      ctx.quadraticCurveTo(d.x+5,d.y-4+bo,d.x+1.6,d.y-7+bo);ctx.closePath();ctx.fill();
      dotc(d.x-1.4,d.y-3+bo,1.2,'rgba(255,255,255,.6)');
    }else if(d.kind==='scroll'){
      rr(d.x-5,d.y-6+bo,10,8,2,'#e8dcc4');
      ctx.strokeStyle='#8a6b4a';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(d.x-3,d.y-4+bo);ctx.lineTo(d.x+3,d.y-4+bo);
      ctx.moveTo(d.x-3,d.y-2+bo);ctx.lineTo(d.x+2,d.y-2+bo);ctx.stroke();
      dotc(d.x,d.y+2.6+bo,1.6,'#9fd8ff');
    }else if(d.kind.startsWith('w:')){
      const wk=d.kind.slice(2),w=WPN[wk];
      ctx.save();ctx.globalCompositeOperation='lighter';
      const tc=TIERC[w.tier];
      const gr=ctx.createLinearGradient(0,d.y-46,0,d.y);
      gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,tc);
      ctx.globalAlpha=.4+.15*Math.sin(d.t*4);
      ctx.fillStyle=gr;ctx.fillRect(d.x-3,d.y-46,6,44);
      ctx.globalAlpha=1;ctx.restore();
      ctx.save();ctx.translate(d.x,d.y-5+bo);ctx.rotate(-.9+Math.sin(d.t*2)*.1);
      drawWeapon(w,.8,null);ctx.restore();
    }
  }
}
function heartPath(x,y,s){
  ctx.beginPath();
  ctx.moveTo(x,y+s*.32);
  ctx.bezierCurveTo(x,y-s*.28,x-s*.55,y-s*.28,x-s*.55,y+s*.06);
  ctx.bezierCurveTo(x-s*.55,y+s*.36,x,y+s*.56,x,y+s*.8);
  ctx.bezierCurveTo(x,y+s*.56,x+s*.55,y+s*.36,x+s*.55,y+s*.06);
  ctx.bezierCurveTo(x+s*.55,y-s*.28,x,y-s*.28,x,y+s*.32);
  ctx.closePath();
}
function drawPr(){
  for(const b of G.pr){
    if(b.t==='bomb'){
      const fl=b.ttl<.45&&Math.floor(G.vt*14)%2;
      dotc(b.x,b.y,6,fl?'#e05b4b':'#3a3f4a');
      dotc(b.x-2,b.y-2,1.8,'#5c6a7a');
    }else if(b.t==='orb'){
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(b.x,b.y,7,'rgba(143,101,173,.6)');dotc(b.x,b.y,3.4,'#d8b4f0');
      ctx.restore();
    }else if(b.t==='sbolt'||b.t==='abolt'){
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(b.x,b.y,7,'rgba(255,179,92,.55)');dotc(b.x,b.y,3.2,'#ffd8a8');
      ctx.restore();
    }else{
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.a);
      rr(-7,-1,13,2,1,b.t==='arrow'?'#c9b48f':'#8d7a68');
      ctx.fillStyle='#8d8577';ctx.beginPath();ctx.moveTo(6,-3);ctx.lineTo(10,0);ctx.lineTo(6,3);ctx.fill();
      ctx.restore();
    }
  }
}
function drawPx(dt){
  for(const p of G.px){
    p.t+=dt;
    if(p.bolt){
      const a=clamp(1-p.t/p.ttl,0,1);
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a;
      ctx.strokeStyle='#e8f0ff';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(p.x,p.y);
      ctx.lineTo(p.x+rnd(-8,8),lerp(p.y,p.ty,.4));
      ctx.lineTo(p.x+rnd(-8,8),lerp(p.y,p.ty,.75));
      ctx.lineTo(p.x,p.ty);ctx.stroke();
      ctx.restore();
      continue;
    }
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=30*dt;
    const a=clamp(1-p.t/p.ttl,0,1);
    if(p.ring){
      ctx.strokeStyle=p.c;ctx.globalAlpha=a*.8;ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r+p.t*160,0,TAU);ctx.stroke();ctx.globalAlpha=1;
      continue;
    }
    if(p.add)ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=a;ctx.fillStyle=p.c;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1-p.t/p.ttl*.4),0,TAU);ctx.fill();
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  G.px=G.px.filter(p=>p.t<p.ttl);
}
function drawFt(dt){
  ctx.textAlign='center';
  for(const f of G.ft){
    f.t+=dt;
    const a=clamp(1-f.t/f.ttl,0,1);
    ctx.globalAlpha=a;
    ctx.font=(f.big?'700 13px':'700 10px')+' -apple-system,system-ui,sans-serif';
    ctx.fillStyle='rgba(16,14,13,.7)';
    ctx.fillText(f.txt,f.x+1,f.y-f.t*26+1);
    ctx.fillStyle=f.c;
    ctx.fillText(f.txt,f.x,f.y-f.t*26);
  }
  ctx.globalAlpha=1;
  G.ft=G.ft.filter(f=>f.t<f.ttl);
}
function drawTrial(){
  const T=G.trial;if(!T)return;
  ctx.save();
  ctx.strokeStyle='rgba(159,216,255,.6)';ctx.lineWidth=2.5;ctx.setLineDash([10,8]);
  ctx.beginPath();ctx.arc(T.x,T.y,160,G.vt*.4,G.vt*.4+TAU);ctx.stroke();ctx.setLineDash([]);
  if(T.kind==='sparks'){
    ctx.globalCompositeOperation='lighter';
    for(const s of T.sparks){
      if(s.got)continue;
      dotc(s.px,s.py,6+Math.sin(G.vt*6+s.r)*1.5,'rgba(159,216,255,.5)');
      dotc(s.px,s.py,2.6,'#e8f4ff');
    }
  }
  ctx.restore();
}
function drawEnts(){
  const hw=VW/2/ZM+50,hh=VH/2/ZM+80;
  G.vProps=propsNear(G.cam.x,G.cam.y,2);
  const list=[];
  for(const p of G.vProps){
    if(Math.abs(p.x-G.cam.x)>hw||Math.abs(p.y-G.cam.y)>hh)continue;
    list.push({y:p.y+(p.rect?p.h/2:0),d:p,k:0});
  }
  for(const e of G.ents){
    if(e.dead)continue;
    if(Math.abs(e.x-G.cam.x)>hw||Math.abs(e.y-G.cam.y)>hh)continue;
    list.push({y:e.y,d:e,k:1});
  }
  if(G.horse&&G.p.mount!=='horse'&&!G.inDun)list.push({y:G.horse.y,d:G.horse,k:3});
  if(G.portal){
    if(!G.inDun&&!G.portal.aDun)list.push({y:G.portal.ay,d:{t:'portal',x:G.portal.ax,y:G.portal.ay,id:'pa'},k:0});
    if(!G.inDun)list.push({y:G.portal.by,d:{t:'portal',x:G.portal.bx,y:G.portal.by,id:'pb'},k:0});
    if(G.inDun&&G.portal.aDun&&G.portal.dun===G.dun)list.push({y:G.portal.ay,d:{t:'portal',x:G.portal.ax,y:G.portal.ay,id:'pa'},k:0});
  }
  if(G.boat&&G.p.mount!=='boat'&&!G.inDun)list.push({y:G.boat.y,d:G.boat,k:4});
  list.push({y:G.p.y,d:null,k:2});
  list.sort((a,b)=>a.y-b.y);
  for(const it of list){
    if(it.k===0)drawProp(it.d);
    else if(it.k===1)drawEnt(it.d);
    else if(it.k===3)drawHorse(it.d.x,it.d.y,Math.PI+Math.sin(G.vt*.3)*.4,G.vt*.6,false);
    else if(it.k===4)drawBoat(it.d.x,it.d.y,0,false);
    else drawPlayer();
  }
}
