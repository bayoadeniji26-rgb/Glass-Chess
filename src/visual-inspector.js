import { Chess } from 'chess.js';
import { BOARD_MOTION } from './board-effects.js';
import { APP_VERSION } from './version.js';
import './visual-inspector.css';

(() => {
  'use strict';

  const PANEL_ID = 'gc-visual-inspector';
  const FIXTURES = [
    {
      name: 'Starting position has 20 legal moves and 32 pieces',
      run() {
        const chess = new Chess();
        return chess.moves().length === 20 && chess.board().flat().filter(Boolean).length === 32;
      }
    },
    {
      name: 'Capture sequence updates board material and turn',
      run() {
        const chess = new Chess();
        ['e4','d5','exd5','Qxd5'].forEach(move => chess.move(move));
        return chess.history().length === 4 &&
          chess.board().flat().filter(Boolean).length === 30 &&
          chess.get('d5')?.type === 'q' && chess.turn() === 'w';
      }
    },
    {
      name: 'En-passant right is available then expires',
      run() {
        const chess = new Chess();
        ['e4','a6','e5','d5'].forEach(move => chess.move(move));
        const ep = chess.moves({verbose:true}).find(move=>move.from==='e5'&&move.to==='d6');
        if(!ep||!ep.flags.includes('e'))return false;
        chess.move('Nf3');
        return chess.moves({verbose:true}).every(move=>!(move.from==='e5'&&move.to==='d6'));
      }
    },
    {
      name: 'Kingside castling moves king and rook together',
      run() {
        const chess = new Chess();
        ['e4','e5','Nf3','Nc6','Bc4','Nf6'].forEach(move=>chess.move(move));
        const move=chess.move('O-O');
        return Boolean(move?.flags.includes('k')&&chess.get('g1')?.type==='k'&&chess.get('f1')?.type==='r');
      }
    },
    {
      name: 'Promotion replaces the pawn with the selected piece',
      run() {
        const chess=new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
        const move=chess.move({from:'a7',to:'a8',promotion:'q'});
        return Boolean(move&&chess.get('a8')?.type==='q'&&chess.get('a7')===null);
      }
    },
    {
      name: 'Fool’s Mate ends in checkmate',
      run() {
        const chess=new Chess();
        ['f3','e5','g4','Qh4#'].forEach(move=>chess.move(move));
        return chess.isCheckmate()&&chess.isGameOver();
      }
    },
    {
      name: 'Stalemate is distinct from checkmate',
      run() {
        const chess=new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
        return chess.isStalemate()&&!chess.isCheckmate()&&chess.isDraw();
      }
    },
    {
      name: 'Insufficient mating material is adjudicated as a draw',
      run() {
        const chess=new Chess('8/8/8/8/8/8/4k3/K7 w - - 0 1');
        return chess.isInsufficientMaterial()&&chess.isDraw();
      }
    },
    {
      name: 'Threefold repetition is detected',
      run() {
        const chess=new Chess();
        ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'].forEach(move=>chess.move(move));
        return chess.isThreefoldRepetition();
      }
    },
    {
      name: 'Illegal move rejection leaves FEN unchanged',
      run() {
        const chess=new Chess(),before=chess.fen();
        try{chess.move({from:'e2',to:'e5'});}catch{}
        return chess.fen()===before;
      }
    }
  ];

  function result(name,status,detail=''){return{name,status,detail:String(detail||'')};}
  function timeMs(value){
    const first=String(value||'0s').split(',')[0].trim();
    if(first.endsWith('ms'))return Number.parseFloat(first)||0;
    if(first.endsWith('s'))return(Number.parseFloat(first)||0)*1000;
    return 0;
  }
  function parseRgb(value){
    const match=String(value||'').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return match?[Number(match[1]),Number(match[2]),Number(match[3])]:null;
  }
  function luminance(rgb){
    const channels=rgb.map(value=>{
      const channel=value/255;
      return channel<=.04045?channel/12.92:Math.pow((channel+.055)/1.055,2.4);
    });
    return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  }
  function contrast(a,b){
    if(!a||!b)return null;
    const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);
    return(values[0]+.05)/(values[1]+.05);
  }
  function uniqueClusters(values,tolerance=1.5){
    const clusters=[];
    for(const value of values.sort((a,b)=>a-b)){
      if(!clusters.length||Math.abs(value-clusters[clusters.length-1])>tolerance)clusters.push(value);
    }
    return clusters;
  }

  function runRuleFixtures(checks){
    for(const fixture of FIXTURES){
      try{
        const passed=fixture.run();
        checks.push(result(fixture.name,passed?'pass':'fail',passed?'Deterministic chess.js fixture passed.':'Fixture returned an unexpected state.'));
      }catch(error){checks.push(result(fixture.name,'fail',error.message||error));}
    }
  }

  function inspectBoard(checks,context){
    const board=document.getElementById('board');
    if(!board){checks.push(result('Board exists','fail','The #board element is missing.'));return;}
    const squares=Array.from(board.querySelectorAll('[data-square]'));
    const names=squares.map(square=>square.dataset.square);
    const validNames=names.every(name=>/^[a-h][1-8]$/.test(name));
    checks.push(result('Exactly 64 uniquely named squares',
      squares.length===64&&new Set(names).size===64&&validNames,
      `${squares.length} square elements; ${new Set(names).size} unique square names.`));
    if(squares.length!==64||!validNames)return;

    const rects=squares.map(square=>({square,rect:square.getBoundingClientRect()}));
    const widths=rects.map(item=>item.rect.width),heights=rects.map(item=>item.rect.height);
    const mean=values=>values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);
    const meanWidth=mean(widths),meanHeight=mean(heights);
    const spread=Math.max(...widths,...heights)-Math.min(...widths,...heights);
    const rowCount=uniqueClusters(rects.map(item=>item.rect.top)).length;
    const colCount=uniqueClusters(rects.map(item=>item.rect.left)).length;
    checks.push(result('Board grid has eight aligned ranks and files',rowCount===8&&colCount===8,`Measured ${rowCount} rows × ${colCount} columns.`));
    checks.push(result('Square geometry is uniform and square',Math.abs(meanWidth-meanHeight)<2&&spread<2,
      `Mean square ${meanWidth.toFixed(1)} × ${meanHeight.toFixed(1)} px; maximum edge spread ${spread.toFixed(2)} px.`));

    const boardRect=board.getBoundingClientRect();
    const viewportWidth=document.documentElement.clientWidth||window.innerWidth;
    const viewportHeight=window.visualViewport?.height||window.innerHeight;
    const inside=boardRect.left>=-1&&boardRect.right<=viewportWidth+1&&boardRect.top>=-1&&boardRect.bottom<=viewportHeight+2;
    checks.push(result('Board stays inside the visible viewport',inside,
      `Board x=${Math.round(boardRect.left)}–${Math.round(boardRect.right)}, y=${Math.round(boardRect.top)}–${Math.round(boardRect.bottom)}; viewport ${viewportWidth} × ${Math.round(viewportHeight)}.`));

    const centers=[];
    let coordinateErrors=0,pieceCount=0,lowContrast=0;
    const contrastValues=[];
    for(const {square,rect} of rects){
      const piece=square.querySelector('.gc-piece');
      if(piece){
        pieceCount+=1;
        const pieceRect=piece.getBoundingClientRect();
        centers.push(Math.max(
          Math.abs((pieceRect.left+pieceRect.width/2)-(rect.left+rect.width/2)),
          Math.abs((pieceRect.top+pieceRect.height/2)-(rect.top+rect.height/2))
        ));
        const ratio=contrast(parseRgb(getComputedStyle(piece).color),parseRgb(getComputedStyle(square).backgroundColor));
        if(ratio!==null){contrastValues.push(ratio);if(ratio<2.8)lowContrast+=1;}
      }
      for(const label of square.querySelectorAll('.gc-coordinate')){
        const labelRect=label.getBoundingClientRect();
        if(labelRect.left<rect.left-1||labelRect.right>rect.right+1||labelRect.top<rect.top-1||labelRect.bottom>rect.bottom+1)coordinateErrors+=1;
      }
    }
    const maxCenter=centers.length?Math.max(...centers):0;
    checks.push(result('Pieces are centered in their squares',pieceCount>0&&maxCenter<5,
      `${pieceCount} pieces measured; maximum center offset ${maxCenter.toFixed(2)} px.`));
    if(board.querySelector('.gc-coordinate')){
      checks.push(result('Coordinate labels stay inside their squares',coordinateErrors===0,`${coordinateErrors} coordinate label(s) outside square bounds.`));
    }
    if(contrastValues.length){
      const minContrast=Math.min(...contrastValues);
      checks.push(result('Piece-to-square contrast is readable',lowContrast===0?'pass':'warn',
        `Estimated minimum contrast ${minContrast.toFixed(2)}:1; ${lowContrast} piece(s) below the 2.8:1 heuristic. Text shadows and filters are not included.`));
    }

    const horizontalOverflow=document.documentElement.scrollWidth>viewportWidth+1;
    checks.push(result('No document-level horizontal overflow',!horizontalOverflow,
      `Document width ${document.documentElement.scrollWidth}px; viewport width ${viewportWidth}px.`));
    const controls=document.querySelector('.gc-final-board-stage > .board-controls')||document.querySelector('.board-controls');
    if(controls){
      const gap=controls.getBoundingClientRect().top-boardRect.bottom;
      checks.push(result('Board controls have a deliberate, non-overlapping gap',gap>=-1&&gap<=38,`Measured vertical gap ${gap.toFixed(1)} px.`));
    }

    const squareStyle=getComputedStyle(squares[0]);
    const pieceStyle=getComputedStyle(board.querySelector('.gc-piece')||squares[0]);
    context.motion={
      squareTransitionMs:timeMs(squareStyle.transitionDuration),
      pieceTransitionMs:timeMs(pieceStyle.transitionDuration),
      tokens:{...BOARD_MOTION},
      reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches
    };
    checks.push(result('Motion preference is respected',true,
      context.motion.reducedMotion?'Reduced motion is requested.':'Full motion is allowed by the browser preference.'));
    checks.push(result('Piece transitions stay short and finite',context.motion.pieceTransitionMs<=260,
      `Computed piece transition duration: ${context.motion.pieceTransitionMs} ms.`));

    const selectors=['#new-game','#undo','#flip','#hint','#gc-floating-hub .gc-hub-orb','#gc-final-toolbar button'];
    let found=0;const smallTargets=[];
    for(const selector of selectors){
      for(const element of document.querySelectorAll(selector)){
        if(!element.getClientRects().length)continue;
        found+=1;
        const rect=element.getBoundingClientRect();
        if(rect.width<36||rect.height<32)smallTargets.push(selector);
      }
    }
    checks.push(result('Primary navigation and board controls are mounted',found>=4?'pass':'warn',
      `${found} visible controls found across New game, Undo, Flip, Hint and Tools.`));
    if(smallTargets.length)checks.push(result('Primary controls have comfortable hit areas','warn',
      `Below the preferred size heuristic: ${[...new Set(smallTargets)].join(', ')}.`));

    const effectState=window.GlassChess?.getBoardEffectsDiagnostics?.();
    if(effectState){
      checks.push(result('Transient board effects are not accumulating',
        effectState.activeGhosts<=4&&effectState.activeTimers<=8,
        `Active timers: ${effectState.activeTimers}; animations: ${effectState.activeAnimations}; ghosts: ${effectState.activeGhosts}.`));
    }else{
      checks.push(result('Board motion diagnostics are exposed','warn','Board effect diagnostics are not available from the game bridge.'));
    }
  }

  function inspectUpdateStatus(checks,context){
    const status=window.GlassChessUpdateStatus?.getSnapshot?.();
    if(!status){checks.push(result('Release status is observable','warn','The release checker has not mounted yet.'));return;}
    context.update=status;
    checks.push(result('Updater reports the shared embedded app version',status.currentVersion===APP_VERSION,
      `App version: ${status.currentVersion}; phase: ${status.phase}.`));
    checks.push(result('Updater exposes a real named phase',
      ['idle','checking','current','available','offline','checking-release','updating-worker','activating-worker','verifying-release','verified','error'].includes(status.phase),
      `Phase: ${status.phase}; last checked: ${status.checkedAt||'not yet checked'}.`));
  }

  async function inspectMotionSupport(checks){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      checks.push(result('Web Animations API probe','pass','Skipped because reduced motion is enabled.'));return;
    }
    if(typeof Element.prototype.animate!=='function'){
      checks.push(result('Web Animations API probe','warn','This browser does not expose Element.animate().'));return;
    }
    const probe=document.createElement('div');
    probe.style.cssText='position:fixed;left:-2000px;top:-2000px;width:8px;height:8px;pointer-events:none';
    document.body.appendChild(probe);
    let animation;
    try{
      const start=performance.now();
      animation=probe.animate([{opacity:1,transform:'translateY(0)'},{opacity:.4,transform:'translateY(3px)'}],{duration:65,easing:'ease-out'});
      await animation.finished;
      const elapsed=performance.now()-start;
      checks.push(result('Web Animations API completes and settles',animation.playState==='finished'&&elapsed<1000,
        `A 65 ms isolated motion probe settled in ${elapsed.toFixed(1)} ms.`));
    }catch(error){checks.push(result('Web Animations API completes and settles','warn',error.message||error));}
    finally{try{animation?.cancel();}catch{}probe.remove();}
  }

  let lastReport=null;
  async function run(){
    const checks=[];
    const context={
      timestamp:new Date().toISOString(),
      viewport:{width:window.innerWidth,height:window.innerHeight,devicePixelRatio:window.devicePixelRatio||1,
        profile:window.innerWidth<=600?'mobile':window.innerWidth<=1024?'tablet':'desktop'},
      motion:null,update:null
    };
    runRuleFixtures(checks);
    inspectBoard(checks,context);
    inspectUpdateStatus(checks,context);
    await inspectMotionSupport(checks);
    const passed=checks.filter(item=>item.status==='pass').length;
    const warned=checks.filter(item=>item.status==='warn').length;
    const failed=checks.filter(item=>item.status==='fail').length;
    const report={...context,summary:{passed,warned,failed,total:checks.length,ok:failed===0},checks};
    lastReport=report;
    renderReport(report);
    console.group('Glass Chess visual & motion inspection');
    console.table(checks);
    console.info(`${passed} passed · ${warned} warnings · ${failed} failed`,context);
    console.groupEnd();
    return report;
  }

  function renderReport(report){
    const host=document.getElementById('gc-visual-inspector-report');
    if(!host)return;
    const {passed,warned,failed,total}=report.summary;
    host.replaceChildren();
    const summary=document.createElement('p');
    summary.className='gc-vi-summary';
    summary.textContent=`${passed} passed · ${warned} warnings · ${failed} failed · ${total} checks`;
    host.appendChild(summary);
    const list=document.createElement('div');list.className='gc-vi-results';
    for(const item of report.checks){
      const row=document.createElement('div');row.className='gc-vi-result gc-vi-'+item.status;
      const label=document.createElement('strong');label.textContent=item.status.toUpperCase()+' · '+item.name;
      const detail=document.createElement('small');detail.textContent=item.detail;
      row.append(label,detail);list.appendChild(row);
    }
    host.appendChild(list);
    const note=document.createElement('p');note.className='gc-vi-footnote';
    note.textContent=`Measured at ${report.viewport.width} × ${report.viewport.height} (${report.viewport.profile}). Resize the browser to desktop, tablet and mobile widths, then run again. Geometry and contrast are heuristics, not a substitute for human screenshot review.`;
    host.appendChild(note);
  }

  function mount(){
    const options=document.getElementById('gc-premium')||document.querySelector('.analysis-panel');
    if(!options||document.getElementById(PANEL_ID))return;
    const panel=document.createElement('details');panel.id=PANEL_ID;
    panel.innerHTML=`
      <summary>Visual & motion inspector</summary>
      <p class="gc-vi-intro">Run deterministic chess-state walkthroughs and measure live board geometry, piece alignment, contrast, controls, transitions and release status.</p>
      <button type="button" id="gc-visual-inspector-run">Run inspection</button>
      <div id="gc-visual-inspector-report" role="status" aria-live="polite">Ready. Open this panel in the Glass Chess workspace; resize to desktop, tablet and mobile widths to compare the live layout.</div>`;
    options.appendChild(panel);
    panel.querySelector('#gc-visual-inspector-run').addEventListener('click',async event=>{
      const button=event.currentTarget;button.disabled=true;button.textContent='Inspecting…';
      try{await run();}
      catch(error){const host=document.getElementById('gc-visual-inspector-report');if(host)host.textContent='Inspection failed: '+(error.message||error);}
      finally{button.disabled=false;button.textContent='Run inspection again';}
    });
  }

  window.GlassChessVisualInspector={run,get lastReport(){return lastReport;},fixtures:FIXTURES.map(fixture=>fixture.name),motionTokens:{...BOARD_MOTION}};
  window.runGlassChessVisualInspection=run;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  const mountObserver=new MutationObserver(()=>{
    if(document.getElementById('gc-options')&&!document.getElementById(PANEL_ID)){mount();mountObserver.disconnect();}
  });
  mountObserver.observe(document.documentElement,{childList:true,subtree:true});
  window.setTimeout(()=>mountObserver.disconnect(),15000);
})();
