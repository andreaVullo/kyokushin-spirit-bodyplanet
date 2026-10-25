/* Coordinates room readiness, asset loading, match epochs and rematch consent. */
(function(global) {
  'use strict';
  class OnlineSession {
    constructor(options) {
      this.options=options;this.phase='off';this.epoch=0;this.generation=0;this.room=null;this.client=null;this.engine=null;this.timer=null;
      this.schedule=options.setTimeout||global.setTimeout.bind(global);this.unschedule=options.clearTimeout||global.clearTimeout.bind(global);
      this.roomReset=null;this.minimumRoomRevision=0;this.transportReady=false;this.reconnecting=false;this.pendingPrepare=null;this.pendingStartPacket=null;this.pendingStart=false;
      this.ui=new (options.UI||global.DojoOnlineUI)({roster:options.roster,inviteBase:options.inviteBase,
        onOpen:()=>options.onOpen(),onBack:()=>options.onBack(),onLeave:()=>{this.leave();options.onBack();},
        onCreate:p=>this.enter('create',p),onJoin:p=>this.enter('join',p),onMatchmake:p=>this.enter('matchmake',p),
        onReady:ready=>this.change({ready}),onUpdate:p=>this.change({fighter:p.fighter,ready:false}),
        onRematch:()=>this.rematch(),onReturnToRoom:()=>this.returnToRoom()});
    }
    get active(){return this.phase!=='off';}
    get localSlot(){return this.client?.role==='guest'?1:0;}
    get renderState(){return this.engine?.renderState||this.options.game.getState();}
    open(values={}){this.leave();this.phase='home';this.options.onLobby();this.ui.showHome(values);}
    async enter(method,profile){
      if(this.phase!=='home')return;
      this.phase='joining';const generation=++this.generation;
      this.ui.setBusy(true,'Apro il dojo online…');if(method==='matchmake')this.ui.showSearching();
      const Client=this.options.Client||global.DojoOnlineClient;
      const client=this.client=new Client({endpoint:this.options.endpoint,
        onRoom:room=>{if(this.client===client)this.roomChanged(room);},
        onMessage:message=>{if(this.client===client)this.receive(message);},
        onConnection:(status,message)=>{if(this.client===client)this.connection(status,message);},
        onError:error=>{if(this.client===client)this.ui.setError(error.message);}});
      try{
        const room=await client[method](profile);if(generation!==this.generation||!room)return;
        this.phase='room';this.ui.setBusy(false);this.roomChanged(room);
      }catch(error){if(generation!==this.generation)return;this.client=null;client.leave();this.phase='home';this.ui.showHome(profile);this.ui.setError(error.message);}
    }
    roomChanged(room){
      if(!room||Number.isSafeInteger(room.revision)&&room.revision<this.minimumRoomRevision)return;
      this.room={...room,players:room.players.map(player=>({...player}))};
      if(this.roomReset&&!this.roomReset.complete)this.room.players.forEach(player=>{player.ready=false;});
      if(['joining','room'].includes(this.phase)){this.ui.showRoom(this.room);if(this.phase==='room')this.maybePrepare();}
    }
    disposeEngine(){const engine=this.engine;this.engine=null;engine?.dispose();}
    makeEngine(){
      this.disposeEngine();
      const Engine=this.options.Engine||global.DojoOnlineGame,client=this.client;
      const engine=new Engine({game:this.options.game,role:client.role,send:packet=>this.client===client?client.send(packet):false,
        onEvent:this.options.onEvent,onStatus:(state,details)=>{if(this.engine===engine)this.engineStatus(state,details);}});
      this.engine=engine;
    }
    connection(status,message){
      if(status==='connected'){
        this.transportReady=true;this.reconnecting=false;this.engine?.setReconnecting(false);
        this.ui.setConnection?.(true);this.ui.setStatus('Connessione pronta. Scegli il karateka e premi Pronto.');
        if(this.pendingPrepare){const info=this.pendingPrepare;this.pendingPrepare=null;this.receive(info);}
        if(this.pendingStartPacket){const packet=this.pendingStartPacket;this.pendingStartPacket=null;this.receive(packet);}
        if(this.phase==='loading'&&this.localLoaded){if(this.client?.role==='host')this.maybeVersus();else this.send({type:'online-loaded',epoch:this.epoch});}
        if(this.phase==='versus'&&this.pendingStart)this.startPrepared();
        if(this.phase==='room'&&this.roomReset?.local&&!this.roomReset.complete)this.sendRoomReset();
        if(this.phase==='result')this.maybeRematch();
        this.maybePrepare();
      }else if(status==='disconnected')this.fail(message||'La connessione con l’altro karateka si è interrotta. Crea una nuova stanza per riprovare.');
      else{
        this.transportReady=false;this.reconnecting=status==='reconnecting';
        if(this.reconnecting)this.engine?.setReconnecting(true);
        const notice=message||(this.reconnecting?'Ricollego i karateka. La stanza resta aperta…':'Verifico la connessione tra i karateka…');
        this.ui.setConnection?.(false,notice);this.ui.setStatus(notice);
      }
      this.options.onConnection?.(status,message);
    }
    async change(values){
      if(this.phase!=='room'||!this.client||values.ready===true&&!this.transportReady||this.roomReset&&!this.roomReset.complete)return;
      const generation=this.generation,client=this.client;
      this.ui.setBusy(true);
      try{await client.update(values);}catch(error){if(generation===this.generation&&this.client===client)this.ui.setError(error.message);}
      finally{if(generation===this.generation&&this.client===client&&this.phase==='room')this.ui.setBusy(false);}
    }
    maybePrepare(){
      if(this.phase!=='room'||!this.transportReady||this.client?.role!=='host'||!this.client.connected||this.roomReset&&!this.roomReset.complete||this.room?.players.length!==2||!this.room.players.every(p=>p.ready))return;
      const players=[...this.room.players].sort((a,b)=>a.slot-b.slot);
      this.prepare({type:'online-prepare',epoch:this.epoch+1,mode:this.room.mode,fighters:players.map(p=>p.fighter),names:players.map(p=>p.name)},true);
    }
    async prepare(info,host){
      if(!Number.isSafeInteger(info.epoch)||info.epoch<=this.epoch||!['versus','training'].includes(info.mode)||!Array.isArray(info.fighters)||info.fighters.length!==2||info.fighters.some(id=>!Object.prototype.hasOwnProperty.call(this.options.roster,id))||!Array.isArray(info.names)||info.names.length!==2||info.names.some(n=>typeof n!=='string'||n.length>96))return;
      if(!['room','result'].includes(this.phase))return;
      if(host!== (this.client?.role==='host')||!this.client?.connected)return;
      const generation=++this.generation;this.epoch=info.epoch;this.info=info;this.phase='loading';this.localLoaded=false;this.remoteLoaded=false;this.votes=[false,false];this.roomReset=null;this.pendingStart=false;this.pendingStartPacket=null;
      this.makeEngine();
      this.ui.hideResult();this.ui.setBusy(true,'Carico le mosse di entrambi i karateka…');
      if(host&&!this.send(info))return;
      this.unschedule(this.timer);this.timer=this.schedule(()=>{if(generation===this.generation)this.fail('Il caricamento della sfida è scaduto. Rientra in una nuova stanza.');},45000);
      try{
        await this.options.onPrepare(info);
        if(generation!==this.generation||this.phase!=='loading')return;
        this.localLoaded=true;
        if(host)this.maybeVersus();else if(this.transportReady)this.send({type:'online-loaded',epoch:this.epoch});
      }catch(error){if(generation!==this.generation||this.phase!=='loading')return;this.send({type:'online-error',epoch:this.epoch});this.fail('Non riesco a caricare le mosse. Rientra nella stanza per riprovare.');}
    }
    maybeVersus(){
      if(this.phase==='loading'&&this.transportReady&&this.localLoaded&&this.remoteLoaded&&this.client?.role==='host'){
        if(!this.send({type:'online-versus',epoch:this.epoch}))return;
        this.versus();const generation=this.generation,epoch=this.epoch;
        this.timer=this.schedule(()=>{if(generation===this.generation&&this.phase==='versus'&&epoch===this.epoch)this.startPrepared();},1400);
      }
    }
    startPrepared(){if(!this.transportReady){this.pendingStart=true;return;}this.pendingStart=false;if(!this.engine.startHost(this.info))this.fail('Non riesco ad avviare la sfida. Crea una nuova stanza per riprovare.');}
    versus(){this.unschedule(this.timer);this.phase='versus';this.ui.hide();this.options.onVersus(this.info);}
    engineStatus(status,details){
      if(status==='started'){
        if(details.epoch!==this.epoch||!['versus','loading'].includes(this.phase)){this.fail('La sfida non è sincronizzata. Rientra in una nuova stanza.');return;}
        this.unschedule(this.timer);this.phase='playing';this.ui.hide();this.options.onStart(this.info);
      }else if(status==='paused'||status==='resumed')this.options.onPause(status==='paused',details);
      else if(status==='disconnected')this.fail('Connessione interrotta. La partita è stata fermata per entrambi.');
    }
    receive(message){
      if(!message||typeof message.type!=='string')return;
      if(message.type.startsWith('game-')){
        if(!this.engine||message.epoch!==this.epoch||!['versus','playing','result'].includes(this.phase))return;
        if(message.type==='game-start'&&(this.client?.role!=='guest'||this.phase!=='versus'||message.mode!==this.info?.mode||!Array.isArray(message.fighters)||message.fighters.length!==2||message.fighters.some((id,i)=>id!==this.info.fighters[i])))return;
        if(message.type==='game-start'&&this.reconnecting){this.pendingStartPacket=message;return;}
        this.engine.receive(message);return;
      }
      if(message.type==='online-prepare'&&this.client?.role==='guest'){if(this.reconnecting)this.pendingPrepare=message;else this.prepare(message,false);return;}
      if(message.type==='online-room'&&message.epoch===this.epoch){this.returnToRoom(false);return;}
      if(message.epoch!==this.epoch)return;
      if(message.type==='online-error'){this.fail('L’altro karateka non riesce a caricare la sfida. Rientra in una nuova stanza.');return;}
      if(message.type==='online-room-reset'&&this.phase==='room'&&this.roomReset&&!this.roomReset.complete&&Number.isSafeInteger(message.revision)&&message.revision>=0){
        this.roomReset.remote=true;this.minimumRoomRevision=Math.max(this.minimumRoomRevision,message.revision);
        this.room?.players.forEach(player=>{if(player.slot!==this.localSlot)player.ready=false;});this.finishRoomReset();return;
      }
      if(message.type==='online-loaded'&&this.client?.role==='host'&&this.phase==='loading'){this.remoteLoaded=true;this.maybeVersus();}
      if(message.type==='online-versus'&&this.client?.role==='guest'&&this.phase==='loading'&&this.localLoaded)this.versus();
      if(message.type==='online-rematch'&&['playing','result'].includes(this.phase)){this.votes[this.localSlot===0?1:0]=true;this.refreshResult();this.maybeRematch();}
    }
    send(packet){if(this.reconnecting)return false;try{if(this.client?.send(packet))return true;}catch(_){}this.fail('Connessione interrotta. Crea una nuova stanza per riprovare.');return false;}
    showResult(){if(!['playing','result'].includes(this.phase))return;this.phase='result';this.votes=this.votes||[false,false];this.refreshResult();}
    refreshResult(){if(this.phase==='result')this.ui.showResult({rematchRequested:!!this.votes[this.localSlot],opponentReady:!!this.votes[1-this.localSlot]});}
    rematch(){if(this.phase!=='result'||!this.transportReady)return;this.votes[this.localSlot]=true;this.send({type:'online-rematch',epoch:this.epoch});this.refreshResult();this.maybeRematch();}
    maybeRematch(){if(this.phase==='result'&&this.client?.role==='host'&&this.votes.every(Boolean))this.prepare({...this.info,epoch:this.epoch+1},true);}
    async returnToRoom(notify=true){
      if(!this.client||!['playing','result','versus','loading'].includes(this.phase))return;
      if(notify&&!this.send({type:'online-room',epoch:this.epoch}))return;
      const generation=++this.generation,client=this.client;
      this.unschedule(this.timer);this.disposeEngine();this.phase='room';this.votes=[false,false];this.roomReset={local:false,remote:false,sent:false,complete:false};this.pendingStart=false;this.pendingStartPacket=null;this.pendingPrepare=null;
      this.room.players.forEach(player=>{player.ready=false;});
      this.options.onLobby();this.ui.hideResult();this.ui.setBusy(true);this.ui.showRoom(this.room);this.ui.setStatus('Riapro la stanza per entrambi i karateka…');
      // Ready flags belong to the lobby, never to a completed fight. Each peer resets its own flag.
      // Both acknowledgments are needed: an old poll must not start another fight.
      this.timer=this.schedule(()=>{if(generation===this.generation)this.fail('L’altro karateka non è rientrato. Crea una nuova stanza per riprovare.');},15000);
      try{
        const room=await client.update({ready:false});
        if(generation!==this.generation||this.phase!=='room'||this.client!==client)return;
        if(room)this.roomChanged(room);
        this.roomReset.local=true;
        this.sendRoomReset();
      }catch(error){if(generation!==this.generation||this.client!==client)return;this.send({type:'online-error',epoch:this.epoch});this.fail('Non riesco a riaprire la stanza. Crea una nuova stanza per riprovare.');}
    }
    sendRoomReset(){
      if(!this.roomReset?.local||this.roomReset.sent)return;
      if(!this.send({type:'online-room-reset',epoch:this.epoch,revision:this.client?.room?.revision??this.room?.revision??0}))return;
      this.roomReset.sent=true;this.finishRoomReset();
    }
    finishRoomReset(){
      if(this.phase!=='room'||!this.roomReset||!this.roomReset.local||!this.roomReset.remote||!this.roomReset.sent)return;
      this.roomReset.complete=true;this.unschedule(this.timer);this.ui.setBusy(false);this.ui.showRoom(this.room);
    }
    fail(message){
      if(!this.active||this.phase==='failed')return;
      this.phase='failed';this.unschedule(this.timer);this.disposeEngine();
      const client=this.client;this.client=null;client?.leave();this.generation++;
      this.options.onLobby();this.ui.hideResult();this.phase='home';this.room=null;this.epoch=0;this.roomReset=null;this.minimumRoomRevision=0;this.transportReady=false;this.reconnecting=false;this.pendingPrepare=null;this.pendingStartPacket=null;this.pendingStart=false;this.ui.showHome();this.ui.setError(message);
    }
    leave(){
      this.generation++;this.unschedule(this.timer);this.phase='off';this.disposeEngine();this.roomReset=null;this.minimumRoomRevision=0;this.transportReady=false;this.reconnecting=false;this.pendingPrepare=null;this.pendingStartPacket=null;this.pendingStart=false;
      const client=this.client;this.client=null;client?.leave();this.room=null;this.epoch=0;this.votes=[false,false];this.ui.hide();this.ui.hideResult();
    }
    setInput(action,pressed,options){return this.engine?.setInput(action,pressed,options);}
    clearInput(){this.engine?.clearInput();}
    pause(value){this.engine?.pause(value);}
    update(dt){if(['playing','result'].includes(this.phase))this.engine?.update(dt);}
  }
  global.DojoOnlineSession=OnlineSession;
  if(typeof module!=='undefined')module.exports={OnlineSession};
})(typeof window!=='undefined'?window:globalThis);
