'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const app=require('../scripts/app-mode.js');
function iphone(extra={}){return {navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',maxTouchPoints:5},document:{},matchMedia:()=>({matches:false}),...extra};}
test('Safari on iPhone without element fullscreen needs Home Screen, not a false fullscreen claim',()=>{
  assert.equal(app.needsHomeScreen(iphone(),{}),true);
  assert.equal(app.needsHomeScreen(iphone({document:{fullscreenEnabled:false}}),{requestFullscreen(){}}),true);
});
test('installed iOS and manifest display modes already have no browser bars',()=>{
  for(const win of [iphone({navigator:{standalone:true,userAgent:'iPhone'}}),iphone({matchMedia:q=>({matches:q==='(display-mode: standalone)'})})]){
    assert.equal(app.installed(win),true);assert.equal(app.needsHomeScreen(win,{}),false);
  }
});
test('native capable Apple devices and desktop retain fullscreen',()=>{
  assert.equal(app.needsHomeScreen(iphone(),{requestFullscreen(){}}),false);
  assert.equal(app.needsHomeScreen(iphone(),{webkitRequestFullscreen(){}}),false);
  assert.equal(app.needsHomeScreen(iphone({navigator:{userAgent:'Chrome Android'}}),{}),false);
  assert.equal(app.appleMobile(iphone({navigator:{platform:'MacIntel',maxTouchPoints:5}})),true);
  assert.equal(app.appleMobile(iphone({navigator:{platform:'MacIntel',maxTouchPoints:0}})),false);
});
test('installation URL keeps a room, not embedded sizing or arbitrary navigation parameters',()=>{
  assert.equal(app.installationURL('https://example.test/game/Gioca.html?room=ABC123&embed=1&hostdisplay=1&redirect=https://evil.test/#x'),'https://example.test/game/app.html?room=ABC123');
  assert.equal(app.installationURL('https://example.test/game/Gioca.html?room=%3Cscript%3E'),'https://example.test/game/app.html');
});
test('Home Screen launch targets the standalone game without an orientation lock',()=>{
  const root=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest')));
  assert.equal(manifest.orientation,'any');assert.equal(manifest.display,'standalone');
  const launch=new URL(manifest.start_url,'https://example.test/game/');
  assert.equal(launch.pathname,'/game/Gioca.html');assert.equal(launch.searchParams.get('standalone'),'1');
  for(const file of ['app.html','Gioca.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(html,/name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(html,/rel="manifest" href="manifest.webmanifest"/);
  }
  for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(root,icon.src)));
});
