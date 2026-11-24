import { Chess } from 'chess.js';
import './advanced-lab.css';

const KEY = 'glass-chess-advanced-lab-v1';
const OPENINGS = [
  {id:'ruy',front:'Which opening starts 1.e4 e5 2.Nf3 Nc6 3.Bb5?',back:'Ruy Lopez (Spanish Game).',note:'The bishop pressures the c6-knight.'},
  {id:'sicilian',front:'Which defense begins 1.e4 c5?',back:'Sicilian Defense.',note:'An asymmetrical fight for central control.'},
  {id:'najdorf',front:'What is the Najdorf move after 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3?',back:'5...a6.',note:'A major Sicilian system, ECO B90–B99.'},
  {id:'french',front:'Which defense begins 1.e4 e6?',back:'French Defense.',note:'Black prepares ...d5 and challenges the center.'},
  {id:'caro',front:'Which defense begins 1.e4 c6?',back:'Caro-Kann Defense.',note:'A solid structure supporting ...d5.'},
  {id:'qg',front:'Which opening begins 1.d4 d5 2.c4?',back:'Queen’s Gambit.',note:'White challenges the d5-pawn and central space.'}
];
const FILES='abcdefgh';
const WORDS={one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8'};
const BASE={blindfold:false,zen:false,contrast:false,streamSafe:false,zoom:100,promotion:'q',voice:false,lines:[],reviews:{}};
let api,root,prefs;
let moveTimes=[];
let turnStarted=Date.now();
let visitEnabled=false;
let coordinate={active:false,target:'',hits:0,score:0,left:30,timer:null};
let flashIndex=0;
let recognition=null;

function readPrefs(){try{return Object.assign({},BASE,JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return {...BASE};}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{}}
function el(id){return root.querySelector('#'+id);}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function mountUI(){
  const nav=root.querySelector('.gc-tabs');if(!nav||root.querySelector('[data-view="advanced-lab"]'))return;
  const tab=document.createElement('button');tab.type='button';tab.dataset.tab='advanced-lab';tab.textContent='Advanced';
  const view=document.createElement('section');view.className='gc-view';view.dataset.view='advanced-lab';
  view.innerHTML=[
    '<div class="gc-card"><div class="gc-row"><h4>Focus & accessibility</h4><span class="gc-pill">Local</span></div><div class="gca-grid">',
    '<label class="gca-check"><input id="gca-blindfold" type="checkbox"> Blindfold · hide pieces</label>',
    '<label class="gca-check"><input id="gca-zen" type="checkbox"> Zen focus mode</label>',
    '<label class="gca-check"><input id="gca-contrast" type="checkbox"> High-contrast board</label>',
    '<label class="gca-check"><input id="gca-stream" type="checkbox"> Stream-safe mode</label></div>',
    '<label class="gca-field">Board zoom <span id="gca-zoom-label">100%</span><input id="gca-zoom" type="range" min="75" max="110"></label>',
    '<p class="gca-muted">These controls change the board presentation only; they do not alter chess rules.</p></div>',
    '<div class="gc-card"><h4>Move preferences & voice</h4><label class="gca-field">Auto-promotion<select id="gca-promotion"><option value="q">Queen automatically</option><option value="r">Rook automatically</option><option value="b">Bishop automatically</option><option value="n">Knight automatically</option><option value="ask">Ask every time</option></select></label>',
    '<label class="gca-check"><input id="gca-voice" type="checkbox"> Announce moves aloud</label><div class="gca-actions"><button id="gca-voice-command">Start voice command</button></div><p id="gca-voice-status" class="gca-status">Say a move such as “Knight f3”. Microphone support varies by browser.</p></div>',
    '<div class="gc-card"><div class="gc-row"><h4>Pawn structure analyzer</h4><button id="gca-pawn-run">Analyze</button></div><p class="gca-status" id="gca-pawn-output">Inspect isolated, doubled, backward and passed pawns in the current position.</p></div>',
    '<div class="gc-card"><div class="gc-row"><h4>Piece visit heatmap</h4><label class="gca-check"><input id="gca-visits" type="checkbox"> Show visits</label></div><div id="gca-visit-top" class="gca-squares"></div><p class="gca-muted">Counts piece occupancy across this game’s recorded positions. This is activity, not engine evaluation.</p></div>',
    '<div class="gc-card"><div class="gc-row"><h4>Move-time graph</h4><span class="gc-pill" id="gca-time-count">0 moves timed</span></div><div id="gca-time-bars" class="gca-bars"></div><p class="gca-muted">Records moves made after Advanced Lab is loaded.</p></div>',
    '<div class="gc-card"><h4>Coordinate vision drill</h4><div class="gc-row"><strong id="gca-coordinate-target">Ready?</strong><span class="gc-pill" id="gca-coordinate-score">0 / 0</span></div><p class="gca-status" id="gca-coordinate-status">Start a 30-second drill, then tap the named square on the board.</p><div class="gca-actions"><button class="primary" id="gca-coordinate-start">Start drill</button><button id="gca-coordinate-stop">Stop</button></div></div>',
    '<div class="gc-card"><h4>Opening flashcards · spaced review</h4><div class="gca-face" id="gca-flash-front">Review a due opening card.</div><p class="gca-status" id="gca-flash-note">The review interval grows when you remember the answer.</p><div class="gca-actions"><button id="gca-flash-reveal">Reveal</button><button id="gca-flash-again">Again</button><button id="gca-flash-known">I knew it</button></div></div>',
    '<div class="gc-card"><h4>Opening repertoire notebook</h4><div class="gca-grid"><label class="gca-field">Color<select id="gca-line-side"><option value="white">White</option><option value="black">Black</option></select></label><label class="gca-field">Line name<input id="gca-line-name" maxlength="50" placeholder="My Italian setup"></label></div>',
    '<label class="gca-field">SAN moves<input id="gca-line-moves" placeholder="e4 e5 Nf3 Nc6 Bc4"></label><div class="gca-actions"><button class="primary" id="gca-line-save">Save line</button></div><p class="gca-status" id="gca-line-status">Lines are saved locally in this browser.</p><div id="gca-line-list"></div></div>',
    '<div class="gc-card"><h4>Replay video export</h4><p class="gca-muted">Builds a downloadable WebM video from the current move history. Browser MediaRecorder support is required.</p><div class="gca-actions"><button class="primary" id="gca-export-replay">Export WebM replay</button></div><p class="gca-status" id="gca-export-status">No recording in progress.</p></div>'
  ].join('');
  nav.appendChild(tab);root.appendChild(view);
  tab.addEventListener('click',event=>{event.stopPropagation();root.querySelectorAll('[data-tab]').forEach(node=>node.classList.toggle('active',node===tab));root.querySelectorAll('[data-view]').forEach(node=>node.classList.toggle('active',node===view));});
}
function applyPresentation(){
  document.body.classList.toggle('gc-blindfold',prefs.blindfold);
  document.body.classList.toggle('gc-zen',prefs.zen);
  document.body.classList.toggle('gc-high-contrast',prefs.contrast);
  document.body.classList.toggle('gc-stream-safe',prefs.streamSafe);
  const frame=document.querySelector('.board-frame');
  if(frame){frame.style.width=prefs.zoom+'%';frame.style.marginInline='auto';}
  api.render?.();
}
function syncUI(){
  el('gca-blindfold').checked=prefs.blindfold;el('gca-zen').checked=prefs.zen;
  el('gca-contrast').checked=prefs.contrast;el('gca-stream').checked=prefs.streamSafe;
  el('gca-zoom').value=String(prefs.zoom);el('gca-zoom-label').textContent=prefs.zoom+'%';
  el('gca-promotion').value=prefs.promotion;el('gca-voice').checked=prefs.voice;
  applyPresentation();
}
function bindUI(){
  const toggle=(id,key)=>el(id).addEventListener('change',event=>{prefs[key]=event.target.checked;save();applyPresentation();});
  toggle('gca-blindfold','blindfold');toggle('gca-zen','zen');toggle('gca-contrast','contrast');toggle('gca-stream','streamSafe');
  el('gca-zoom').addEventListener('input',event=>{prefs.zoom=Number(event.target.value)||100;el('gca-zoom-label').textContent=prefs.zoom+'%';save();applyPresentation();});
  el('gca-promotion').addEventListener('change',event=>{prefs.promotion=event.target.value;save();});
  el('gca-voice').addEventListener('change',event=>{prefs.voice=event.target.checked;save();});
  el('gca-pawn-run').addEventListener('click',analyzePawns);
  el('gca-visits').addEventListener('change',event=>{visitEnabled=event.target.checked;document.body.classList.toggle('gc-visit-heat',visitEnabled);refreshVisits();});
  el('gca-coordinate-start').addEventListener('click',startCoordinate);el('gca-coordinate-stop').addEventListener('click',stopCoordinate);
  el('gca-flash-reveal').addEventListener('click',revealCard);el('gca-flash-again').addEventListener('click',()=>rateCard(false));el('gca-flash-known').addEventListener('click',()=>rateCard(true));
  el('gca-line-save').addEventListener('click',saveLine);el('gca-export-replay').addEventListener('click',()=>void exportReplay());
  el('gca-voice-command').addEventListener('click',startVoice);
  document.getElementById('board')?.addEventListener('click',coordinateTap,true);
}
function analyzePawns(){
  const chess=new Chess(api.fen);const all=chess.board().flat().filter(piece=>piece&&piece.type==='p');const found=[];
  for(const color of ['w','b']){
    const own=all.filter(piece=>piece.color===color);const enemy=all.filter(piece=>piece.color!==color);const files=new Map();
    own.forEach(pawn=>{const file=FILES.indexOf(pawn.square[0]);if(!files.has(file))files.set(file,[]);files.get(file).push(pawn);});
    for(const [file,list] of files){
      if(list.length>1)found.push((color==='w'?'White':'Black')+' doubled on '+FILES[file]+' ('+list.map(p=>p.square).join(', ')+')');
      for(const pawn of list){
        const rank=Number(pawn.square[1]);const isolated=!files.has(file-1)&&!files.has(file+1);
        if(isolated)found.push((color==='w'?'White':'Black')+' isolated pawn '+pawn.square);
        const passed=!enemy.some(other=>Math.abs(FILES.indexOf(other.square[0])-file)<=1&&(color==='w'?Number(other.square[1])>rank:Number(other.square[1])<rank));
        if(passed)found.push((color==='w'?'White':'Black')+' passed pawn '+pawn.square);
        const next=rank+(color==='w'?1:-1);const blocker=next>=1&&next<=8?chess.get(pawn.square[0]+next):null;
        const supporters=[...(files.get(file-1)||[]),...(files.get(file+1)||[])].some(other=>color==='w'?Number(other.square[1])<rank:Number(other.square[1])>rank);
        if(blocker&&blocker.color!==color&&!supporters)found.push((color==='w'?'White':'Black')+' possibly backward pawn '+pawn.square);
      }
    }
  }
  el('gca-pawn-output').textContent=found.join(' · ')||'No isolated, doubled, possibly backward or passed pawns detected by this basic scan.';
}
function refreshVisits(){
  const history=api.history||[];let fens=[];
  try{fens=api.calculatePositions(api.initialFen||new Chess().fen(),history);}catch{fens=[api.fen];}
  const counts={};
  for(const fen of fens){try{const pos=new Chess(fen);for(const piece of pos.board().flat())if(piece?.square)counts[piece.square]=(counts[piece.square]||0)+1;}catch{}}
  const max=Math.max(1,...Object.values(counts));
  document.querySelectorAll('#board [data-square]').forEach(square=>{const value=counts[square.dataset.square]||0;square.dataset.gcaVisit=String(value);square.style.setProperty('--gca-visit-alpha',String(value/max*.32));});
  el('gca-visit-top').innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([square,count])=>'<span>'+square+' · '+count+'</span>').join('')||'No visits yet';
}
function renderTimes(){
  el('gca-time-count').textContent=moveTimes.length+' moves timed';
  const max=Math.max(1,...moveTimes.map(item=>item.seconds));
  el('gca-time-bars').innerHTML=moveTimes.slice(-36).map(item=>'<i title="'+escapeHtml(item.label+' · '+item.seconds.toFixed(1)+'s')+'" style="height:'+Math.max(4,item.seconds/max*100)+'%"></i>').join('');
}
function onMove(move){
  const elapsed=Math.max(0,Math.min(600,(Date.now()-turnStarted)/1000));
  moveTimes.push({label:(move.color==='w'?'White ':'Black ')+move.san,seconds:elapsed});if(moveTimes.length>200)moveTimes.shift();turnStarted=Date.now();renderTimes();
  if(prefs.voice&&'speechSynthesis'in window){const utterance=new SpeechSynthesisUtterance((move.color==='w'?'White':'Black')+' played '+move.san);utterance.rate=1.05;window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);}
  if(visitEnabled)refreshVisits();
}
function onReset(){moveTimes=[];turnStarted=Date.now();renderTimes();el('gca-pawn-output').textContent='New position. Analyze to inspect its pawn structure.';if(visitEnabled)refreshVisits();}
function coordinateTap(event){
  if(!coordinate.active)return;const square=event.target.closest?.('[data-square]');if(!square)return;
  event.preventDefault();event.stopImmediatePropagation();
  coordinate.hits++;if(square.dataset.square===coordinate.target)coordinate.score++;
  el('gca-coordinate-score').textContent=coordinate.score+' / '+coordinate.hits;
  el('gca-coordinate-status').textContent=square.dataset.square===coordinate.target?'Correct — next square.':'Not quite — target remains '+coordinate.target+'.';
  nextCoordinate();
}
function nextCoordinate(){coordinate.target=FILES[Math.floor(Math.random()*8)]+(1+Math.floor(Math.random()*8));el('gca-coordinate-target').textContent='Find '+coordinate.target;}
function startCoordinate(){stopCoordinate();coordinate.active=true;coordinate.hits=0;coordinate.score=0;coordinate.left=30;nextCoordinate();el('gca-coordinate-score').textContent='0 / 0';el('gca-coordinate-status').textContent='30 seconds. Tap the square as quickly as you can.';coordinate.timer=window.setInterval(()=>{coordinate.left--;if(coordinate.left<=0){stopCoordinate();el('gca-coordinate-status').textContent='Time — '+coordinate.score+' correct out of '+coordinate.hits+'.';}else el('gca-coordinate-status').textContent=coordinate.left+' seconds remaining.';},1000);}
function stopCoordinate(){coordinate.active=false;if(coordinate.timer)window.clearInterval(coordinate.timer);coordinate.timer=null;}
function dueCard(){
  const now=Date.now();const due=OPENINGS.filter(card=>(prefs.reviews[card.id]?.due||0)<=now);
  const card=due[0]||OPENINGS.slice().sort((a,b)=>(prefs.reviews[a.id]?.due||0)-(prefs.reviews[b.id]?.due||0))[0];
  flashIndex=OPENINGS.indexOf(card);el('gca-flash-front').textContent=card.front;el('gca-flash-note').textContent='Due now: '+due.length+' · Reveal the answer when ready.';
}
function revealCard(){const card=OPENINGS[flashIndex];el('gca-flash-front').textContent=card.back;el('gca-flash-note').textContent=card.note;}
function rateCard(known){const card=OPENINGS[flashIndex];const old=prefs.reviews[card.id]||{step:0};const next=known?Math.min(3,(old.step||0)+1):0;const days=known?[1,3,7,14][next]:0;prefs.reviews[card.id]={step:next,due:Date.now()+days*86400000};save();dueCard();}
function saveLine(){
  const side=el('gca-line-side').value;const name=el('gca-line-name').value.trim();const text=el('gca-line-moves').value.trim();
  if(!name||!text){el('gca-line-status').textContent='Enter a line name and SAN moves.';return;}
  const chess=new Chess();
  try{const tokens=text.replace(/\d+\./g,' ').replace(/[!?+#]+/g,'').trim().split(/\s+/);for(const token of tokens)if(token&&token!=='…')chess.move(token,{strict:false});}
  catch(error){el('gca-line-status').textContent='Illegal line: '+error.message;return;}
  if(!chess.history().length){el('gca-line-status').textContent='No legal SAN moves found.';return;}
  prefs.lines.push({side,name:name.slice(0,50),moves:chess.history(),pgn:chess.pgn()});save();renderLines();el('gca-line-status').textContent='Saved '+name+' ('+chess.history().length+' plies).';el('gca-line-name').value='';el('gca-line-moves').value='';
}
function renderLines(){
  el('gca-line-list').innerHTML=prefs.lines.length?prefs.lines.map((line,index)=>'<div class="gc-move"><span>'+escapeHtml(line.side)+' · '+escapeHtml(line.name)+'<small class="gca-muted"> '+escapeHtml(line.moves.join(' '))+'</small></span><button data-gca-remove="'+index+'">Remove</button></div>').join(''):'<div class="gc-empty">No repertoire lines saved.</div>';
  el('gca-line-list').querySelectorAll('[data-gca-remove]').forEach(button=>button.addEventListener('click',()=>{prefs.lines.splice(Number(button.dataset.gcaRemove),1);save();renderLines();}));
}
function voiceMove(text){
  let phrase=String(text||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  Object.entries(WORDS).forEach(([word,digit])=>{phrase=phrase.replace(new RegExp('\\b'+word+'\\b','g'),digit);});
  const castle=/castle.*(king|short)|kingside castle/.test(phrase);
  const longCastle=/castle.*(queen|long)|queenside castle/.test(phrase);
  if(castle||longCastle){api.playMove({from:api.turn==='w'?'e1':'e8',to:api.turn==='w'?(castle?'g1':'c1'):(castle?'g8':'c8')});return true;}
  const targetMatch=phrase.match(/\b([a-h])\s*([1-8])\b/);if(!targetMatch)return false;
  const target=targetMatch[1]+targetMatch[2];const name=/\b(king|queen|rook|bishop|knight|pawn)\b/.exec(phrase)?.[1];
  const type=name?({king:'k',queen:'q',rook:'r',bishop:'b',knight:'n',pawn:'p'}[name]):null;
  const moves=api.game.moves({verbose:true}).filter(move=>move.to===target&&(!type||move.piece===type));
  if(moves.length!==1)return false;api.playMove({from:moves[0].from,to:moves[0].to,promotion:moves[0].promotion||'q'});return true;
}
function startVoice(){
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){el('gca-voice-status').textContent='Speech recognition is not supported in this browser.';return;}
  try{recognition?.stop();recognition=new Speech();recognition.lang='en-US';recognition.interimResults=false;recognition.maxAlternatives=1;
    el('gca-voice-status').textContent='Listening — say “Knight f3”.';
    recognition.onresult=event=>{const phrase=event.results?.[0]?.[0]?.transcript||'';const accepted=voiceMove(phrase);el('gca-voice-status').textContent=accepted?'Move command submitted: '+phrase:'Could not match “'+phrase+'” to one legal move.';};
    recognition.onerror=event=>{el('gca-voice-status').textContent='Voice error: '+event.error;};recognition.onend=()=>{recognition=null;};recognition.start();
  }catch(error){el('gca-voice-status').textContent='Microphone could not start: '+error.message;}
}
function drawFrame(ctx,canvas,fen,ply){
  const chess=new Chess(fen);const board=chess.board();const size=canvas.width/8;ctx.fillStyle='#101722';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#f3f5f8';ctx.font='bold 22px system-ui';ctx.fillText('GLASS CHESS',22,31);ctx.fillStyle='#abb4c2';ctx.font='14px system-ui';ctx.fillText('Ply '+ply,canvas.width-85,31);
  for(let r=0;r<8;r++)for(let f=0;f<8;f++){ctx.fillStyle=(r+f)%2?'#586c87':'#dbe4f0';ctx.fillRect(f*size,42+r*size,size,size);const piece=board[r][f];if(piece){const glyph=({w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}}[piece.color])[piece.type];ctx.font='bold 58px "Segoe UI Symbol",serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=piece.color==='w'?'#fffdf4':'#151c27';ctx.fillText(glyph,f*size+size/2,42+r*size+size/2);}}
  ctx.textAlign='start';ctx.textBaseline='alphabetic';
}
async function exportReplay(){
  if(!window.MediaRecorder||!document.createElement('canvas').captureStream){el('gca-export-status').textContent='This browser cannot record canvas video.';return;}
  const history=api.history||[];let positions=[];
  try{positions=api.calculatePositions(api.initialFen||new Chess().fen(),history);}catch(error){el('gca-export-status').textContent='Could not create replay: '+error.message;return;}
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=762;const ctx=canvas.getContext('2d');const stream=canvas.captureStream(24);
  const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';let recorder;
  try{recorder=new MediaRecorder(stream,{mimeType:mime});}catch(error){stream.getTracks().forEach(track=>track.stop());el('gca-export-status').textContent='Video export unavailable: '+error.message;return;}
  const chunks=[];recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};const stopped=new Promise(resolve=>{recorder.onstop=resolve;});recorder.start();
  el('gca-export-status').textContent='Recording '+positions.length+' positions…';
  for(let i=0;i<positions.length;i++){drawFrame(ctx,canvas,positions[i],i);await new Promise(resolve=>window.setTimeout(resolve,420));}
  recorder.stop();await stopped;stream.getTracks().forEach(track=>track.stop());const blob=new Blob(chunks,{type:'video/webm'});const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='glass-chess-replay.webm';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  el('gca-export-status').textContent='WebM replay exported · '+history.length+' plies.';
}
function refresh(){if(visitEnabled)refreshVisits();}
function mount(chessApi,premiumRoot){
  if(!chessApi||!premiumRoot||window.GlassChessAdvancedLab)return;api=chessApi;root=premiumRoot;prefs=readPrefs();
  mountUI();syncUI();bindUI();renderTimes();renderLines();dueCard();
  window.GlassChessAdvancedLab={onMove,onReset,refresh,getAutoPromotion(){return prefs.promotion;},getPreferences(){return {...prefs};}};
}
export function mountAdvancedLab(chessApi,premiumRoot){mount(chessApi,premiumRoot);}
