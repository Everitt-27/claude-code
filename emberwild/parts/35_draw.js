/* ================= drawing: characters, props, fx ================= */
function shadow(x,y,rx){
  ctx.fillStyle='rgba(20,16,12,.22)';
  ctx.beginPath();ctx.ellipse(x,y,rx,rx*.45,0,0,TAU);ctx.fill();
}
function rr(x,y,w,h,r,c){ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function dotc(x,y,r,c,a){if(a!==undefined)ctx.globalAlpha=a;ctx.fillStyle=c;
  ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.globalAlpha=1;}

function humanoid(x,y,o){
  const s=o.size||1,bob=Math.sin((o.anim||0)*2.2)*1.3*(o.mv?1:.35);
  ctx.save();ctx.translate(x,y+ (o.noShadow?0:0));
  shadow(0,8*s,7*s);
  if(o.mv){const lp=Math.sin((o.anim||0)*4.4)*3*s;
    rr(-4*s,3*s+lp*.4,3*s,6*s,1.5*s,o.pants||'#4a3b30');
    rr(1*s,3*s-lp*.4,3*s,6*s,1.5*s,o.pants||'#4a3b30');
  }else{rr(-4*s,4*s,3*s,5*s,1.5*s,o.pants||'#4a3b30');rr(1*s,4*s,3*s,5*s,1.5*s,o.pants||'#4a3b30');}
  rr(-5.5*s,-5*s+bob,11*s,11*s,4*s,o.body);
  if(o.apron)rr(-3.5*s,-2*s+bob,7*s,7*s,2*s,o.apron);
  dotc(0,-8*s+bob,4.6*s,o.skin||'#f2c9a0');
  if(o.hood){ctx.fillStyle=o.hood;ctx.beginPath();
    ctx.arc(0,-8.6*s+bob,4.9*s,Math.PI*.95,Math.PI*2.05);ctx.fill();
    rr(-4.9*s,-9*s+bob,9.8*s,2.6*s,1*s,o.hood);}
  else if(o.hat){rr(-6*s,-11.4*s+bob,12*s,2.4*s,1.2*s,o.hat);rr(-3.4*s,-14*s+bob,6.8*s,3.4*s,1.4*s,o.hat);}
  else{ctx.fillStyle=o.hair||'#5a4630';ctx.beginPath();
    ctx.arc(0,-9*s+bob,4.4*s,Math.PI*.9,Math.PI*2.1);ctx.fill();}
  const fx=Math.cos(o.face||0)*1.6*s,fy=Math.sin(o.face||0)*.9*s;
  dotc(fx-1.5*s,-8*s+fy+bob,.7*s,'#241c16');
  dotc(fx+1.5*s,-8*s+fy+bob,.7*s,'#241c16');
  if(o.glasses){ctx.strokeStyle='#241c16';ctx.lineWidth=.7*s;
    ctx.beginPath();ctx.arc(fx-1.5*s,-8*s+fy+bob,1.4*s,0,TAU);
    ctx.arc(fx+1.5*s,-8*s+fy+bob,1.4*s,0,TAU);ctx.stroke();}
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

function drawEnt(e){
  if(e.hidden)return;
  const fl=e.flash>0;
  ctx.save();
  if(fl){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.9;}
  switch(e.t){
    case'npc':humanoid(e.x,e.y,Object.assign({face:e.face,anim:e.anim,mv:hyp(e.vx,e.vy)>4},NPCLOOK[e.key]||{body:'#7a6a5a'}));break;
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
    case'bandit':case'brute':{
      const s=e.t==='brute'?1.35:1,wu=e.st==='windup';
      humanoid(e.x,e.y,{body:fl?'#fff':(e.t==='brute'?'#4a3b45':'#6a4a38'),hood:wu?'#a05436':'#7a5c46',
        size:s,face:e.face,anim:e.anim,mv:hyp(e.vx,e.vy)>4,skin:'#c9976a'});
      ctx.save();ctx.translate(e.x,e.y);
      const sw=e.st==='swing'?1.4:(wu?-1.2:-.5);
      ctx.rotate(e.face+sw);
      rr(6*s,-2*s,11*s,4*s,2*s,'#5d4a38');dotc(17*s,0,3*s,'#4a3b30');
      ctx.restore();
      break;}
    case'archer':{
      humanoid(e.x,e.y,{body:fl?'#fff':'#55603f',hood:'#5c6a46',face:e.face,anim:e.anim,mv:hyp(e.vx,e.vy)>4,skin:'#c9976a'});
      ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.face);
      ctx.strokeStyle='#8a6b4a';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(8,0,7,-1.2,1.2);ctx.stroke();
      if(e.st==='aim'){ctx.strokeStyle='rgba(255,100,80,'+(.3+.4*Math.sin(G.vt*12))+')';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(120,0);ctx.stroke();}
      ctx.restore();
      break;}
    case'skel':{
      shadow(e.x,e.y+7,7);
      ctx.translate(e.x,e.y);
      const rat=Math.sin(e.anim*6)*1.5;
      ctx.strokeStyle=fl?'#fff':'#dfe6ea';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-5,2+rat*.3);ctx.lineTo(5,2-rat*.3);
      ctx.moveTo(-4,5);ctx.lineTo(4,5);ctx.moveTo(0,-2);ctx.lineTo(0,7);ctx.stroke();
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
      const wu=e.st==='slash'||e.st==='slamW';
      // telegraphs
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
  if((e.t==='warden'||e.t==='king')&&e.aggro&&e.hp>0){
    ctx.fillStyle='rgba(16,14,13,.6)';
    ctx.fillRect(e.x-20,e.y-e.r-22,40,4);
    ctx.fillStyle='#e05b4b';
    ctx.fillRect(e.x-20,e.y-e.r-22,40*clamp(e.hp/e.mhp,0,1),4);
  }else if(e.t!=='npc'&&e.hp>0&&e.hp<e.mhp){
    ctx.fillStyle='rgba(16,14,13,.55)';
    ctx.fillRect(e.x-11,e.y-e.r-12,22,3);
    ctx.fillStyle='#8fce6a';
    ctx.fillRect(e.x-11,e.y-e.r-12,22*clamp(e.hp/e.mhp,0,1),3);
  }
}

function drawPlayer(){
  const p=G.p;
  ctx.save();ctx.translate(p.x,p.y);
  if(p.iv>0&&p.act!=='roll'&&Math.floor(G.vt*18)%2)ctx.globalAlpha=.45;
  shadow(0,8,8);
  if(p.flurry>0){ctx.globalCompositeOperation='lighter';
    dotc(0,-2,16+Math.sin(G.vt*10)*2,'rgba(159,216,255,.18)');
    ctx.globalCompositeOperation='source-over';}
  if(p.charged||p.chargeT>=.5){ctx.globalCompositeOperation='lighter';
    dotc(0,-2,13+Math.sin(G.vt*12)*2,'rgba(255,179,92,.3)');
    ctx.globalCompositeOperation='source-over';}
  const bob=Math.sin(p.anim*2.2)*1.4*(p.mv>10?1:.3);
  if(p.swim){
    ctx.strokeStyle='rgba(255,255,255,.4)';ctx.lineWidth=1.6;
    ctx.beginPath();ctx.ellipse(0,4,11+Math.sin(G.vt*5)*1.5,5,0,0,TAU);ctx.stroke();
    dotc(0,-4+bob*.5,4.6,'#f2c9a0');
    ctx.fillStyle='#5a4630';ctx.beginPath();ctx.arc(0,-5+bob*.5,4.4,Math.PI*.9,Math.PI*2.1);ctx.fill();
    rr(-5,-1+bob*.5,10,5,2,'#3f8f8a');
    ctx.restore();return;
  }
  if(p.act==='roll'){
    ctx.rotate(p.rollAng);
    ctx.globalAlpha*=.9;
    dotc(0,0,7.5,'#3f8f8a');
    ctx.strokeStyle='#2d6a66';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,7.5,p.actT*22,p.actT*22+4);ctx.stroke();
    dotc(3,0,3,'#f2c9a0');
    ctx.restore();return;
  }
  // legs
  if(p.mv>10){const lp=Math.sin(p.anim*4.4)*3;
    rr(-4,3+lp*.4,3,6.5,1.5,'#4a3b30');rr(1,3-lp*.4,3,6.5,1.5,'#4a3b30');
  }else{rr(-4,4,3,5.5,1.5,'#4a3b30');rr(1,4,3,5.5,1.5,'#4a3b30');}
  // scarf trails opposite facing
  const sa=p.face+Math.PI;
  ctx.save();ctx.translate(Math.cos(sa)*5,Math.sin(sa)*3-3+bob);
  ctx.rotate(sa+Math.sin(G.vt*6)*.2);
  rr(0,-2,9+p.mv*.02,4,2,'#e8894a');ctx.restore();
  // body
  rr(-5.5,-5+bob,11,11,4,p.climb?'#357a76':'#3f8f8a');
  rr(-5.5,2+bob,11,2.4,1,'#2d6a66');
  // sword on back when idle
  if(p.act===''&&!p.aim){
    ctx.save();ctx.rotate(-.7);
    rr(-2,-14+bob,3.2,13,1.4,WPN[G.wpn].c);ctx.restore();
    dotc(-4,-2+bob,3.4,'#8a6b4a');dotc(-4,-2+bob,1.6,'#6f5638');
  }
  // head
  dotc(0,-8.6+bob,4.6,'#f2c9a0');
  ctx.fillStyle='#5a4630';ctx.beginPath();ctx.arc(0,-9.6+bob,4.5,Math.PI*.85,Math.PI*2.15);ctx.fill();
  const fx=Math.cos(p.face)*1.7,fy=Math.sin(p.face)*1;
  dotc(fx-1.5,-8.4+fy+bob,.75,'#241c16');dotc(fx+1.5,-8.4+fy+bob,.75,'#241c16');
  // climbing grip dots
  if(p.climb){dotc(-7,-3+bob,1.6,'#f2c9a0');dotc(7,-3+bob,1.6,'#f2c9a0');
    dotc(-6,6,1.6,'#f2c9a0');dotc(6,6,1.6,'#f2c9a0');}
  // weapon animations
  if(p.act==='swing'){
    const pr=clamp(p.actT/.26,0,1);
    const dir=p.combo%2?1:-1;
    const a0=p.face-1.9*dir,swp=a0+pr*3.8*dir;
    ctx.strokeStyle='rgba(246,237,217,'+(.5*(1-pr))+')';
    ctx.lineWidth=10;ctx.beginPath();
    ctx.arc(0,-2,24+WPN[G.wpn].t*2,Math.min(a0,swp),Math.max(a0,swp));ctx.stroke();
    ctx.save();ctx.rotate(swp);
    rr(8,-2,17+WPN[G.wpn].t*2,4,1.8,WPN[G.wpn].c);
    rr(5,-3.4,4,7,1.5,'#8a6b4a');ctx.restore();
  }else if(p.act==='spin'){
    const pr=clamp(p.actT/.5,0,1);
    const swp=p.face+pr*TAU*1.15;
    ctx.strokeStyle='rgba(255,214,110,'+(.55*(1-pr))+')';
    ctx.lineWidth=12;ctx.beginPath();ctx.arc(0,-2,27,swp-2.4,swp);ctx.stroke();
    ctx.save();ctx.rotate(swp);
    rr(8,-2,20,4.4,1.8,WPN[G.wpn].c);ctx.restore();
  }else if(p.aim){
    ctx.save();ctx.rotate(p.aimAng);
    ctx.strokeStyle='rgba(246,237,217,.35)';ctx.lineWidth=1;
    ctx.setLineDash([4,6]);ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(150,0);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle='#8a6b4a';ctx.lineWidth=2.2;
    ctx.beginPath();ctx.arc(9,0,8,-1.25,1.25);ctx.stroke();
    ctx.strokeStyle='#d8ccb4';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(9+Math.cos(-1.25)*8,Math.sin(-1.25)*8);
    ctx.lineTo(5,0);ctx.lineTo(9+Math.cos(1.25)*8,Math.sin(1.25)*8);ctx.stroke();
    if(G.arrows>0){rr(5,-1,12,2,1,'#c9b48f');}
    ctx.restore();
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
      rr(p.x-5,p.y+p.h/2-12,10,18-6,2,'#3a2d22');
      const night=G.dayT>.7||G.dayT<.05;
      ctx.fillStyle=night?'#ffd66e':'#5d4a38';
      if(night){ctx.save();ctx.globalCompositeOperation='lighter';
        dotc(p.x-p.w/4,p.y,7,'rgba(255,214,110,.25)');ctx.restore();}
      ctx.fillRect(p.x-p.w/4-3,p.y-3,7,6);
      break;}
    case'stall':{
      shadow(p.x,p.y+6,12);
      rr(p.x-12,p.y-2,24,8,2,'#8a6b4a');
      for(let i=0;i<4;i++)rr(p.x-12+i*6,p.y-14,6,5,1,i%2?'#e8894a':'#f2e9d8');
      rr(p.x-12,p.y-14,24,2,1,'#6a4a34');
      dotc(p.x-5,p.y-4,2.4,'#e05b4b');dotc(p.x+1,p.y-4,2.4,'#f2d24b');dotc(p.x+6,p.y-4,2.4,'#8fce6a');
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
      G.px.length<240&&Math.random()<.3&&G.px.push({x:b.x+2,y:b.y-6,vx:rnd(-6,6),vy:-20,t:0,ttl:.3,c:'#ffd66e',r:1.2,add:true});
    }else if(b.t==='orb'){
      ctx.save();ctx.globalCompositeOperation='lighter';
      dotc(b.x,b.y,7,'rgba(143,101,173,.6)');dotc(b.x,b.y,3.4,'#d8b4f0');
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
    p.t+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=30*dt;
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
  list.push({y:G.p.y,d:null,k:2});
  list.sort((a,b)=>a.y-b.y);
  for(const it of list){
    if(it.k===0)drawProp(it.d);
    else if(it.k===1)drawEnt(it.d);
    else drawPlayer();
  }
}
