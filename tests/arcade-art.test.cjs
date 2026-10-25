'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function harness() {
  const context = vm.createContext({ URL, document: { currentScript: { src: 'file:///game/scripts/arcade-art.js' } },
    FighterArt: { height: 228, ready: true, load() {}, loadFighters() {}, draw() {}, drawSelectionPortrait() {} } });
  context.window = context;
  for (const file of ['game.js', 'arcade-atlas.js', 'arcade-art.js']) vm.runInContext(fs.readFileSync(path.join(root, 'scripts', file), 'utf8'), context);
  return context;
}
function pngInfo(filename) {
  const bytes = fs.readFileSync(filename);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return { bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}
test('all six generated PNGs retain alpha and exact original bytes in offline envelopes', () => {
  for (const name of ['male-body', 'female-body', 'heads', 'supplement', 'male-reactions', 'vfx']) {
    const info = pngInfo(path.join(root, 'assets/arcade', name + '.png'));
    assert.equal(info.colorType, 6, name + ' is RGBA');
    let decoded;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/arcade', name + '.js'), 'utf8'), { window: {
      __arcadeRegisterSprite(key, source) { assert.equal(key, name); decoded = Buffer.from(source.split(',')[1], 'base64'); },
    } });
    assert.deepEqual(decoded, info.bytes, name + ' bytes remain unchanged');
  }
});
test('72 full-body poses and 20 hairstyle heads have valid per-pose geometry within their source images', () => {
  const h = harness(), atlas = h.ArcadeSpriteAtlas;
  assert.equal(atlas.male.length, 36); assert.equal(atlas.female.length, 36); assert.equal(atlas.heads.length, 20);
  for (const frame of [...atlas.male, ...atlas.female, ...atlas.heads]) {
    const { width, height } = pngInfo(path.join(root, 'assets/arcade', frame.sheet + '.png'));
    const [x, y, w, ht] = frame.bounds;
    assert.ok(x >= 0 && y >= 0 && w > 0 && ht > 0 && x + w <= width && y + ht <= height);
    assert.ok(frame.anchor.every(Number.isFinite)); assert.ok(frame.nominal > 0); assert.ok(frame.component > 0);
    if (frame.head.length) {
      const [hx, hy, size, rotation = 0] = frame.head;
      assert.ok(hx >= x - w / 2 && hx <= x + w * 1.5 && hy >= y && hy <= y + ht);
      assert.ok(size > 0 && Number.isFinite(rotation));
    }
  }
});
test('each of the nine attacks has an intact preparation, contact and recovery pose at engine timing boundaries', () => {
  const h = harness();
  for (const [move, base] of Object.entries({ tsuki:6, gyaku:8, shita:10, kagi:12, gedan:14, mae:16, mawashi:18, ushiro:20, kaiten:22 })) {
    const d=h.KyokushinMoves[move], start=d.start/d.duration, end=d.end/d.duration;
    const f={ state:'attack', move };
    for (const [progress, expected] of [[0,0],[start*.8,base],[(start+end)/2,base+1],[end+(1-end)*.2,base],[1,0]]) {
      f.moveProgress=progress; assert.equal(h.ArcadeArt.pose(f,0,{since:0}),expected,move+' '+progress);
    }
  }
});
test('guards, jump, dash, recoil, KO, recovery and victory use their dedicated poses', () => {
  const h=harness(), pose=(f,t=.2,s={since:0,previous:''})=>h.ArcadeArt.pose(f,t,s);
  for (const [f,index] of [[{state:'block'},25],[{state:'legBlock'},27],[{state:'dash'},3],
    [{state:'jump',vy:-5},4],[{state:'jump',vy:5},5],[{state:'hit',stun:.15},29],
    [{state:'hit',stun:.02},28],[{state:'ko',hp:0},31],[{state:'ko',airborne:true},30],
    [{state:'ko',hp:10,recovery:.01,stun:0},32],[{state:'victory'},33]]) assert.equal(pose(f),index);
  assert.equal(pose({state:'idle'},.05,{since:0,previous:'jump'}),35);
});
test('appearance sanitization preserves separate characters and supports hairstyle alias/rank limits', () => {
  const h=harness();
  h.ArcadeArt.setCharacter({id:'first',name:'Ada',gender:'female',hairstyle:3,rank:{color:'#17191f',dan:10}});
  h.ArcadeArt.setCharacter({id:'second',name:'Leo',gender:'male',hair:90,rank:{color:'#17191f',dan:100}});
  assert.equal(h.ArcadeArt.getCharacter('first').gender,'female');
  assert.equal(h.ArcadeArt.getCharacter('first').hair,3);
  assert.equal(h.ArcadeArt.getCharacter('second').hair,4);
  assert.equal(h.ArcadeArt.getCharacter('second').rank.dan,10);
  assert.equal(h.ArcadeArt.isCustom('first'),true); assert.equal(h.ArcadeArt.isCustom('angelo'),false);
});
