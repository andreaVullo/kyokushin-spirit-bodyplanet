'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
async function harness() {
  let h;
  const document = { currentScript: { src: 'file:///game/scripts/arcade-art.js' }, createElement() { return { remove() {} }; },
    head: { append(script) { h.__arcadeRegisterSprite('vfx', 'fixture'); script.onload(); } } };
  class Image { set src(value) { this.onload(); } }
  h = vm.createContext({ document, Image, URL, setTimeout, clearTimeout, FighterArt: { height: 228,
    strikePoint: f => ({ x: f.x + f.facing * 100, y: f.y - 150 }) } });
  h.window = h;
  for (const file of ['game.js','strike-point.js','arcade-art.js']) vm.runInContext(fs.readFileSync(path.join(root,'scripts',file),'utf8'), h);
  await h.ArcadeVFX.load();
  const draws = [];
  const ctx = { save() {}, restore() {}, translate(x,y) { this.position = [x,y]; }, scale(x,y) { this.facing=x; }, rotate(a) { this.angle=a; },
    drawImage(...args) { draws.push({ position:this.position, facing:this.facing, angle:this.angle, alpha:this.globalAlpha, sourceY:args[2] }); } };
  const game = new h.KyokushinGame();game.start({mode:'versus'});const state=game.getState();state.phase='fight';
  const draw=(dt=0,options={})=>{draws.length=0;h.ArcadeVFX.draw(ctx,dt,{state,...options});return draws;};
  return {h,game,state,draw,draws};
}
test('all nine trails follow only the active strike, its current position and facing',async()=>{
  const {h,game,state,draw}=await harness(),f=state.fighters[0];
  for(const move of Object.keys(h.KyokushinMoves)) for(const facing of [1,-1]){
    f.ki=100;game.beginAttack(f,move);f.facing=facing;const d=f.attack.def;
    f.moveTime=d.start-.001;assert.equal(draw().length,0,move+' preparation');
    f.moveTime=(d.start+d.end)/2;let first=draw()[0];assert.ok(first,move);assert.equal(first.facing,facing);
    f.x+=39;f.y-=17;let next=draw()[0];assert.equal(next.position[0]-first.position[0],39);assert.ok(Math.abs(next.position[1]-first.position[1]+17)<1e-8);
    f.moveTime=d.end+.001;assert.equal(draw().length,0,move+' recovery');
    f.moveTime=d.start;f.attack.hitApplied=true;assert.equal(draw().length,0,move+' contact replaces trail');
    f.attack.hitApplied=false;f.state='hit';assert.equal(draw().length,0,move+' interrupted');
    f.state='idle';f.attack=null;
  }
});
test('no launch, whiff, guard stance, dash or ordinary landing creates a burst',async()=>{
  const {h,state,draw}=await harness();
  for(const type of ['attack','whiff','blockStart','dash','land','jump','special','combo']){
    assert.equal(h.ArcadeVFX.emit({type,x:100,y:625,move:'kaiten'},state),false);assert.equal(draw().length,0,type);
  }
  assert.equal(h.ArcadeVFX.emit({type:'land',x:100,y:625,heavy:true},state),true);assert.equal(draw()[0].sourceY,835);
});
test('body impact and guard follow recoil; no ground explosion, double trail or stale round',async()=>{
  const {h,state,draw}=await harness(),target=state.fighters[1];
  for(const [type,move,sourceY] of [['hit','ushiro',0],['block','mae',410],['hit','kaiten',1017]]){
    h.ArcadeVFX.clear();h.ArcadeVFX.emit({type,move,x:700,y:480,target:1,facing:1,damage:185},state);
    const first=draw()[0];assert.equal(first.sourceY,sourceY);
    target.x+=31;target.y-=20;const next=draw()[0];assert.equal(next.position[0]-first.position[0],31);assert.equal(next.position[1]-first.position[1],-20);
  }
  h.ArcadeVFX.emit({type:'round'},state);assert.equal(draw().length,0);
});
test('effects freeze in pause and hitstop, expire, and respect reduced motion',async()=>{
  const {h,state,game,draw}=await harness();const event={type:'hit',target:1,x:700,y:480,move:'tsuki'};
  h.ArcadeVFX.emit(event,state);state.paused=true;for(let i=0;i<10;i++)assert.equal(draw(.1).length,1);
  state.paused=false;state.hitstop=.03;for(let i=0;i<10;i++)assert.equal(draw(.1).length,1);
  state.hitstop=0;draw(.1);assert.equal(draw(.1).length,0);
  h.ArcadeVFX.emit({type:'land',x:100,y:625,heavy:true},state);assert.equal(draw(0,{reducedMotion:true}).length,0);
  h.ArcadeVFX.emit(event,state);assert.equal(draw(0,{reducedMotion:true}).length,1);
  h.ArcadeVFX.clear();const f=state.fighters[0];game.beginAttack(f,'tsuki');f.moveTime=f.attack.def.start;
  assert.equal(draw(0,{reducedMotion:true}).length,0);assert.equal(draw(0,{reducedMotion:false}).length,1);
});
test('actual sprite endpoint follows scale, facing and the rotating heel transform',async()=>{
  const {h}=await harness(),width=100,height=180,data=new Uint8ClampedArray(width*height*4);
  // A hand beyond a white sleeve, and an unrelated head above the strike.
  for(const [x,y,color] of [[70,30,[240,170,110,255]],[80,0,[240,170,110,255]],[90,30,[250,250,250,255]]])data.set(color,(y*width+x)*4);
  let reads=0;const source={width,height,getContext:()=>({getImageData:()=>{reads++;return {data};}})};
  const f={x:300,y:625,facing:1,move:'tsuki'},g={x:0,y:-180,scale:1};
  const p=h.FighterStrikePoint.point(f,source,g);assert.equal(p.x,370);assert.equal(p.y,475);
  f.facing=-1;assert.equal(h.FighterStrikePoint.point(f,source,g).x,230);
  f.scale=2;const large=h.FighterStrikePoint.point(f,source,{x:0,y:-360,scale:2});assert.equal(large.x,160);assert.equal(large.y,325);
  f.facing=1;f.scale=1;const rotated=h.FighterStrikePoint.point(f,source,g,{angle:.1,pivot:-108,lift:20});assert.ok(rotated);assert.notEqual(rotated.x,p.x);assert.notEqual(rotated.y,p.y);assert.equal(reads,1);
});
