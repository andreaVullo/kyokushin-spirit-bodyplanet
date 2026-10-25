'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DojoOrientation } = require('../scripts/orientation.js');
const { resolve } = DojoOrientation;

const phones = [[280,653], [320,568], [360,640], [375,667], [390,844], [393,852], [412,915], [430,932], [540,720], [768,1024]];

for (const [width,height] of phones) {
  test(`portrait ${width}×${height}: explicit landscape stays playable with rotation locked`, () => {
    const before = resolve({touchEnabled:true,width,height});
    assert.equal(before.blocked,true);
    assert.equal(before.virtual,false);
    for (const nativeLandscapeLocked of [false,true]) {
      const result=resolve({touchEnabled:true,width,height,landscapeRequested:true,nativeLandscapeLocked});
      assert.equal(result.blocked,false);
      assert.equal(result.virtual,true);
      assert.equal(result.logicalWidth,height);
      assert.equal(result.logicalHeight,width);
      assert.equal(result.width,width);
      assert.equal(result.height,height);
    }
  });

  test(`portrait ${width}×${height}: real rotation takes over and returning portrait restores fallback`, () => {
    const options={touchEnabled:true,landscapeRequested:true};
    for (const [w,h,rotated] of [[width,height,true],[height,width,false],[width,height,true],[height,width,false]]) {
      const result=resolve({...options,width:w,height:h});
      assert.equal(result.virtual,rotated);
      assert.equal(result.blocked,false);
      assert.equal(result.logicalWidth,height);
      assert.equal(result.logicalHeight,width);
    }
    const exit=resolve({...options,width,height,landscapeRequested:false});
    assert.equal(exit.virtual,false);
    assert.equal(exit.blocked,true);
  });
}

test('a cooperating host prevents a second CSS turn, then releases the gate when its iframe resizes', () => {
  const options={touchEnabled:true,landscapeRequested:true,hostManaged:true};
  const pending=resolve({...options,width:390,height:844});
  assert.equal(pending.virtual,false);
  assert.equal(pending.blocked,true);
  const settled=resolve({...options,width:844,height:390});
  assert.equal(settled.virtual,false);
  assert.equal(settled.blocked,false);
  assert.equal(settled.logicalWidth,844);
  assert.equal(settled.logicalHeight,390);
});

test('only a confirmed boolean host-managed flag suppresses the local fallback', () => {
  for (const hostManaged of [undefined,null,false,0,'false']) {
    assert.equal(resolve({width:390,height:844,landscapeRequested:true,hostManaged}).virtual,true);
  }
});

test('device angle, OS lock state, and a completed native request cannot contradict viewport geometry', () => {
  for (const angle of [0,90,180,270,-90]) {
    for (const type of ['portrait-primary','portrait-secondary','landscape-primary','landscape-secondary']) {
      const result=resolve({touchEnabled:true,width:390,height:844,landscapeRequested:true,angle,type,nativeLandscapeLocked:true});
      assert.equal(result.virtual,true);
      assert.equal(result.blocked,false);
    }
  }
});

test('stale portrait visualViewport after native landscape resize does not rotate or shrink the cabinet', () => {
  const result=resolve({touchEnabled:true,width:844,height:390,visualWidth:390,visualHeight:844,landscapeRequested:true,offsetLeft:20,offsetTop:40});
  assert.equal(result.virtual,false);
  assert.equal(result.logicalWidth,844);
  assert.equal(result.logicalHeight,390);
  assert.equal(result.left,0);
  assert.equal(result.top,0);
});

test('stale landscape visualViewport after portrait resize cannot remove the fallback', () => {
  const result=resolve({touchEnabled:true,width:390,height:844,visualWidth:844,visualHeight:390,landscapeRequested:true});
  assert.equal(result.virtual,true);
  assert.equal(result.logicalWidth,844);
  assert.equal(result.logicalHeight,390);
});

test('a same-shape visual viewport tracks browser chrome and pans without exceeding layout bounds', () => {
  const result=resolve({touchEnabled:true,width:390,height:844,visualWidth:390,visualHeight:720,offsetLeft:50,offsetTop:40,landscapeRequested:true});
  assert.equal(result.width,390);
  assert.equal(result.height,720);
  assert.equal(result.logicalWidth,720);
  assert.equal(result.logicalHeight,390);
  assert.equal(result.left,0);
  assert.equal(result.top,40);
});

test('pinch zoom retains its visible area and clamps panning to the containing viewport', () => {
  const result=resolve({width:390,height:844,visualWidth:195,visualHeight:422,offsetLeft:300,offsetTop:-100,landscapeRequested:true});
  assert.equal(result.logicalWidth,422);
  assert.equal(result.logicalHeight,195);
  assert.equal(result.left,195);
  assert.equal(result.top,0);
  assert.equal(result.virtual,true);
});

test('minor fractional viewport rounding is accepted but oversized values are rejected', () => {
  const rounded=resolve({width:844,height:390,visualWidth:845.2,visualHeight:389.5});
  assert.equal(rounded.width,844);
  assert.equal(rounded.height,389.5);
  const invalid=resolve({width:844,height:390,visualWidth:900,visualHeight:400});
  assert.equal(invalid.width,844);
  assert.equal(invalid.height,390);
  const square=resolve({width:390,height:844,visualWidth:390,visualHeight:390,landscapeRequested:true});
  assert.equal(square.logicalWidth,390);
  assert.equal(square.logicalHeight,390);
  assert.equal(square.virtual,false);
});

test('the on-screen keyboard may change the visible aspect ratio without leaving the game underneath it', () => {
  const options={touchEnabled:true,width:390,height:844,landscapeRequested:true};
  const open=resolve({...options,visualWidth:390,visualHeight:300,offsetTop:44});
  assert.equal(open.virtual,false);
  assert.equal(open.blocked,false);
  assert.equal(open.logicalWidth,390);
  assert.equal(open.logicalHeight,300);
  assert.equal(open.top,44);
  const closed=resolve({...options,visualWidth:390,visualHeight:720});
  assert.equal(closed.virtual,true);
  assert.equal(closed.logicalWidth,720);
  assert.equal(closed.logicalHeight,390);
});

test('browser chrome crossing a nearly square viewport preserves the visible bounds through repeated changes', () => {
  const options={touchEnabled:true,width:540,height:600,landscapeRequested:true};
  for (const [visibleHeight,virtual] of [[580,true],[520,false],[540,false],[600,true],[500,false]]) {
    const layout=resolve({...options,visualWidth:540,visualHeight:visibleHeight});
    assert.equal(layout.virtual,virtual);
    assert.equal(layout.blocked,false);
    assert.equal(layout.logicalWidth,Math.max(540,visibleHeight));
    assert.equal(layout.logicalHeight,Math.min(540,visibleHeight));
    assert.ok(layout.left+layout.width<=options.width);
    assert.ok(layout.top+layout.height<=options.height);
  }
});

test('square windows are playable without an unnecessary turn and non-touch portrait is not gated', () => {
  for (const landscapeRequested of [false,true]) {
    const square=resolve({touchEnabled:true,width:500,height:500,landscapeRequested});
    assert.equal(square.virtual,false);
    assert.equal(square.blocked,false);
    assert.equal(square.logicalWidth,500);
  }
  assert.equal(resolve({width:390,height:844,touchEnabled:false}).blocked,false);
});

test('invalid and temporarily unavailable dimensions never leak nonfinite CSS geometry', () => {
  for (const input of [null,undefined,{}, {width:0,height:0}, {width:NaN,height:Infinity}, {width:-300,height:640,visualWidth:NaN,visualHeight:-4,offsetLeft:Infinity}]) {
    const result=resolve(input);
    for (const key of ['width','height','left','top','logicalWidth','logicalHeight']) assert.equal(Number.isFinite(result[key]),true);
    assert.ok(result.width>0 && result.height>0);
  }
});

test('pointer vector inverse preserves local axes while native input remains unchanged', () => {
  assert.deepEqual(DojoOrientation.localVector(0,40,true),{x:40,y:-0});
  assert.deepEqual(DojoOrientation.localVector(40,0,true),{x:0,y:-40});
  assert.deepEqual(DojoOrientation.localVector(-12,18,false),{x:-12,y:18});
});

test('clockwise cabinet maps each safe inset to the physical edge reached by that logical edge', () => {
  const css=fs.readFileSync(path.join(__dirname,'../scripts/orientation.css'),'utf8');
  const rule=css.match(/body\.virtual-landscape\s*\{([^}]+)\}/)[1];
  const declarations=Object.fromEntries([...rule.matchAll(/--safe-(top|right|bottom|left):env\(safe-area-inset-(top|right|bottom|left)\)/g)].map(match=>[match[1],match[2]]));
  const normals={top:[0,-1],right:[1,0],bottom:[0,1],left:[-1,0]};
  for(const [edge,[x,y]] of Object.entries(normals)) {
    // CSS positive 90° maps (x,y) to (-y,x) in downward-positive screen axes.
    const turned=[-y,x];
    const physicalEdge=Object.keys(normals).find(name=>normals[name][0]===turned[0]&&normals[name][1]===turned[1]);
    assert.equal(declarations[edge],physicalEdge,`${edge} must protect the ${physicalEdge} physical edge`);
  }
});

test('a host that already consumes the safe area overrides every child inset to zero', () => {
  const css=fs.readFileSync(path.join(__dirname,'../scripts/orientation.css'),'utf8');
  const rule=css.match(/body\.host-display-managed\s*\{([^}]+)\}/)[1];
  assert.ok(css.indexOf('body.host-display-managed')>css.indexOf('body.virtual-landscape'));
  for(const edge of ['top','right','bottom','left']) assert.match(rule,new RegExp(`--safe-${edge}:0px(?:;|$)`));
});
