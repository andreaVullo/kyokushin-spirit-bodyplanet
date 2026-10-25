/* main.js */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const pageOptions = new URLSearchParams(location.search);
  const standaloneGame = pageOptions.get('standalone') === '1' && window.self === window.top;
  const touchMedia = window.matchMedia('(any-pointer: coarse)');
  const portraitMedia = window.matchMedia('(orientation: portrait)');
  let touchPreference = pageOptions.get('touch') === '1' ? true : null;
  let touchDetected = touchMedia.matches || navigator.maxTouchPoints > 0;
  let viewportFrame = 0, viewportSettleTimer = 0, lastLayoutGeometry = null;
  document.body.classList.toggle('standalone-game', standaloneGame);
  document.body.classList.toggle('embedded', standaloneGame || pageOptions.get('embed') === '1' || window.self !== window.top);
  const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
  const characters = { ...(window.KyokushinRoster || {
    angelo: { name: 'ANGELO PIERINO', rank: 'SENSEI · III DAN', short: 'ANGELO', belt: 'CINTURA NERA · 3 STRISCE', beltColor: 'black' },
    samuel: { name: 'SAMUEL VILLANI', rank: 'SENPAI · 1 KYU', short: 'SAMUEL', belt: 'CINTURA MARRONE · 1 STRISCIA NERA', beltColor: 'brown' }
  }) };
  const rosterIds = Object.keys(characters);
  const config = { player: 'angelo', opponent: 'samuel', mode: 'cpu', difficulty: 'normal' };
  let regularConfig = { ...config }, arcadeRun = null, arcadeMatch = null, arcadeStats = null, arcadePreviewToken = 0;
  let selectionTarget = 'player', matchLoading = false, matchLoadId = 0, selectionError = '';
  const bg = new Image(); bg.src = window.__kyokushinAsset("assets/dojo-mirror.png");
  let ready = false, active = false, paused = false, lastTime = performance.now(), clock = 0;
  let screen = 'title', versusTimeout = null, transitionId = 0, loadFailed = false;
  const heldKeys = new Map();
  let shake = 0, flash = 0, toastTime = 0, resultShown = false, resultTimer = 0;
  let particles = [], rings = [], floatTexts = [], lastHud = '';
  const comboDisplay = [0, 1].map(() => ({ count: 0, damage: 0, moves: [], life: 0 }));
  const defenseModels = [
    {id:'angelo',x:200,y:247,facing:1,state:'block',guardType:'arms',blocking:true},
    {id:'angelo',x:200,y:247,facing:1,state:'legBlock',guardType:'leg',legBlocking:true,blocking:true}
  ];
  const motionModels = [
    {id:'angelo',x:110,y:264,facing:1,state:'walk',walkCycle:0},
    {id:'angelo',x:200,y:264,facing:1,state:'idle',move:null,moveProgress:0,scale:.76}
  ];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sound = new window.DojoAudio();
  let lastAudioButtonState = '';
  function audioState() { return {scene:screen,paused:paused||!!document.querySelector('dialog[open]'),phase:game.getState().phase,visible:!document.hidden}; }
  function syncAudioButton() {
    const on=sound.enabled&&sound.status.ready;
    const state=on?'playing':sound.enabled?'waiting':'muted';
    if(state===lastAudioButtonState)return;
    lastAudioButtonState=state;
    for(const id of ['sound-button','mobile-sound-button']){
      const button=$(id);if(!button)continue;
      const label=button.querySelector('span');if(label)label.textContent=on?'AUDIO ON':sound.enabled?'ATTIVA AUDIO':'AUDIO OFF';
      button.setAttribute('aria-label',on?'Disattiva musica ed effetti':'Attiva musica ed effetti');
      button.title=on?'Disattiva musica ed effetti':'Attiva musica ed effetti';
      button.setAttribute('aria-pressed',String(on));
      button.classList.toggle('muted',!on);
      button.dataset.audioState=state;
    }
  }
  function toast(text, player=0) { $('move-toast').textContent=text;$('move-toast').style.left=player===0?'4%':'auto';$('move-toast').style.right=player===1?'4%':'auto';$('move-toast').classList.add('show');toastTime=1.05; }
  function burst(x,y,color,count=18,power=1) {
    for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=(80+Math.random()*310)*power;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,life:.2+Math.random()*.3,max:.5,color,size:2+Math.random()*4});}
    rings.push({x,y,r:8,life:.24,max:.24,color});
  }
  function onEvent(e) {
    if(!active)return;
    window.ArcadeVFX?.emit(e);
    if(arcadeRun && arcadeStats){
      if(e.type==='hit' && e.player===0){arcadeStats.hits++;arcadeStats.maxCombo=Math.max(arcadeStats.maxCombo,e.combo||1);}
      if(e.type==='block' && e.target===0)arcadeStats.blocks++;
    }
    if(e.type!=='announcement')sound.effect(e.type,{...e,special:e.move==='kaiten'});
    if(e.type==='hit'){
      const special=e.move==='kaiten',col=special?'#80ffff':'#fff1b4';burst(e.x,e.y,col,special?35:19,special?1.4:1);shake=special?12:6;flash=special?.16:.055;
      const display=comboDisplay[e.player];
      display.count=e.combo;display.damage=e.comboDamage;display.moves=[...(game.getState().fighters[e.player].comboMoves||[e.move])];display.life=1.1;
      floatTexts.push({x:e.x,y:e.y-45,text:e.damage?'-'+Math.round(e.damage):'OSU!',life:.65,max:.65,color:'#fff8cf'});
    } else if(e.type==='block'){burst(e.x,e.y,e.guardType==='leg'?'#f7d17e':'#9ae5f0',11,.65);toast(e.guardType==='leg'?'PARATA DI GAMBA':'PARATA DI BRACCIA',e.target ?? 1-e.player);}
    else if(e.type==='special'){toast('KAITEN GERI',e.player);flash=.13;}
    else if(e.type==='noKi'){toast('SERVONO 45 SPIRIT',e.player);}
    else if(e.type==='ko'){shake=15;}
    else if(e.type==='land'){burst(e.x,e.y,'#f8d6a0',e.heavy?12:5,.25);}
    else if(e.type==='dash'){burst(e.x,e.y-3,e.back?'#bde9ee':'#ffe0a0',11,.22);}
  }
  const game = new window.KyokushinGame({onEvent});
  const controls = new window.DojoControls({
    element: $('touch-controls'),
    setInput: (player,action,pressed,meta)=>game.setInput(player,action,pressed,{allowDash:meta?.phase!=='move'}),
    canPlay: ()=>screen==='game'&&active&&!paused&&!resultShown&&!document.body.classList.contains('orientation-blocked')&&!document.querySelector('dialog[open]'),
    onTouch: ()=>{if(!touchDetected){touchDetected=true;syncControlSurface();}}
  });
  const display = new window.DojoDisplay({
    element: $('game-shell'), hostOrigin: displayHostOrigin(),
    onInputReset: clearCombatInput,
    onChange: ()=>{syncFullscreenButton();syncControlSurface();viewportChanged();}
  });
  const arcadeUI = new window.ArcadeUI({
    onCreate: beginArcade, onBack: ()=>showTitle(), onLeaderboard: openLeaderboard,
    onRetry: loadArcadePreview
  });
  function syncLandscapeLayout(){
    const viewport=window.visualViewport;
    const layout=window.DojoOrientation.resolve({
      touchEnabled:touchPreference??touchDetected,
      landscapeRequested:display.requested,hostManaged:display.hostManaged||display.hostPending,
      width:window.innerWidth,height:window.innerHeight,
      visualWidth:viewport?.width,visualHeight:viewport?.height,
      offsetLeft:viewport?.offsetLeft,offsetTop:viewport?.offsetTop
    });
    const root=document.documentElement;
    for(const [name,value] of Object.entries({
      'view-width':layout.width,'view-height':layout.height,'view-left':layout.left,'view-top':layout.top,
      'layout-width':layout.logicalWidth,'layout-height':layout.logicalHeight
    }))root.style.setProperty('--'+name,value+'px');
    document.body.classList.toggle('landscape-requested',display.requested);
    document.body.classList.toggle('virtual-landscape',layout.virtual);
    document.body.classList.toggle('host-display-managed',display.hostManaged);
    $('arcade').classList.toggle('expanded',display.requested);
    const geometry=[layout.logicalWidth,layout.logicalHeight,layout.virtual].join(':');
    if(lastLayoutGeometry!==null&&geometry!==lastLayoutGeometry)clearCombatInput();
    lastLayoutGeometry=geometry;
    document.body.classList.toggle('landscape-layout',layout.logicalWidth>layout.logicalHeight&&(layout.logicalHeight<=650||(touchPreference??touchDetected)||display.requested));
    document.body.classList.toggle('landscape-tiny',layout.logicalHeight<=330);
    document.body.classList.toggle('landscape-short',layout.logicalWidth>layout.logicalHeight&&layout.logicalHeight<=380);
    document.body.dataset.orientationMode=layout.blocked?'portrait':layout.virtual?'virtual':display.hostManaged?'host':'native';
    return layout;
  }
  function syncControlSurface(){
    const layout=syncLandscapeLayout();
    const enabled=touchPreference??touchDetected;
    const rotate=layout.blocked;
    const wasBlocked=document.body.classList.contains('orientation-blocked');
    document.body.classList.toggle('orientation-blocked',rotate);
    document.body.classList.toggle('touch-active',enabled);
    document.body.classList.toggle('force-touch',touchPreference===true);
    document.body.classList.toggle('touch-disabled',touchPreference===false);
    document.body.classList.toggle('combat-paused',paused);
    document.body.classList.toggle('match-complete',resultShown);
    const playable=screen==='game'&&active&&!paused&&!resultShown&&enabled&&!rotate;
    $('touch-controls').inert=!playable;
    $('touch-controls').setAttribute('aria-hidden',String(!playable));
    $('viewport').inert=rotate;
    document.querySelector('.arena-topline').inert=rotate;
    if($('rotate-screen')){$('rotate-screen').inert=!rotate;$('rotate-screen').setAttribute('aria-hidden',String(!rotate));}
    if(rotate&&!wasBlocked)requestAnimationFrame(()=>$('rotate-fullscreen-button')?.focus({preventScroll:true}));
    if(!rotate&&wasBlocked)requestAnimationFrame(()=>(paused?$('resume-button'):screen==='title'?$('title-start-button'):screen==='select'?$('start-button'):canvas)?.focus({preventScroll:true}));
    const toggle=$('touch-toggle-button');
    if(toggle){toggle.setAttribute('aria-pressed',String(enabled));toggle.setAttribute('aria-label',enabled?'Nascondi comandi touch':'Mostra comandi touch');toggle.title=enabled?'Nascondi comandi touch':'Mostra comandi touch';}
    if(screen==='game')$('stage-tip').textContent=enabled?'JOYSTICK: MUOVI · 2× SCATTO · SWITCH: TECNICHE':'2× A/D: DASH · INDIETRO: PARATA · F: GINOCCHIO';
    if(rotate&&active&&!paused&&!resultShown)togglePause(true);
  }
  // Exposed for automated smoke tests and deterministic bug reports.
  window.dojo = { game, config, start:()=>beginVersus(), startMatch, menu:showSelection, title:showTitle, get screen(){return screen;}, get active(){return active;}, get ready(){return ready;} };

  function showPanel(id, visible) {
    const panel = $(id);
    if(!panel)return;
    panel.hidden = !visible;
    panel.inert = !visible;
    panel.classList.toggle('hidden', !visible);
    panel.setAttribute('aria-hidden', String(!visible));
  }
  function clearCombatInput() {
    controls.clear();game.clearInput();heldKeys.clear();
  }
  function setScreen(next, focusId) {
    clearTimeout(versusTimeout);versusTimeout=null;transitionId++;
    screen=next;document.body.dataset.screen=next;
    for(const front of ['title','select','versus','create'])document.body.classList.toggle('front-'+front,next===front);
    document.body.classList.toggle('playing',next==='game');
    showPanel('title-screen',next==='title');showPanel('selection-panel',next==='select');showPanel('versus-screen',next==='versus');showPanel('arcade-create',next==='create');
    $('versus-screen').tabIndex=-1;
    canvas.tabIndex=next==='game'?0:-1;
    $('pause-button').disabled=next!=='game';
    syncControlSurface();
    const hints=next==='title'?[['INVIO','INIZIA']]:next==='create'?[['INVIO','CREA'],['ESC','TITOLO']]:next==='select'?[['← →','SCEGLI'],['↑ ↓','P1 / AVVERSARIO'],['INVIO','COMBATTI']]:next==='versus'?[['ESC','ANNULLA']]:[['ESC','PAUSA'],['F','GINOCCHIO']];
    $('bottom-hint').replaceChildren();
    hints.forEach(([key,label],i)=>{
      if(i){const divider=document.createElement('span');divider.className='hint-divider';divider.textContent='/';$('bottom-hint').append(divider);}
      const kbd=document.createElement('kbd');kbd.textContent=key;$('bottom-hint').append(kbd,document.createTextNode(' '+label+' '));
    });
    if(focusId)requestAnimationFrame(()=>{if(screen===next)$(focusId)?.focus({preventScroll:true});});
  }
  function clearMatchPresentation() {
    window.ArcadeVFX?.clear();
    resultShown=false;resultTimer=0;particles=[];floatTexts=[];rings=[];shake=0;flash=0;
    comboDisplay.forEach(c=>{c.life=0;c.count=0;c.damage=0;c.moves=[];});
    toastTime=0;$('move-toast').classList.remove('show');$('move-toast').textContent='';
    $('announcer').replaceChildren();lastHud='';
    showPanel('pause-panel',false);showPanel('result-panel',false);
  }
  function opponentId() {return config.opponent || (config.player==='angelo'?'samuel':'angelo');}
  function opponentTag() {return config.mode==='versus'?'GIOCATORE 02':config.mode==='training'?'PARTNER':'CPU';}
  function modeName() {return arcadeRun?'ARCADE':config.mode==='versus'?'2 GIOCATORI':config.mode==='training'?'ALLENAMENTO':'VS CPU';}
  function cancelMatchLoading() {
    matchLoadId++;matchLoading=false;selectionError='';
    arcadeUI.setBusy(false);
    syncSelectionControls();
  }
  function syncSelectionControls() {
    $('selection-panel').setAttribute('aria-busy',String(matchLoading));
    $('start-button').disabled=!ready||matchLoading;
    $('start-label').textContent=matchLoading?'CARICO…':selectionError?'RIPROVA':'COMBATTI';
    document.querySelectorAll('[data-fighter],[data-selection-target],[data-mode]').forEach(button=>button.disabled=matchLoading);
    $('difficulty').disabled=matchLoading||config.mode!=='cpu';
  }
  function setSelectionTarget(target) {
    if(screen!=='select'||matchLoading||!['player','opponent'].includes(target))return;
    selectionTarget=target;selectionError='';updateSelection();sound.effect('menuMove');
  }
  function buildRoster() {
    const panel=$('selection-panel');panel.classList.add('expanded-roster');
    panel.setAttribute('aria-label','Selezione karateka e avversario');
    const heading=panel.querySelector('.select-heading h2');if(heading)heading.textContent='SCEGLI LA TUA SFIDA';
    const instruction=panel.querySelector('.roster-instruction');
    instruction.replaceChildren();
    const targets=document.createElement('div');targets.className='roster-targets';targets.setAttribute('role','group');targets.setAttribute('aria-label','Chi vuoi scegliere?');
    for(const [target,label] of [['player','1P · IL TUO KARATEKA'],['opponent','CPU · AVVERSARIO']]){
      const button=document.createElement('button');button.type='button';button.dataset.selectionTarget=target;button.textContent=label;
      button.addEventListener('click',()=>setSelectionTarget(target));targets.append(button);
    }
    instruction.append(targets);
    const hint=document.createElement('small');hint.textContent='← → SCEGLI · ↑ ↓ CAMBIA LATO';instruction.append(hint);
    const grid=panel.querySelector('.fighter-select');grid.replaceChildren();
    for(const [id,character] of Object.entries(characters)){
      const button=document.createElement('button');button.type='button';button.className='fighter-option';button.dataset.fighter=id;
      button.setAttribute('aria-label','Scegli '+character.name+(character.variant?' · '+character.variant:'')+', '+character.belt);
      const art=document.createElement('canvas');art.width=300;art.height=260;art.dataset.rosterPortrait=id;art.setAttribute('aria-hidden','true');
      const name=document.createElement('span');name.className='roster-name';
      const words=character.name.split(' '),first=document.createElement('span'),surname=document.createElement('strong');first.textContent=words.shift();surname.textContent=words.join(' ');name.append(first,surname);
      const detail=document.createElement('small');detail.textContent=character.variant||character.rank;name.append(detail);
      const cursor=document.createElement('span');cursor.className='roster-cursor';cursor.setAttribute('aria-hidden','true');
      button.append(art,name,cursor);grid.append(button);
    }
    for(const [selector,target] of [['.showcase-p1','player'],['.showcase-p2','opponent']]){
      const card=panel.querySelector(selector),button=document.createElement('button');button.type='button';button.className='change-fighter';button.dataset.selectionTarget=target;
      button.textContent='CAMBIA';button.setAttribute('aria-label',target==='player'?'Cambia il tuo karateka':'Cambia avversario');button.addEventListener('click',()=>setSelectionTarget(target));card.append(button);
    }
    const titleNote=document.querySelector('.title-note');
    if(titleNote)for(const node of titleNote.childNodes)if(node.nodeType===Node.TEXT_NODE&&node.textContent.includes('FIGHTERS'))node.textContent=' '+rosterIds.length+' FIGHTERS. ONE DOJO.';
  }
  function portrait(id, fighter, facing, bust=false) {
    const surface=typeof id==='string'?$(id):id;
    if(!surface||!ready||!window.FighterArt)return;
    const p=surface.getContext('2d');p.clearRect(0,0,surface.width,surface.height);
    if(window.FighterArt.drawSelectionPortrait)window.FighterArt.drawSelectionPortrait(p,fighter,0,0,surface.width,surface.height,{facing,bust});
    else window.FighterArt.drawPortrait(p,fighter,0,0,surface.width,surface.height);
  }
  function drawFrontPortraits() {
    portrait('title-angelo','angelo',1);portrait('title-samuel','samuel',-1);
    portrait('select-p1-art',config.player,1);portrait('select-p2-art',opponentId(),-1);
    portrait('versus-p1-art',config.player,1);portrait('versus-p2-art',opponentId(),-1);
    document.querySelectorAll('[data-roster-portrait]').forEach(surface=>portrait(surface,surface.dataset.rosterPortrait,1,true));
  }
  function updateSelection() {
    const ids=[config.player,opponentId()];
    ids.forEach((id,i)=>{
      const character=characters[id],prefix='select-p'+(i+1);
      $(prefix+'-name').textContent=character.name;$(prefix+'-rank').textContent=character.rank+(character.variant?' · '+character.variant:'');
      const belt=$(prefix+'-belt');belt.textContent=character.belt;belt.dataset.belt=character.beltColor;
      belt.classList.toggle('black',id==='angelo');belt.classList.toggle('brown',id==='samuel');
      $('versus-p'+(i+1)+'-name').textContent=character.name;
      const versusSide=document.querySelector(i===0?'.versus-left>span':'.versus-right>span');
      if(versusSide)versusSide.textContent=(i===0?'GIOCATORE 01':opponentTag())+(character.variant?' · '+character.variant:'');
    });
    $('select-p2-tag').textContent=opponentTag();$('versus-tag').textContent=modeName();
    const selectedCharacter=characters[config[selectionTarget]];
    $('selection-status').textContent=matchLoading?'CARICO LE MOSSE DEI KARATEKA…':selectionError||((selectionTarget==='player'?'1P':'AVVERSARIO')+' · '+selectedCharacter.name+(selectedCharacter.variant?' · '+selectedCharacter.variant:'')+' · '+modeName());
    $('selection-status').classList.toggle('load-error',!!selectionError);
    document.querySelectorAll('[data-fighter]').forEach(button=>{
      const id=button.dataset.fighter,selected=id===config[selectionTarget],p1=id===config.player,p2=id===opponentId();
      button.classList.toggle('selected',selected);button.classList.toggle('chosen-p1',p1);button.classList.toggle('chosen-p2',p2);
      button.setAttribute('aria-pressed',String(selected));
      const cursor=button.querySelector('.roster-cursor');if(cursor)cursor.textContent=[p1?'1P':'',p2?(config.mode==='versus'?'2P':config.mode==='training'?'PARTNER':'CPU'):''].filter(Boolean).join(' / ');
    });
    document.querySelectorAll('[data-selection-target]').forEach(button=>{
      const selected=button.dataset.selectionTarget===selectionTarget;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
      if(button.closest('.roster-targets')&&button.dataset.selectionTarget==='opponent')button.textContent=(config.mode==='versus'?'2P':config.mode==='training'?'PARTNER':'CPU')+' · AVVERSARIO';
    });
    document.querySelector('.showcase-p1').classList.toggle('editing-fighter',selectionTarget==='player');
    document.querySelector('.showcase-p2').classList.toggle('editing-fighter',selectionTarget==='opponent');
    document.querySelectorAll('[data-mode]').forEach(button=>{const selected=button.dataset.mode===config.mode;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
    syncSelectionControls();
    drawFrontPortraits();
  }
  function resetPreview() {
    active=false;paused=false;clearCombatInput();clearMatchPresentation();
    game.start(config);game.pause(true);setNames();
    $('stage-tip').textContent='CATANIA, ITALIA ●';
  }
  function showTitle(focus=true) {
    leaveArcade();arcadePreviewToken++;
    cancelMatchLoading();
    if(ready&&screen!=='title')sound.effect('menuBack');
    resetPreview();setScreen('title',focus?'title-start-button':null);
    $('status-label').textContent='IL DOJO TI ASPETTA';
  }
  function showSelection() {
    if(!ready){if(loadFailed)location.reload();return;}
    leaveArcade();arcadePreviewToken++;cancelMatchLoading();resetPreview();updateSelection();setScreen('select','start-button');
    $('status-label').textContent='SCEGLI IL TUO KARATEKA';
    sound.init();sound.effect('menuConfirm');
  }
  function selectFighter(id) {
    if(screen!=='select'||matchLoading||!characters[id])return;
    if(config[selectionTarget]!==id){
      config[selectionTarget]=id;selectionError='';game.start(config);game.pause(true);setNames();updateSelection();
      sound.effect('menuMove');
    }
  }
  function leaveArcade() {
    if(arcadeRun){
      if(!arcadeRun.getState().finished)arcadeRun.finish();
      Object.assign(config,regularConfig);
    }
    arcadeRun=null;arcadeMatch=null;arcadeStats=null;
    arcadeUI.showRun(null);arcadeUI.showResult(null);
    $('restart-button').hidden=false;$('menu-button').textContent='SCELTA PERSONAGGIO';
    $('rematch-button').textContent='RIVINCITA ↗';$('rematch-button').disabled=false;
    $('result-menu-button').textContent='SCELTA PERSONAGGIO';
  }
  function openLeaderboard() {
    showDialog('leaderboard-dialog');arcadeUI.loadLeaderboard();
  }
  function showArcadeCreator() {
    if(!ready)return;
    leaveArcade();regularConfig={...config};cancelMatchLoading();resetPreview();
    setScreen('create','arcade-name');$('status-label').textContent='ARCADE · CREA IL TUO KARATEKA';
    sound.init();sound.effect('menuConfirm');loadArcadePreview();
  }
  async function loadArcadePreview() {
    const token=++arcadePreviewToken;
    arcadeUI.setLoading('loading');
    try {
      await window.ArcadeArt.load();
      if(token!==arcadePreviewToken||screen!=='create')return;
      arcadeUI.setLoading('ready');
    } catch(error) {
      if(token!==arcadePreviewToken||screen!=='create')return;
      console.error('Arcade artwork loading failed',error);
      arcadeUI.setLoading('error','Non riesco a caricare le immagini. Premi Riprova.');
    }
  }
  function applyArcadeCharacter() {
    const state=arcadeRun.getState(),profile=state.character,rank=state.rank;
    game.registerArcadeCharacter(profile);
    characters['arcade-player']={name:profile.name.toLocaleUpperCase('it'),short:profile.name.toLocaleUpperCase('it'),rank:rank.label,belt:rank.belt,beltColor:rank.beltColor};
    window.ArcadeArt.setCharacter({id:'arcade-player',...profile,hair:profile.hairstyle,rank});
  }
  function beginArcade(profile) {
    if(matchLoading||screen!=='create')return;
    arcadeRun=window.DojoArcade.createRun({...profile,rosterIds});
    applyArcadeCharacter();prepareArcadeMatch();
  }
  async function prepareArcadeMatch() {
    if(!arcadeRun||arcadeRun.getState().finished||matchLoading)return;
    const run=arcadeRun;arcadeMatch=run.nextMatch();
    applyArcadeCharacter();
    Object.assign(config,{player:'arcade-player',opponent:arcadeMatch.opponent,mode:'cpu',difficulty:arcadeMatch.difficulty});
    active=false;paused=false;clearCombatInput();game.pause(true);
    matchLoading=true;arcadeUI.setBusy(true);$('rematch-button').disabled=true;
    const requestId=++matchLoadId,screenToken=transitionId;
    sound.init();
    try {
      await Promise.all([window.FighterArt.loadFighters([config.player,config.opponent]),window.ArcadeVFX?.load()]);
      if(requestId!==matchLoadId||arcadeRun!==run||transitionId!==screenToken)return;
      matchLoading=false;arcadeUI.setBusy(false);$('rematch-button').disabled=false;
      clearMatchPresentation();game.start(config);game.pause(true);setNames();updateSelection();
      $('versus-tag').textContent='ARCADE · SFIDA '+arcadeMatch.number+'/20 · VERSO '+arcadeMatch.targetRank.label;
      setScreen('versus','versus-screen');arcadeUI.showRun(run.getState(),arcadeMatch);
      $('status-label').textContent='ARCADE · '+run.getState().rank.label+' → '+arcadeMatch.targetRank.label;
      const token=transitionId;versusTimeout=setTimeout(()=>{if(screen==='versus'&&transitionId===token&&arcadeRun===run)startMatch();},1500);
    } catch(error) {
      if(requestId!==matchLoadId||arcadeRun!==run||transitionId!==screenToken)return;
      console.error('Arcade challenge loading failed',error);matchLoading=false;
      arcadeUI.setBusy(false,'Non riesco a caricare la sfida. Premi di nuovo per riprovare.');
      $('rematch-button').disabled=false;
      if(screen!=='create')$('result-text').textContent='Caricamento interrotto. La scalata è ancora qui: premi Prossima sfida per riprovare.';
      $('status-label').textContent='CARICAMENTO DA RIPROVARE';
    }
  }
  function showArcadeResult() {
    const state=game.getState(),player=state.fighters[0],opponent=state.fighters[1];
    const progress=arcadeRun.recordMatch({matchId:arcadeMatch.matchId,winner:state.winner,
      elapsed:Math.max(.01,arcadeStats.elapsed),playerHp:Math.max(0,player.hp),playerMaxHp:player.maxHp,
      playerRounds:player.wins,opponentRounds:opponent.wins,hits:arcadeStats.hits,blocks:arcadeStats.blocks,maxCombo:arcadeStats.maxCombo});
    renderArcadeResult(progress);
  }
  function finishArcade() {
    if(!arcadeRun)return;
    cancelMatchLoading();renderArcadeResult(arcadeRun.finish());
  }
  function renderArcadeResult(progress) {
    resultShown=true;paused=false;game.pause(true);clearCombatInput();showPanel('pause-panel',false);showPanel('result-panel',true);
    $('announcer').replaceChildren();
    $('result-eyebrow').textContent=progress.completed?'LA SCALATA È COMPLETA':progress.finished?'ARCADE · SCALATA CONCLUSA':'OSU! · PROMOZIONE CONQUISTATA';
    $('result-title').textContent=progress.rank.label;
    $('result-text').textContent=progress.completed?'Dieci tacche dorate. Hai portato il tuo spirito fino in cima.':progress.finished?
      (progress.reason==='defeat'?'Il kumite si ferma qui. ':'Hai concluso la tua scalata. ')+progress.character.name+', questo è il tuo risultato finale.':
      progress.rank.belt+'. Il prossimo traguardo è '+progress.nextRank.label+'.';
    $('rematch-button').textContent=progress.finished?'NUOVA SCALATA ↗':'PROSSIMA SFIDA ↗';$('rematch-button').disabled=false;
    $('result-menu-button').textContent=progress.finished?'SCELTA PERSONAGGIO':'TERMINA SCALATA';
    $('status-label').textContent=progress.finished?'ARCADE · RISULTATO FINALE':'ARCADE · PROMOZIONE A '+progress.rank.label;
    arcadeUI.showResult(progress,arcadeRun.finalRecord());arcadeUI.showRun(progress,arcadeMatch);
    sound.effect('victory',{winner:progress.lastMatch?.won?0:1});syncControlSurface();$('rematch-button').focus({preventScroll:true});
  }
  async function beginVersus(duration=1400) {
    if(arcadeRun){if(arcadeRun.getState().finished)showArcadeCreator();else prepareArcadeMatch();return;}
    if(!ready||screen==='versus'||matchLoading)return;
    if(screen!=='select')showSelection();
    sound.init();sound.effect('menuConfirm');config.difficulty=$('difficulty').value;
    active=false;paused=false;clearCombatInput();clearMatchPresentation();game.pause(true);
    matchLoading=true;selectionError='';updateSelection();
    const requestId=++matchLoadId,screenToken=transitionId;
    const fighterIds=[config.player,opponentId()];
    try{
      await Promise.all([window.FighterArt.loadFighters(fighterIds),window.ArcadeVFX?.load()]);
      if(requestId!==matchLoadId||screen!=='select'||transitionId!==screenToken)return;
      matchLoading=false;updateSelection();setScreen('versus','versus-screen');
      $('status-label').textContent='IL KUMITE STA PER INIZIARE';
      const token=transitionId;
      versusTimeout=setTimeout(()=>{if(screen==='versus'&&transitionId===token)startMatch();},duration);
    }catch(error){
      if(requestId!==matchLoadId||screen!=='select'||transitionId!==screenToken)return;
      console.error('Fighter move loading failed',error);matchLoading=false;
      selectionError='NON RIESCO A CARICARE LE MOSSE. PREMI RIPROVA.';
      updateSelection();$('status-label').textContent='CARICAMENTO DA RIPROVARE';$('start-button').focus({preventScroll:true});
    }
  }

  function setNames() {
    const fighters=game.getState().fighters;
    fighters.forEach((f,i)=>{const p='p'+(i+1),c=characters[f.id];$(p+'-name').textContent=c.name;$(p+'-rank').textContent=c.rank+(c.variant?' · '+c.variant:'');});
    $('p2-tag').textContent=config.mode==='versus'?'PLAYER 02':config.mode==='training'?'PARTNER':'CPU';
    $('mode-label').textContent='TURBO 1.30× / '+modeName();
  }
  function updateHud(dt) {
    const s=game.getState();
    s.fighters.forEach((f,i)=>{
      const p='p'+(i+1),hp=Math.max(0,f.hp/f.maxHp*100)+'%';$(p+'-health').style.width=hp;$(p+'-ghost').style.width=hp;$(p+'-ki').style.width=f.ki+'%';
      $(p+'-rounds').textContent=(f.wins>0?'●':'○')+' '+(f.wins>1?'●':'○');$(p+'-ki-label').textContent=f.ki>=45?'KAITEN READY':'SPIRIT';$(p+'-ki-label').classList.toggle('ready',f.ki>=45);
      const display=comboDisplay[i],comboEl=$(p+'-combo');
      if(!paused)display.life=Math.max(0,display.life-dt);
      const showCombo=active&&!resultShown&&display.count>=2&&display.life>0;
      comboEl.classList.toggle('visible',showCombo);comboEl.setAttribute('aria-hidden',!showCombo);
      $(p+'-combo-count').textContent=display.count;
      $(p+'-combo-moves').textContent=display.moves.map(m=>window.KyokushinMoves[m]?.shortName||m.toUpperCase()).join(' › ');
      $(p+'-combo-damage').textContent=display.damage+' DANNI';
    });
    $('timer').textContent=s.timer===Infinity?'∞':Math.ceil(s.timer).toString().padStart(2,'0');
    $('round-label').textContent=config.mode==='training'?'TRAINING':'ROUND '+s.round.toString().padStart(2,'0');
    const ann=active&&!paused&&!resultShown?(s.announcement||''):'';
    if(ann!==lastHud){lastHud=ann;$('announcer').replaceChildren();if(ann){$('announcer').append(document.createTextNode(ann));const small=document.createElement('small');small.textContent=s.announcementSub||'';$('announcer').append(small);}}
    if(active&&!paused&&s.phase==='matchOver'&&!resultShown){resultTimer+=dt;if(resultTimer>1.7)showResult();}
  }
  function startMatch() {
    if(!ready)return;
    sound.init();clearCombatInput();clearMatchPresentation();active=true;paused=false;
    if(!arcadeRun)config.difficulty=$('difficulty').value;
    if(arcadeRun)arcadeStats={elapsed:0,hits:0,blocks:0,maxCombo:0};
    game.start(config);setNames();
    $('restart-button').hidden=!!arcadeRun;
    $('menu-button').textContent=arcadeRun?'TERMINA SCALATA':'SCELTA PERSONAGGIO';
    setScreen('game','game');$('status-label').textContent=arcadeRun?'ARCADE · VERSO '+arcadeMatch.targetRank.label:config.mode==='training'?'ALLENAMENTO LIBERO':'KUMITE IN CORSO';
    arcadeUI.showRun(arcadeRun?.getState(),arcadeMatch);
    syncControlSurface();canvas.focus({preventScroll:true});
    if(window.innerWidth<700&&!document.body.classList.contains('embedded'))$('arcade').scrollIntoView({behavior:'instant',block:'start'});
    if(document.hidden||document.querySelector('dialog[open]'))togglePause(true);
  }
  function togglePause(force) {
    if(screen!=='game'||!active||resultShown)return;
    paused=typeof force==='boolean'?force:!paused;sound.effect(paused?'pause':'resume');clearCombatInput();game.pause(paused);showPanel('pause-panel',paused);
    syncControlSurface();
    $('status-label').textContent=paused?'COMBATTIMENTO IN PAUSA':config.mode==='training'?'ALLENAMENTO LIBERO':'KUMITE IN CORSO';
    (paused?$('resume-button'):canvas).focus({preventScroll:true});
  }
  function showResult() {
    if(arcadeRun){showArcadeResult();return;}
    resultShown=true;const s=game.getState(),winner=s.winner;sound.effect('victory',{winner});
    showPanel('result-panel',true);$('announcer').replaceChildren();
    $('result-title').textContent=winner===null?'HIKIWAKE':characters[s.fighters[winner].id].short+' VINCE';
    $('result-eyebrow').textContent=winner===0?'OSU! · LO SPIRITO HA VINTO':'OSU! · OGNI SFIDA È UN INIZIO';
    $('result-text').textContent='ROUND '+s.fighters[0].wins+' — '+s.fighters[1].wins+' · Rispetto al tuo avversario. Ci si rivede sul tatami.';
    $('status-label').textContent='MATCH COMPLETATO';clearCombatInput();syncControlSurface();$('rematch-button').focus({preventScroll:true});
  }

  function drawBackground(t) {
    if(bg.complete&&bg.naturalWidth)ctx.drawImage(bg,0,0,1280,720);else{ctx.fillStyle='#8a7053';ctx.fillRect(0,0,1280,720);}
    // Sparse motes catch the dojo's late-afternoon light.
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<21;i++){const x=(i*163+t*(3+i%5))%1280,y=200+(i*61)%365+Math.sin(t*.5+i)*12;ctx.globalAlpha=.13+Math.sin(t+i)*.08;ctx.fillStyle='#fff0c3';ctx.beginPath();ctx.arc(x,y,.9+(i%3)*.45,0,Math.PI*2);ctx.fill();}ctx.restore();
  }
  function drawFighter(f,t,preview=false) {
    const ground=preview?f.y:625;
    ctx.save();ctx.globalAlpha=.24;ctx.fillStyle='#27172d';ctx.beginPath();ctx.ellipse(f.x,ground+2,preview?76:62,10,0,0,Math.PI*2);ctx.fill();ctx.restore();
    if(window.FighterArt)window.FighterArt.draw(ctx,f,t);
    if(f.state==='attack'&&f.move&&f.moveProgress>.12&&f.moveProgress<.65){
      const p=f.moveProgress,def=window.KyokushinMoves[f.move],kick=['mae','mawashi','ushiro','gedan','kaiten'].includes(f.move);
      if(kick&&f.move!=='kaiten'){ctx.save();ctx.translate(f.x,f.y-120);ctx.scale(f.facing,1);ctx.globalAlpha=Math.sin((p-.12)/.53*Math.PI)*.5;ctx.strokeStyle=f.move==='kaiten'?'#acffff':'#fff2c5';ctx.lineWidth=f.move==='kaiten'?10:4;ctx.beginPath();const r=f.move==='kaiten'?135:110;ctx.arc(15,-15,r,-1.6+p*.8,.15+p*.8);ctx.stroke();ctx.restore();}
    }
  }
  function drawEffects(dt) {
    window.ArcadeVFX?.draw(ctx,dt,{reducedMotion});
    for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=400*dt;ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.fillRect(-p.size*2,-p.size/2,p.size*4,p.size);ctx.restore();}particles=particles.filter(p=>p.life>0);ctx.globalAlpha=1;
    for(const r of rings){r.life-=dt;r.r+=dt*220;ctx.globalAlpha=Math.max(0,r.life/r.max);ctx.strokeStyle=r.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,Math.PI*2);ctx.stroke();}rings=rings.filter(r=>r.life>0);ctx.globalAlpha=1;
    for(const p of floatTexts){p.life-=dt;p.y-=dt*85;ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.font='italic 24px Impact, sans-serif';ctx.textAlign='center';ctx.strokeStyle='#743c2b';ctx.lineWidth=3;ctx.strokeText(p.text,p.x,p.y);ctx.fillStyle=p.color;ctx.fillText(p.text,p.x,p.y);}floatTexts=floatTexts.filter(p=>p.life>0);ctx.globalAlpha=1;
  }
  function drawDefenseGuide(t) {
    if(!ready||!$('help-dialog').open)return;
    ['arms-demo','leg-demo'].forEach((id,i)=>{
      const demo=$(id), dc=demo.getContext('2d'), f=defenseModels[i];
      f.id=config.player;f.walkCycle=i===0?t*8:0;
      dc.clearRect(0,0,demo.width,demo.height);
      dc.fillStyle='#b4ad9766';dc.beginPath();dc.ellipse(200,248,68,8,0,0,Math.PI*2);dc.fill();
      window.FighterArt.draw(dc,f,t);
    });
  }
  function drawMotionGuide(t) {
    if(!ready||!$('help-dialog').open)return;
    const walk=motionModels[0],cycle=t%4.2;
    walk.id=config.player;walk.guardType=null;walk.blocking=false;walk.retreating=false;walk.dashRemaining=0;
    let label='IN GUARDIA';
    if(cycle<1.35){walk.x=110+60*cycle/1.35;walk.state='walk';walk.movement=1;label='PASSO AVANTI';}
    else if(cycle<1.53){walk.dashProgress=(cycle-1.35)/.18;walk.x=170+120*walk.dashProgress;walk.state='dash';walk.dashDirection=1;walk.dashBack=false;walk.dashRemaining=1.53-cycle;label='DOPPIO D · DASH AVANTI';}
    else if(cycle<2.88){walk.x=290-60*(cycle-1.53)/1.35;walk.state='block';walk.movement=-1;walk.retreating=true;walk.blocking=true;walk.guardType='arms';label='ARRETRA IN GUARDIA';}
    else if(cycle<3.08){walk.dashProgress=(cycle-2.88)/.20;walk.x=230-120*walk.dashProgress;walk.state='dash';walk.dashDirection=-1;walk.dashBack=true;walk.dashRemaining=3.08-cycle;label='DOPPIO A · DASH INDIETRO';}
    else {walk.x=110;walk.state='idle';walk.movement=0;}
    if(walk.state==='walk'||walk.retreating)walk.walkCycle=t*12;
    $('walk-demo-caption').textContent=label;
    const kick=motionModels[1],duration=window.KyokushinMoves.kaiten.duration,phase=t%2.5-.5;
    kick.id=config.player;kick.state=phase>=0&&phase<duration?'attack':'idle';kick.move=kick.state==='attack'?'kaiten':null;
    kick.moveProgress=kick.state==='attack'?phase/duration:0;kick.moveTime=Math.max(0,phase);
    $('kaiten-demo-caption').textContent=kick.state==='idle'?'O · 45 SPIRIT':kick.moveProgress<.16?'PREPARAZIONE':kick.moveProgress<.32?'TUFFO':kick.moveProgress<.60?'CALCIO IN ROTAZIONE':kick.moveProgress<.82?'RIENTRO':'ATTERRAGGIO';
    ['walk-demo','kaiten-demo'].forEach((id,i)=>{
      const surface=$(id),dc=surface.getContext('2d'),f=motionModels[i];
      dc.clearRect(0,0,surface.width,surface.height);
      dc.strokeStyle='#c3beaa';dc.lineWidth=1;dc.beginPath();dc.moveTo(12,269);dc.lineTo(388,269);dc.stroke();
      dc.fillStyle='#a99f8260';dc.beginPath();dc.ellipse(f.x,267,i===0?49:62,7,0,0,Math.PI*2);dc.fill();
      window.FighterArt.draw(dc,f,t);
    });
  }
  function frame(now) {
    const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;clock+=dt;
    if(active&&!paused&&!resultShown&&arcadeRun&&arcadeStats&&game.getState().phase==='fight')arcadeStats.elapsed+=dt;
    if(active&&!paused)game.update(dt);
    ctx.save();
    if(shake>0&&!reducedMotion){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake*.55);}shake=Math.max(0,shake-dt*45);
    drawBackground(clock);
    if(active)game.getState().fighters.forEach(f=>drawFighter(f,clock));
    drawEffects(paused?0:dt);ctx.restore();
    if(flash>0){if(!reducedMotion){ctx.globalAlpha=flash;ctx.fillStyle='#fff7ca';ctx.fillRect(0,0,1280,720);ctx.globalAlpha=1;}flash=Math.max(0,flash-dt*.8);}
    if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('move-toast').classList.remove('show');}
    updateHud(dt);drawDefenseGuide(clock);drawMotionGuide(clock);sound.update(audioState());syncAudioButton();requestAnimationFrame(frame);
  }

  const p1={KeyA:'left',KeyD:'right',KeyW:'jump',Space:'block',KeyF:'legBlock',KeyJ:'tsuki',KeyH:'shita',KeyN:'kagi',KeyK:'mae',KeyL:'mawashi',KeyU:'ushiro',KeyI:'gedan',KeyO:'kaiten'};
  const p2={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'jump',ShiftRight:'block',ShiftLeft:'block',Digit0:'legBlock',Numpad0:'legBlock',Digit1:'tsuki',Digit2:'mae',Digit3:'mawashi',Digit4:'ushiro',Digit5:'gedan',Digit6:'kaiten',Digit7:'shita',Digit8:'kagi',Numpad1:'tsuki',Numpad2:'mae',Numpad3:'mawashi',Numpad4:'ushiro',Numpad5:'gedan',Numpad6:'kaiten',Numpad7:'shita',Numpad8:'kagi'};
  function keyboard(e,pressed){
    // Release keys even if focus has since moved onto a menu control.
    if(!pressed){const held=heldKeys.get(e.code);if(held){controls.release('key:'+e.code);heldKeys.delete(e.code);e.preventDefault();}return;}
    if(document.querySelector('dialog[open]')||document.body.classList.contains('orientation-blocked')||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.code==='Escape'&&!e.repeat){
      if(screen==='select'){e.preventDefault();showTitle();}
      else if(screen==='versus'){e.preventDefault();arcadeRun?showArcadeCreator():showSelection();}
      else if(screen==='game'){e.preventDefault();togglePause();}
      return;
    }
    if(e.target.closest?.('select,input,textarea,[contenteditable="true"]'))return;
    if(screen==='create')return;
    if(e.code==='Enter'&&e.repeat){e.preventDefault();return;}
    const nativeControl=!!e.target.closest?.('button,a[href],summary');
    if(screen==='versus'){
      if(nativeControl&&(e.code==='Enter'||e.code==='Space'))return;
      if(p1[e.code]||p2[e.code]||e.code==='Enter')e.preventDefault();
      return;
    }
    if(screen==='title'){
      if(e.code==='Enter'&&!e.repeat&&!nativeControl){e.preventDefault();showSelection();}
      return;
    }
    if(screen==='select'){
      if(['ArrowUp','ArrowDown','KeyW','KeyS'].includes(e.code)&&!e.repeat){e.preventDefault();setSelectionTarget(selectionTarget==='player'?'opponent':'player');}
      else if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)&&!e.repeat){e.preventDefault();const step=['ArrowLeft','KeyA'].includes(e.code)?-1:1;selectFighter(rosterIds[(rosterIds.indexOf(config[selectionTarget])+step+rosterIds.length)%rosterIds.length]);}
      else if(e.code==='Enter'&&!e.repeat&&!nativeControl){e.preventDefault();beginVersus();}
      return;
    }
    // Buttons keep native Enter/Space activation; they never start unrelated matches.
    if(nativeControl&&(e.code==='Enter'||e.code==='Space'))return;
    if(e.code==='Enter'&&!e.repeat){
      if(resultShown){e.preventDefault();beginVersus(900);}
      else if(paused){e.preventDefault();togglePause(false);}
      return;
    }
    if(!active||paused||resultShown)return;
    if(e.code==='KeyS'||e.code==='ArrowDown'){e.preventDefault();return;}
    let action=p1[e.code],player=0;if(!action&&config.mode==='versus'){action=p2[e.code];player=1;}
    if(action){e.preventDefault();if(!e.repeat){controls.press('key:'+e.code,player,action);heldKeys.set(e.code,{player,action});}}
  }
  window.addEventListener('keydown',e=>keyboard(e,true));window.addEventListener('keyup',e=>keyboard(e,false));
  window.addEventListener('blur',()=>{if(active&&!paused&&!resultShown)togglePause(true);clearCombatInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(active&&!paused&&!resultShown)togglePause(true);clearCombatInput();}sound.update(audioState());});
  const viewportChanged=()=>{
    if(!viewportFrame)viewportFrame=requestAnimationFrame(()=>{viewportFrame=0;syncControlSurface();});
    // Mobile engines can dispatch orientation/fullscreen before their final resize.
    clearTimeout(viewportSettleTimer);viewportSettleTimer=setTimeout(syncControlSurface,160);
  };
  const orientationChanged=()=>{
    clearCombatInput();
    syncControlSurface();viewportChanged();
  };
  window.addEventListener('orientationchange',orientationChanged);
  window.screen.orientation?.addEventListener('change',orientationChanged);
  portraitMedia.addEventListener('change',orientationChanged);
  window.addEventListener('resize',viewportChanged);
  window.visualViewport?.addEventListener('resize',viewportChanged);
  window.visualViewport?.addEventListener('scroll',viewportChanged);
  touchMedia.addEventListener('change',()=>{touchDetected=touchMedia.matches||navigator.maxTouchPoints>0;clearCombatInput();syncControlSurface();});
  $('touch-toggle-button')?.addEventListener('click',()=>{touchPreference=!(touchPreference??touchDetected);clearCombatInput();syncControlSurface();});
  $('title-start-button').addEventListener('click',showSelection);
  $('selection-back-button').addEventListener('click',()=>showTitle());
  $('start-button').addEventListener('click',()=>beginVersus());$('rematch-button').addEventListener('click',()=>beginVersus(900));$('restart-button').addEventListener('click',()=>beginVersus(900));
  $('pause-button').addEventListener('click',()=>togglePause());$('resume-button').addEventListener('click',()=>togglePause(false));
  $('menu-button').addEventListener('click',()=>arcadeRun?finishArcade():showSelection());
  $('result-menu-button').addEventListener('click',()=>arcadeRun&&!arcadeRun.getState().finished?finishArcade():showSelection());
  document.querySelector('.brand')?.addEventListener('click',e=>{e.preventDefault();showTitle();});
  buildRoster();
  $('arcade-title-button').addEventListener('click',showArcadeCreator);
  const arcadeModeButton=document.createElement('button');arcadeModeButton.type='button';arcadeModeButton.textContent='ARCADE';arcadeModeButton.dataset.arcadeMode='true';
  arcadeModeButton.addEventListener('click',showArcadeCreator);document.querySelector('.mode-select').append(arcadeModeButton);
  document.querySelectorAll('[data-fighter]').forEach(button=>button.addEventListener('click',()=>selectFighter(button.dataset.fighter)));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
    if(screen!=='select'||matchLoading)return;selectionError='';config.mode=button.dataset.mode;game.start(config);game.pause(true);setNames();updateSelection();sound.effect('menuMove');
  }));
  $('difficulty').addEventListener('change',()=>{config.difficulty=$('difficulty').value;if(screen==='select')updateSelection();sound.effect('menuMove');});
  const unlockAudio=()=>{
    // Call resume synchronously inside the gesture, before fullscreen can consume it.
    const pending=sound.init();sound.update(audioState());syncAudioButton();
    pending.then(syncAudioButton);
  };
  const audioButtonTarget=e=>!!e.target?.closest?.('#sound-button, #mobile-sound-button');
  for(const id of ['sound-button','mobile-sound-button'])$(id)?.addEventListener('click',()=>{
    if(sound.enabled&&!sound.status.ready)unlockAudio();
    else {sound.toggle();sound.update(audioState());syncAudioButton();}
  });
  window.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&!audioButtonTarget(e))unlockAudio();
    if(e.pointerType==='touch'&&!touchDetected){touchDetected=true;syncControlSurface();}
  },{capture:true});
  window.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse'&&!audioButtonTarget(e))unlockAudio();},{capture:true});
  // iOS grants touch activation on release; pointerdown alone can leave resume pending.
  window.addEventListener('touchend',e=>{if(!audioButtonTarget(e))unlockAudio();},{capture:true,passive:true});
  window.addEventListener('click',e=>{if(!audioButtonTarget(e))unlockAudio();},{capture:true});
  window.addEventListener('keydown',e=>{if(!e.repeat&&!audioButtonTarget(e))unlockAudio();},{capture:true});
  function syncFullscreenButton(){
    const expanded=display.requested||document.fullscreenElement===$('game-shell');
    const label=expanded?'Esci da schermo intero':'Schermo intero';
    $('fullscreen-button').setAttribute('aria-label',label);$('fullscreen-button').title=label;
  }
  function displayHostOrigin(){
    if(!window.parent||window.parent===window||pageOptions.get('hostdisplay')!=='1')return null;
    try{
      const origin=new URL(document.referrer).origin;
      if(['https://kyokushinkaicataniadojo.it','https://www.kyokushinkaicataniadojo.it','https://editor.flazio.com'].includes(origin))return origin;
      if(['localhost','127.0.0.1'].includes(location.hostname)&&origin===location.origin)return origin;
    }catch{}
    return null;
  }
  $('fullscreen-button').addEventListener('click',()=>display.toggle());
  $('rotate-fullscreen-button')?.addEventListener('click',()=>display.open());
  $('rotate-action-label').textContent='GIOCA IN ORIZZONTALE';
  $('rotate-description').textContent='Ruota il telefono oppure tocca il pulsante: il gioco si adatta anche con la rotazione bloccata.';
  function showDialog(id){if(active&&!paused&&!resultShown)togglePause(true);sound.effect('menuMove');$('game-shell').append($(id));$(id).showModal();}
  $('help-button').addEventListener('click',()=>showDialog('help-dialog'));$('all-moves-button').addEventListener('click',()=>showDialog('help-dialog'));$('credits-button').addEventListener('click',()=>showDialog('credits-dialog'));
  $('mobile-help-button')?.addEventListener('click',()=>showDialog('help-dialog'));
  document.querySelectorAll('dialog').forEach(d=>{d.querySelector('.close-dialog').addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});
  for(const [title,url] of [['Il sito del dojo','https://www.kyokushinkaicataniadojo.it/'],['Kyokushinkai Catania Dojo su Instagram','https://www.instagram.com/kyokushinkaicataniadojo/'],['Fitness & Wellness BodyPlanet su Instagram','https://www.instagram.com/fitnesswellness_bodyplanet/']]){const a=document.createElement('a');a.textContent=title+' ↗';a.href=url;a.target='_blank';a.rel='noopener noreferrer';$('source-links').append(a);}
  async function boot(){
    $('title-start-button').disabled=true;$('start-button').disabled=true;$('title-load-label').textContent='CARICAMENTO…';
    syncAudioButton();showTitle(false);
    try{
      await Promise.all([bg.decode(),window.FighterArt.load()]);ready=true;
      $('title-start-button').disabled=false;$('title-load-label').textContent='INIZIA';
      $('arcade-title-button').disabled=false;
      $('start-button').disabled=false;$('start-label').textContent='COMBATTI';
      updateSelection();showTitle(false);
      // Prepare the first arena frame before revealing it. A hidden loading
      // iframe may not receive animation frames, so readiness must not await one.
      drawBackground(clock);
      window.DojoLoading?.report('ready');
      (document.body.classList.contains('orientation-blocked')?$('rotate-fullscreen-button'):$('title-start-button'))?.focus({preventScroll:true});
    }
    catch(err){
      console.error('Asset loading failed',err);loadFailed=true;ready=false;
      $('title-load-label').textContent='RICARICA IL DOJO';$('title-start-button').disabled=false;
      $('status-label').textContent='Non riesco a caricare le immagini. Ricarica la pagina.';
      window.DojoLoading?.report('error', 'Non riesco a caricare le immagini del dojo. Controlla la connessione e riprova.');
    }
  }
  boot();requestAnimationFrame(frame);
})();
