/* Room signalling and reliable browser-to-browser transport. Room tokens stay in memory. */
(function (global) {
  'use strict';
  const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  const TOKEN = /^[0-9a-f]{64}$/;
  const MAX_PACKET = 65536;
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  const byteLength = value => typeof TextEncoder === 'function' ? new TextEncoder().encode(value).length : unescape(encodeURIComponent(value)).length;
  const messageError = (message, status = 0) => Object.assign(new Error(message), { status });

  class DojoOnlineClient {
    constructor(options = {}) {
      let endpoint;
      try { endpoint = new URL(options.endpoint); } catch (_) { throw new TypeError('Indirizzo del servizio online non valido'); }
      if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new TypeError('Indirizzo del servizio online non valido');
      this.endpoint = endpoint.href.replace(/\/$/, '').replace(/\/online$/, '');
      this.fetch = options.fetch || global.fetch?.bind(global);
      this.PeerConnection = options.RTCPeerConnection || global.RTCPeerConnection;
      this.AbortController = options.AbortController || global.AbortController;
      this.setTimer = options.setTimeout || global.setTimeout.bind(global);
      this.clearTimer = options.clearTimeout || global.clearTimeout.bind(global);
      this.onRoom = options.onRoom || (() => {});
      this.onMessage = options.onMessage || (() => {});
      this.onConnection = options.onConnection || (() => {});
      this.onError = options.onError || (() => {});
      this.role = null; this.room = null; this.connected = false;
      this.generation = 0; this._token = null; this.cursor = 0;
      this.timers = new Set(); this.signalQueue = Promise.resolve(); this.updateQueue = Promise.resolve(); this.peer = null; this.channel = null;
      this.remoteCandidates = []; this.localCandidates = []; this.descriptionSent = false;
      if (!this.fetch) throw new TypeError('Questo browser non supporta il gioco online');
    }
    _timer(callback, milliseconds) {
      const timer = this.setTimer(() => { this.timers.delete(timer); callback(); }, milliseconds);
      this.timers.add(timer); return timer;
    }
    _clearTimers() { for (const timer of this.timers) this.clearTimer(timer); this.timers.clear(); }
    _current(generation) { return generation === this.generation && !!this._token; }
    async _request(path, { method = 'GET', token, body, keepalive = false } = {}) {
      const headers = { Accept: 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const controller = this.AbortController ? new this.AbortController() : null;
      let expired = false, timeout;
      const operation = (async () => {
        let response;
        try { response = await this.fetch(this.endpoint + path, { method, headers, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive,
          ...(controller ? { signal: controller.signal } : {}), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
        catch (_) { throw messageError('Connessione al servizio online non riuscita. Riprova.'); }
        let data;
        try { data = await response.json(); } catch (_) { throw messageError('Il servizio online ha risposto in modo incompleto.', response.status); }
        if (!response.ok) throw messageError(typeof data?.error === 'string' ? data.error.slice(0, 180) : 'Il servizio online non è disponibile.', response.status);
        if (!record(data)) throw messageError('Risposta della stanza non valida.');
        return data;
      })();
      // The deadline also bounds JSON reads and fetch implementations that ignore abort.
      // If an aborted creation still returns credentials, close that orphan membership.
      operation.then(data => {
        if (expired && method === 'POST' && body?.protocol === 1 && CODE.test(data.code) && TOKEN.test(data.token)) void this._closeMembership({ code: data.code, token: data.token });
      }, () => {});
      const deadline = new Promise((resolve, reject) => {
        timeout = this.setTimer(() => {
          expired = true; controller?.abort();
          reject(messageError('Il servizio online non risponde. Riprova tra un momento.', 408));
        }, 12000);
      });
      try { return await Promise.race([operation, deadline]); }
      finally { this.clearTimer(timeout); }
    }
    _roomPath(code = this.room?.code) { return '/online/rooms/' + encodeURIComponent(code); }
    _membership() { return this._token && this._code ? { code: this._code, token: this._token } : null; }
    async _closeMembership(membership) {
      if (!membership) return;
      try { await this._request(this._roomPath(membership.code), { method: 'POST', token: membership.token, body: { action: 'leave' }, keepalive: true }); }
      catch (_) { /* Local teardown succeeds even when a room already expired. */ }
    }
    _teardown() {
      this._clearTimers();
      const channel = this.channel, peer = this.peer;
      this.channel = null; this.peer = null;
      if (channel) { channel.onopen = channel.onmessage = channel.onclose = channel.onerror = null; try { channel.close(); } catch (_) {} }
      if (peer) { peer.onicecandidate = peer.ondatachannel = peer.onconnectionstatechange = peer.oniceconnectionstatechange = null; try { peer.close(); } catch (_) {} }
      this._token = null; this._code = null; this.room = null; this.role = null; this.connected = false;
      this.cursor = 0; this.peerPromise = null; this.signalQueue = Promise.resolve(); this.updateQueue = Promise.resolve();
      this.remoteCandidates = []; this.localCandidates = []; this.descriptionSent = false;
      this.pollFailures = 0; this.heartbeatFailures = 0;
    }
    async leave() {
      const membership = this._membership(), existed = !!(membership || this.peer || this.pending);
      this.generation++; this.pending = false; this._teardown();
      if (existed) this.onConnection('disconnected', 'Hai lasciato la stanza.');
      await this._closeMembership(membership);
    }
    _fail(error, generation) {
      if (generation !== this.generation) return;
      const membership = this._membership();
      this.generation++; this.pending = false; this._teardown();
      const failure = error instanceof Error ? error : messageError(String(error));
      this.onConnection('disconnected', failure.message); this.onError(failure);
      void this._closeMembership(membership);
    }
    _profile(options) {
      const name = String(options?.name || '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
      if (!name || [...name].length > 24 || /[\p{Cc}\p{Cf}]/u.test(name) || typeof options?.fighter !== 'string' || options.fighter.length > 64 || !['versus', 'training'].includes(options?.mode)) throw messageError('Inserisci il nome e scegli il tuo karateka.');
      return { name, fighter: options.fighter, mode: options.mode, protocol: 1 };
    }
    create(options) { return this._enter('create', options); }
    join(options) { return this._enter('join', options); }
    matchmake(options) { return this._enter('match', options); }
    async _enter(kind, options = {}) {
      const previous = this._membership();
      const generation = ++this.generation;
      this._teardown(); this.pending = true;
      void this._closeMembership(previous);
      try {
        if (!this.PeerConnection) throw messageError('Il tuo browser non supporta le stanze online. Apri il gioco con un browser aggiornato.');
        const body = this._profile(options);
        const code = String(options.code || '').trim().toUpperCase().replace(/\s/g, '');
        if (kind === 'join' && !CODE.test(code)) throw messageError('Il codice stanza contiene 6 lettere o numeri.');
        const path = kind === 'create' ? '/online/rooms' : kind === 'match' ? '/online/match' : this._roomPath(code) + '/join';
        const result = await this._request(path, { method: 'POST', body });
        const membership = CODE.test(result.code) && TOKEN.test(result.token) ? { code: result.code, token: result.token } : null;
        if (generation !== this.generation) { await this._closeMembership(membership); return null; }
        if (!membership || !['host', 'guest'].includes(result.role)) throw messageError('La stanza non è stata creata correttamente.');
        this._token = membership.token; this._code = membership.code; this.role = result.role; this.pending = false;
        this.iceServers = this._iceServers(result.iceServers);
        if (!this._acceptRoom(result.room, generation)) throw messageError('La stanza non è stata creata correttamente.');
        this._schedulePoll(generation, 0); this._scheduleHeartbeat(generation);
        return this.room;
      } catch (error) {
        if (generation !== this.generation) return null;
        this._fail(error, generation); throw error;
      }
    }
    _iceServers(servers) {
      if (!Array.isArray(servers) || servers.length > 8) return [];
      return servers.filter(server => {
        const urls = typeof server?.urls === 'string' ? [server.urls] : server?.urls;
        return Array.isArray(urls) && urls.length > 0 && urls.length <= 4 && urls.every(url => typeof url === 'string' && url.length <= 200 && /^(?:stun|stuns|turn|turns):[^\s]+$/.test(url));
      }).map(server => ({ urls: copy(server.urls), ...(typeof server.username === 'string' ? { username: server.username } : {}), ...(typeof server.credential === 'string' ? { credential: server.credential } : {}) }));
    }
    _acceptRoom(room, generation) {
      if (!this._current(generation) || !record(room) || !CODE.test(room.code) || !['versus', 'training'].includes(room.mode) || !['waiting', 'paired', 'closed'].includes(room.status) || !Number.isSafeInteger(room.revision) || !Array.isArray(room.players) || room.players.length < 1 || room.players.length > 2 || room.role !== this.role) return false;
      if (this.room && room.code !== this.room.code) return false;
      if (room.players.some((player, index) => !record(player) || player.slot !== index || typeof player.name !== 'string' || player.name.length > 100 || typeof player.fighter !== 'string' || player.fighter.length > 64 || typeof player.ready !== 'boolean')) return false;
      if (room.status === 'closed') { this._fail(messageError('La stanza è stata chiusa.'), generation); return false; }
      if (this.room && room.revision < this.room.revision) return true;
      const changed = !this.room || this.room.revision !== room.revision;
      this.room = copy(room);
      if (changed) this.onRoom(this.room);
      if (this._current(generation) && room.players.length === 2 && !this.peerPromise) {
        this.peerPromise = this._connect(generation);
        this.peerPromise.catch(error => this._fail(error, generation));
      }
      return true;
    }
    _schedulePoll(generation, delay = this.connected ? 4000 : 800) {
      if (!this._current(generation)) return;
      this._timer(() => void this._poll(generation), delay);
    }
    async _poll(generation) {
      if (!this._current(generation)) return;
      try {
        const result = await this._request(this._roomPath() + '?after=' + this.cursor, { token: this._token });
        if (!this._current(generation)) return;
        if (!this._acceptRoom(result.room, generation) || !Array.isArray(result.messages) || result.messages.length > 128) throw messageError('Risposta della stanza non valida.');
        for (const message of result.messages) {
          if (!this._current(generation)) return;
          if (!record(message) || !Number.isSafeInteger(message.seq) || message.seq <= this.cursor) continue;
          if (message.from !== (this.role === 'host' ? 1 : 0)) continue;
          await this._processSignal(message, generation);
          if (!this._current(generation)) return;
          this.cursor = message.seq;
        }
        this.pollFailures = 0;
      } catch (error) {
        if (!this._current(generation)) return;
        if ([401, 403, 404, 409, 410].includes(error.status) || (this.pollFailures = (this.pollFailures || 0) + 1) >= 3) { this._fail(error, generation); return; }
      }
      this._schedulePoll(generation);
    }
    _scheduleHeartbeat(generation) {
      if (!this._current(generation)) return;
      this._timer(async () => {
        if (!this._current(generation)) return;
        try {
          const result = await this._request(this._roomPath(), { method: 'POST', token: this._token, body: { action: 'heartbeat' } });
          if (!this._current(generation)) return;
          if (!this._acceptRoom(result.room, generation)) throw messageError('Risposta della stanza non valida.');
          this.heartbeatFailures = 0;
        } catch (error) {
          if (!this._current(generation)) return;
          if ([401, 403, 404, 409, 410].includes(error.status) || (this.heartbeatFailures = (this.heartbeatFailures || 0) + 1) >= 3) { this._fail(error, generation); return; }
        }
        this._scheduleHeartbeat(generation);
      }, 5000);
    }
    update(options = {}) {
      const generation = this.generation;
      if (!this._current(generation)) return Promise.reject(messageError('Entra in una stanza prima di scegliere.'));
      const body = { action: 'update' };
      if (options.fighter !== undefined) body.fighter = options.fighter;
      if (options.ready !== undefined) body.ready = options.ready;
      const task = this.updateQueue.then(async () => {
        if (!this._current(generation)) return null;
        try {
          const result = await this._request(this._roomPath(), { method: 'POST', token: this._token, body });
          if (!this._current(generation)) return null;
          if (!this._acceptRoom(result.room, generation)) throw messageError('Risposta della stanza non valida.');
          return this.room;
        } catch (error) {
          if (!this._current(generation)) return null;
          if ([401, 403, 404, 409, 410].includes(error.status)) this._fail(error, generation);
          else this.onError(error);
          throw error;
        }
      });
      this.updateQueue = task.catch(() => {});
      return task;
    }
    async _connect(generation) {
      if (!this._current(generation)) return;
      this.onConnection('connecting', 'Collego i due giocatori…');
      if (!this._current(generation)) return;
      const peer = this.peer = new this.PeerConnection({ iceServers: this.iceServers });
      this._timer(() => { if (this._current(generation) && !this.connected) this._fail(messageError('Non riesco a collegare i due dispositivi. Prova un’altra rete e crea una nuova stanza.'), generation); }, 25000);
      peer.onicecandidate = event => {
        if (!this._current(generation) || !event.candidate) return;
        const candidate = event.candidate.toJSON?.() || event.candidate;
        const payload = { candidate: candidate.candidate, sdpMid: candidate.sdpMid ?? null, sdpMLineIndex: candidate.sdpMLineIndex ?? null };
        if (!this.descriptionSent) this.localCandidates.push(payload);
        else void this._signal('candidate', payload, generation);
      };
      const connectionChanged = () => {
        if (!this._current(generation)) return;
        if (['failed', 'disconnected', 'closed'].includes(peer.connectionState) || ['failed', 'disconnected', 'closed'].includes(peer.iceConnectionState)) this._fail(messageError('Il collegamento con l’altro giocatore si è interrotto. Crea una nuova stanza.'), generation);
      };
      peer.onconnectionstatechange = peer.oniceconnectionstatechange = connectionChanged;
      peer.ondatachannel = event => { if (this._current(generation) && this.role === 'guest') this._attachChannel(event.channel, generation); };
      if (this.role === 'host') {
        this._attachChannel(peer.createDataChannel('dojo-game-v1', { ordered: true }), generation);
        const offer = await peer.createOffer();
        if (!this._current(generation)) return;
        await peer.setLocalDescription(offer);
        if (!this._current(generation)) return;
        await this._signal('offer', { type: 'offer', sdp: peer.localDescription.sdp }, generation);
        if (!this._current(generation)) return;
        this.descriptionSent = true;
        await this._flushLocalCandidates(generation);
      }
    }
    _signal(type, payload, generation) {
      const path = this._roomPath(), token = this._token;
      const task = this.signalQueue.then(async () => {
        if (!this._current(generation)) return;
        await this._request(path, { method: 'POST', token, body: { action: 'signal', type, payload } });
      });
      this.signalQueue = task.catch(error => this._fail(error, generation));
      return this.signalQueue;
    }
    async _flushLocalCandidates(generation) {
      while (this._current(generation) && this.localCandidates.length) await this._signal('candidate', this.localCandidates.shift(), generation);
    }
    async _processSignal(message, generation) {
      if (message.type === 'control') return; // Lobby/match controls use the ordered peer channel.
      if (!['offer', 'answer', 'candidate'].includes(message.type) || !record(message.payload)) throw messageError('Dati di collegamento non validi.');
      await this.peerPromise;
      if (!this._current(generation) || !this.peer) return;
      const peer = this.peer, payload = message.payload;
      if (message.type === 'candidate') {
        if (typeof payload.candidate !== 'string' || payload.candidate.length > 1536) throw messageError('Dati di collegamento non validi.');
        const candidate = { candidate: payload.candidate, sdpMid: payload.sdpMid ?? null, sdpMLineIndex: payload.sdpMLineIndex ?? null };
        if (!peer.remoteDescription) this.remoteCandidates.push(candidate);
        else await peer.addIceCandidate(candidate);
        return;
      }
      if (payload.type !== message.type || typeof payload.sdp !== 'string' || !payload.sdp.startsWith('v=0') || payload.sdp.length > 12000 || (message.type === 'offer' && this.role !== 'guest') || (message.type === 'answer' && this.role !== 'host')) throw messageError('Dati di collegamento non validi.');
      if (peer.remoteDescription) return; // Repeated signalling cannot renegotiate a running match.
      await peer.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
      if (!this._current(generation)) return;
      while (this.remoteCandidates.length) {
        await peer.addIceCandidate(this.remoteCandidates.shift());
        if (!this._current(generation)) return;
      }
      if (message.type === 'offer') {
        const answer = await peer.createAnswer();
        if (!this._current(generation)) return;
        await peer.setLocalDescription(answer);
        if (!this._current(generation)) return;
        await this._signal('answer', { type: 'answer', sdp: peer.localDescription.sdp }, generation);
        if (!this._current(generation)) return;
        this.descriptionSent = true; await this._flushLocalCandidates(generation);
      }
    }
    _attachChannel(channel, generation) {
      if (this.channel || channel.label !== 'dojo-game-v1' || channel.ordered === false || channel.maxRetransmits != null || channel.maxPacketLifeTime != null) { try { channel.close(); } catch (_) {} return; }
      this.channel = channel;
      channel.onopen = () => {
        if (!this._current(generation)) return;
        this.connected = true; this.onConnection('connected', 'Avversario collegato.');
      };
      channel.onmessage = event => {
        if (!this._current(generation) || typeof event.data !== 'string' || byteLength(event.data) > MAX_PACKET) return;
        let packet; try { packet = JSON.parse(event.data); } catch (_) { return; }
        if (!record(packet) || typeof packet.type !== 'string' || packet.type.length > 64) return;
        this.onMessage(packet);
      };
      channel.onclose = channel.onerror = () => { if (this._current(generation)) this._fail(messageError('L’altro giocatore si è disconnesso.'), generation); };
      if (channel.readyState === 'open') channel.onopen();
    }
    send(packet) {
      if (!this.connected || !this.channel || this.channel.readyState !== 'open' || !record(packet) || typeof packet.type !== 'string') return false;
      let encoded;
      try { encoded = JSON.stringify(packet); } catch (_) { return false; }
      if (byteLength(encoded) > MAX_PACKET) return false;
      const buffered = this.channel.bufferedAmount || 0;
      if (packet.type === 'game-frame' && buffered > 128 * 1024) return false;
      if (buffered > 1024 * 1024) { this._fail(messageError('Connessione troppo lenta. Crea una nuova stanza.'), this.generation); return false; }
      try { this.channel.send(encoded); return true; }
      catch (_) { this._fail(messageError('Invio al giocatore non riuscito.'), this.generation); return false; }
    }
  }
  global.DojoOnlineClient = DojoOnlineClient;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DojoOnlineClient };
})(typeof window !== 'undefined' ? window : globalThis);
