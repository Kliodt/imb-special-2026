const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GuidePlayer,parseGuideCode}=require('../dist/player.js');
const tracks=[1,2,3,4].map(n=>({audio:`audio/0${n}.m4a`}));
const origin='https://guide.example.org';
class FakeAudio {
 constructor(src){this.src=src;this.paused=true;this.currentTime=0;this.duration=20;this.pending=[];this.defer=false;this.failure=null;this.error=null}
 play(){if(this.failure)return Promise.reject(this.failure);this.paused=false;if(this.defer)return new Promise((resolve,reject)=>this.pending.push({resolve,reject}));return Promise.resolve()}
 pause(){this.paused=true}
 removeAttribute(name){if(name==='src')this.src=''}
 load(){this.currentTime=0;this.error=null}
}
function setup(){let audios=[];const p=new GuidePlayer({tracks,audioFactory:src=>{let a=new FakeAudio(src);audios.push(a);return a}});return {p,audios}}
const flush=()=>new Promise(r=>setImmediate(r));
for(let i=1;i<=4;i++)test(`QR ${i} selects the right exhibit`,()=>assert.deepEqual(parseGuideCode(`${origin}/?stop=${i}`,[origin]),{type:'stop',index:i-1}));
test('start QR and compact start marker',()=>{assert.deepEqual(parseGuideCode(`${origin}/?start=1`,[origin]),{type:'start',index:0});assert.deepEqual(parseGuideCode('MEGA:START',[origin]),{type:'start',index:0})});
test('reject unrelated sites, javascript, bad IDs and ambiguous values',()=>{for(const value of ['https://evil.example/?stop=2','javascript:alert(1)',`${origin}/?stop=0`,`${origin}/?stop=5`,`${origin}/?stop=1.5`,`${origin}/?stop=01`,`${origin}/?stop=`,`${origin}/elsewhere?stop=1`,'random'])assert.equal(parseGuideCode(value,[origin]),null)});
test('compact markers for all four exhibits work',()=>{for(let n=1;n<=4;n++)assert.deepEqual(parseGuideCode(`MEGA:${n}`,[origin]),{type:'stop',index:n-1})});
test('start plays voice and continuous bed',async()=>{const {p}=setup();p.start();await flush();assert.equal(p.status,'playing');assert.equal(p.bed.paused,false);assert.equal(p.voice.paused,false);assert.equal(p.bed.loop,true)});
test('exhibit switch preserves background position and unlocked voice element',async()=>{const {p,audios}=setup();p.start();await flush();const bed=p.bed,voice=p.voice;bed.currentTime=7;p.select(2);await flush();assert.equal(p.bed,bed);assert.equal(p.bed.currentTime,7);assert.equal(p.bed.paused,false);assert.equal(p.voice,voice);assert.equal(p.voice.src,'audio/03.m4a');assert.equal(audios.length,2)});
test('pause and resume preserve narration position',async()=>{const {p}=setup();p.start();await flush();p.voice.currentTime=9;p.pause();assert.equal(p.voice.paused,true);assert.equal(p.bed.paused,true);p.start();await flush();assert.equal(p.voice.currentTime,9);assert.equal(p.status,'playing')});
test('narration end leaves background active; pause and resume do not restart voice',async()=>{const {p}=setup();p.start();await flush();p.voice.currentTime=20;p.voice.onended();assert.equal(p.status,'background');assert.equal(p.bed.paused,false);p.pause();p.start();await flush();assert.equal(p.status,'background');assert.equal(p.voice.currentTime,20)});
test('stale completion from prior track does not end the new narration',async()=>{const {p}=setup();p.start();await flush();const oldEnded=p.voice.onended;p.select(1);await flush();oldEnded();assert.equal(p.status,'playing');assert.equal(p.ended,false);assert.equal(p.index,1)});
test('rapid switching and delayed play results cannot restore old track',async()=>{const {p}=setup();p.voice.defer=true;p.start();const old=p.voice.pending[0];p.select(1);p.select(3);old.resolve();await flush();assert.equal(p.index,3);assert.equal(p.voice.src,'audio/04.m4a');p.voice.pending.at(-1).resolve();await flush();assert.equal(p.status,'playing')});
test('pause during loading remains paused after late promise resolution',async()=>{const {p}=setup();p.voice.defer=true;p.start();p.pause();p.voice.pending[0].resolve();await flush();assert.equal(p.status,'paused');assert.equal(p.voice.paused,true);assert.equal(p.bed.paused,true)});
test('autoplay rejection exposes a recoverable tap action',async()=>{const {p}=setup();p.voice.failure={name:'NotAllowedError'};p.start();await flush();assert.equal(p.status,'blocked');assert.match(p.message,/Нажми/);p.voice.failure=null;p.start();await flush();assert.equal(p.status,'playing')});
test('missing recording can recover on retry',async()=>{const {p}=setup();p.voice.failure={name:'NotSupportedError'};p.start();await flush();assert.equal(p.status,'error');p.voice.failure=null;p.start();await flush();assert.equal(p.status,'playing')});
test('select while paused does not start either audio',async()=>{const {p}=setup();p.start();await flush();p.pause();p.select(2);assert.equal(p.status,'idle');assert.equal(p.bed.paused,true);assert.equal(p.voice.paused,true)});
test('invalid selection leaves the current track unchanged',()=>{const {p}=setup();assert.equal(p.select(4),false);assert.equal(p.select(-1),false);assert.equal(p.index,0)});
