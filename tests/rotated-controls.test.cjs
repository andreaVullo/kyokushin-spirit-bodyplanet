'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
require('../scripts/orientation.js');
const {DojoControls}=require('../scripts/mobile-controls.js');

function classes(initial=[]){
  const values=new Set(initial);
  return {contains:name=>values.has(name),toggle(name,on){if(on===undefined)on=!values.has(name);on?values.add(name):values.delete(name);return on;}};
}
function style(){const values=new Map();return {setProperty:(name,value)=>values.set(name,value),getPropertyValue:name=>values.get(name)||''};}
function fixture(rotated){
  const events=[],buttons=[];
  const document={body:{classList:classes(rotated?['virtual-landscape']:[])},addEventListener(){},removeEventListener(){},elementFromPoint:()=>null};
  const element={ownerDocument:document,style:style(),dataset:{},classList:classes(),addEventListener(){},removeEventListener(){},querySelectorAll:selector=>selector==='[data-action]'?buttons:[],contains:node=>buttons.includes(node),setPointerCapture(){},releasePointerCapture(){}};
  const joystick={style:style(),classList:classes(),offsetWidth:100,offsetHeight:100,getBoundingClientRect:()=>({left:50,top:100,width:100,height:100}),setAttribute(){}};
  const controls=new DojoControls({element,setInput:(player,action,pressed,meta)=>events.push({player,action,pressed,phase:meta.phase})});
  const event=(x,y,pointerId=1)=>({clientX:100+x,clientY:150+y,pointerId,pointerType:'touch',preventDefault(){}});
  function addButton(action){const button={dataset:{action},classList:classes(),disabled:false,setAttribute(){},closest:selector=>selector==='[data-action]'?button:null};buttons.push(button);return button;}
  return {controls,events,document,element,joystick,event,addButton};
}

test('virtual clockwise cabinet: screen down means local right and screen up means local left',()=>{
  const f=fixture(true);
  f.controls._joystickDown(f.event(0,35),f.joystick);
  assert.equal(f.events[0].action,'right');assert.equal(f.events[0].pressed,true);
  assert.equal(Number.parseFloat(f.joystick.style.getPropertyValue('--stick-x'))>0,true);
  f.controls._move(f.event(0,-35));
  assert.deepEqual(f.events.map(({action,pressed})=>({action,pressed})),[{action:'right',pressed:true},{action:'right',pressed:false},{action:'left',pressed:true}]);
  assert.equal(f.events.at(-1).phase,'move');
  f.controls._end(f.event(0,-35),'up');
  assert.equal(f.events.at(-1).pressed,false);
  assert.equal(f.joystick.style.getPropertyValue('--stick-x'),'0px');
});

test('virtual clockwise cabinet: screen right means local up/jump without sideways movement',()=>{
  const f=fixture(true);
  f.controls._joystickDown(f.event(35,0),f.joystick);
  assert.deepEqual(f.events.map(({action,pressed})=>({action,pressed})),[{action:'jump',pressed:true}]);
  assert.equal(Number.parseFloat(f.joystick.style.getPropertyValue('--stick-y'))<0,true);
  f.controls._move(f.event(0,0));
  assert.equal(f.events.at(-1).action,'jump');assert.equal(f.events.at(-1).pressed,false);
});

test('native landscape and host-rotated iframes keep local right and local up input axes',()=>{
  const f=fixture(false);
  f.controls._joystickDown(f.event(35,-35),f.joystick);
  assert.deepEqual(f.events.map(({action,pressed})=>({action,pressed})),[{action:'right',pressed:true},{action:'jump',pressed:true}]);
  assert.equal(Number.parseFloat(f.joystick.style.getPropertyValue('--stick-x'))>0,true);
  assert.equal(Number.parseFloat(f.joystick.style.getPropertyValue('--stick-y'))<0,true);
});

test('neutral, threshold hysteresis and diagonal input work after the CSS turn',()=>{
  const f=fixture(true);
  f.controls._joystickDown(f.event(0,0),f.joystick);
  assert.equal(f.events.length,0);
  f.controls._move(f.event(30,30));
  assert.deepEqual(f.events.map(({action,pressed})=>({action,pressed})),[{action:'right',pressed:true},{action:'jump',pressed:true}]);
  f.controls._move(f.event(16,10));
  assert.equal(f.events.length,2);
  f.controls._move(f.event(0,0));
  assert.deepEqual(f.events.slice(2).map(({action,pressed})=>({action,pressed})),[{action:'right',pressed:false},{action:'jump',pressed:false}]);
});

test('clearing before an orientation switch releases every held direction and resets the stick',()=>{
  const f=fixture(true);
  f.controls._joystickDown(f.event(35,35),f.joystick);
  f.controls.clear();
  assert.equal(f.controls.pointers.size,0);assert.equal(f.controls.actions.size,0);
  assert.equal(f.events.filter(event=>event.pressed).length,2);
  assert.equal(f.events.filter(event=>!event.pressed).length,2);
  f.document.body.classList.toggle('virtual-landscape',false);
  f.controls._joystickDown(f.event(-35,0),f.joystick);
  assert.equal(f.events.at(-1).action,'left');assert.equal(f.events.at(-1).pressed,true);
});

test('action-button drag hit testing keeps physical client coordinates under CSS rotation',()=>{
  const f=fixture(true),first=f.addButton('tsuki'),second=f.addButton('mae');
  f.controls._down({...f.event(8,12,2),target:first});
  let sampled;
  f.document.elementFromPoint=(x,y)=>{sampled={x,y};return second;};
  f.controls._move(f.event(24,28,2));
  assert.deepEqual(sampled,{x:124,y:178});
  assert.deepEqual(f.events.map(({action,pressed})=>({action,pressed})),[{action:'tsuki',pressed:true},{action:'tsuki',pressed:false},{action:'mae',pressed:true}]);
});

test('a second finger can attack while a rotated joystick holds movement',()=>{
  const f=fixture(true),attack=f.addButton('tsuki');
  f.controls._joystickDown(f.event(0,35,1),f.joystick);
  f.controls._down({...f.event(0,0,2),target:attack});
  f.controls._end(f.event(0,0,2),'up');
  assert.equal(f.controls.actions.has('0:right'),true);
  assert.equal(f.controls.actions.has('0:tsuki'),false);
  f.controls.clear();
  assert.equal(f.controls.actions.size,0);
});
