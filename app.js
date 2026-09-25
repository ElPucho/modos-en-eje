import {TONICS,MODES,INTERVALS,validatePentatonic,degreeForStep,spellNote,scaleNotes,chooseBarCount,chooseNextMode,chooseNextTonic} from './core.mjs';

const $=id=>document.getElementById(id);
const STORE_KEY='modos-en-eje-v1';
const SECTION_IDS=['fretboard','setup','rhythm','sound'];
const SECTION_LABELS={fretboard:'diapasón',setup:'ajustes',rhythm:'ritmo',sound:'sonido'};
const FRET_PAGE_STARTS=[0,4,8];
const mobileFretboard=window.matchMedia('(max-width:680px)');
const PAUSE_ICON='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="3" width="5" height="18" rx="1.5"/><rect x="14" y="3" width="5" height="18" rx="1.5"/></svg>';
const PLAY_ICON='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4.5v15l12-7.5z"/></svg>';
const DEFAULTS={
  family:'diatonic',tonicIndex:0,tonicRoute:'fixed',rootEvery:4,
  selected:{diatonic:MODES.diatonic.map(m=>m.id),pentatonic:MODES.pentatonic.map(m=>m.id)},
  bpm:100,numerator:4,denominator:4,pulseGroup:1,minBars:4,maxBars:8,minSeconds:10,sessionMinutes:0,
  view:'guide',clickEnabled:true,voiceEnabled:true,drumsEnabled:false,droneEnabled:false,
  swing:66,drumVolume:45,voiceUri:'',priority:{diatonic:[],pentatonic:[]},pentaSteps:{},sectionOrder:[...SECTION_IDS]
};
function loadSettings(){
  let saved={};try{saved=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch{}
  const result={...DEFAULTS,...saved,selected:{...DEFAULTS.selected,...saved.selected},priority:{...DEFAULTS.priority,...saved.priority},pentaSteps:{...saved.pentaSteps}};
  for(const family of ['diatonic','pentatonic']){
    result.selected[family]=Array.isArray(result.selected[family])?result.selected[family].filter(id=>MODES[family].some(m=>m.id===id)):DEFAULTS.selected[family];
    if(!result.selected[family].length)result.selected[family]=[MODES[family][0].id];
    result.priority[family]=Array.isArray(result.priority[family])?result.priority[family].filter(id=>MODES[family].some(m=>m.id===id)):[];
  }
  for(const mode of MODES.pentatonic)if(!validatePentatonic(result.pentaSteps[mode.id]))delete result.pentaSteps[mode.id];
  if(!['diatonic','pentatonic'].includes(result.family))result.family='diatonic';
  if(!Number.isInteger(result.tonicIndex)||result.tonicIndex<0||result.tonicIndex>=TONICS.length)result.tonicIndex=0;
  if(result.view==='ear'&&!result.voiceEnabled)result.view='guide';
  if(!Array.isArray(result.sectionOrder)||result.sectionOrder.length!==SECTION_IDS.length||SECTION_IDS.some(id=>!result.sectionOrder.includes(id)))result.sectionOrder=[...SECTION_IDS];
  return result;
}
let settings=loadSettings(),previewModeId=settings.selected[settings.family][0],session=null,toastTimer=0,availableVoices=[],editingSteps=[],fretPage=0;
function save(){try{localStorage.setItem(STORE_KEY,JSON.stringify(settings))}catch{}}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500)}
function renderSectionOrder(){
  const layout=document.querySelector('.layout');
  settings.sectionOrder.forEach((id,index)=>{
    const section=layout.querySelector(`[data-section="${id}"]`);
    layout.appendChild(section);
    section.querySelector('[data-move="up"]').disabled=index===0;
    section.querySelector('[data-move="down"]').disabled=index===SECTION_IDS.length-1;
  });
}
function setupSectionOrder(){
  for(const id of SECTION_IDS){
    const section=document.querySelector(`[data-section="${id}"]`);
    const controls=document.createElement('div');controls.className='order-controls';
    controls.innerHTML=`<span>ORDEN</span><button type="button" data-move="up" aria-label="Subir ${SECTION_LABELS[id]}" title="Subir ${SECTION_LABELS[id]}">↑</button><button type="button" data-move="down" aria-label="Bajar ${SECTION_LABELS[id]}" title="Bajar ${SECTION_LABELS[id]}">↓</button>`;
    section.querySelector('.section-heading').appendChild(controls);
    controls.addEventListener('click',event=>{
      const button=event.target.closest('button[data-move]');if(!button)return;
      const index=settings.sectionOrder.indexOf(id),next=index+(button.dataset.move==='up'?-1:1);
      if(next<0||next>=SECTION_IDS.length)return;
      const order=[...settings.sectionOrder];[order[index],order[next]]=[order[next],order[index]];
      settings.sectionOrder=order;save();renderSectionOrder();
    });
  }
  renderSectionOrder();
}
function selectedMode(family=settings.family,id=session?.modeId||previewModeId){return MODES[family].find(m=>m.id===id)||MODES[family][0]}
function selectedSteps(mode,family=settings.family){return family==='pentatonic'?(settings.pentaSteps[mode.id]||mode.steps):mode.steps}
function currentTonic(){return TONICS[session?.displayTonicIndex??settings.tonicIndex]}
function currentMode(){return selectedMode(settings.family,session?.displayModeId||previewModeId)}
function currentNotes(){const mode=currentMode();return scaleNotes(currentTonic(),mode,selectedSteps(mode))}
function number(id,min,max,fallback){const v=Number($(id).value);return Number.isFinite(v)?Math.min(max,Math.max(min,Math.round(v))):fallback}
function syncNumericInputs(){
  const fields={'root-every':['rootEvery',1,32,4],'meter-numerator':['numerator',1,64,4],'meter-denominator':['denominator',1,128,4],
    'pulse-group':['pulseGroup',1,16,1],'min-bars':['minBars',1,64,4],'max-bars':['maxBars',1,64,8],
    'min-seconds':['minSeconds',0,120,10],'session-minutes':['sessionMinutes',0,180,0]};
  for(const [id,[key,min,max,fallback]] of Object.entries(fields))settings[key]=number(id,min,max,fallback);
  settings.pulseGroup=Math.min(settings.pulseGroup,settings.numerator);
  settings.maxBars=Math.max(settings.maxBars,settings.minBars);
  fillControls();save();renderReadouts();
}

function renderTonicList(){
  $('tonic-list').innerHTML=TONICS.map((t,i)=>`<button type="button" data-index="${i}" class="${i===settings.tonicIndex?'selected':''}" aria-pressed="${i===settings.tonicIndex}">${t.label}</button>`).join('');
}
function renderModeList(){
  const ids=settings.selected[settings.family];
  $('mode-list').innerHTML=MODES[settings.family].map(m=>{
    const on=ids.includes(m.id);
    return `<span class="mode-item ${on?'selected':''}"><button type="button" class="mode-preview" data-preview="${m.id}" aria-label="Ver ${m.name}">${m.name}</button><button type="button" class="mode-toggle" data-toggle="${m.id}" aria-label="${on?'Quitar':'Añadir'} ${m.name}" aria-pressed="${on}">${on?'×':'+'}</button></span>`;
  }).join('');
  for(const family of ['diatonic','pentatonic']){$('family-'+family).classList.toggle('selected',settings.family===family);$('family-'+family).setAttribute('aria-pressed',settings.family===family)}
}
function renderLights(active=-1){
  $('beat-lights').innerHTML=Array.from({length:settings.numerator},(_,i)=>`<span class="beat-light ${i===0?'first':''} ${i===active?'active':''}" aria-hidden="true"></span>`).join('');
  $('beat-lights').setAttribute('aria-label',`${settings.numerator} unidades por compás; pulso actual ${active<0?'ninguno':active+1}`);
}
function renderFretboard(notes){
  const map=new Map(notes.map(n=>[n.pc,n]));
  const strings=[['Mi',4,1],['Si',11,2],['Sol',7,3],['Re',2,4],['La',9,5],['Mi',4,6]];
  const first=mobileFretboard.matches?FRET_PAGE_STARTS[fretPage]:0;
  const frets=Array.from({length:mobileFretboard.matches?5:13},(_,i)=>first+i);
  const header='<div class="fret-row fret-header"><span></span>'+frets.map(f=>`<span>${f}</span>`).join('')+'</div>';
  const rows=strings.map(([name,pc,string])=>'<div class="fret-row"><span class="string-label">'+name+' '+string+'</span>'+frets.map(f=>{
    const n=map.get((pc+f)%12);
    return `<span class="fret-cell ${f===0?'open-string':''}">${n?`<span class="fret-note ${n.root?'root':n.color?'color':''}" title="${n.name} · ${n.degree}">${n.name}</span>`:''}</span>`;
  }).join('')+'</div>').join('');
  $('fretboard').style.setProperty('--fret-count',frets.length);
  $('fretboard').innerHTML=header+rows;
  $('fretboard').setAttribute('aria-label',`Diapasón de guitarra de los trastes ${frets[0]} a ${frets.at(-1)}; notas de ${notes[0].name} ${currentMode().name}`);
  $('fret-range').textContent=`Trastes ${frets[0]}–${frets.at(-1)}`;
  $('fret-prev').disabled=fretPage===0;
  $('fret-next').disabled=fretPage===FRET_PAGE_STARTS.length-1;
}
function renderFormula(notes){
  $('formula').innerHTML=notes.map(n=>`<span class="degree-chip ${n.root?'root':n.color?'color':''}"><b>${n.degree}</b> ${n.name}</span>`).join('')+(settings.family==='pentatonic'?'<button id="formula-edit" type="button" class="secondary-button">Editar estas 5 notas</button>':'');
  if(settings.family==='pentatonic')$('formula-edit').addEventListener('click',openFormulaEditor);
}
function renderStage(){
  const mode=currentMode(),tonic=currentTonic(),notes=currentNotes();
  $('current-tonic').textContent=tonic.label;
  $('current-mode').textContent=settings.view==='ear'?'Escucha':mode.name;
  $('current-family').textContent=settings.family==='diatonic'?'Diatonismo · 7 notas':'Pentatonismo · 5 notas';
  $('notes').innerHTML=notes.map(n=>`<span class="note ${n.root?'root':n.color?'color':''}">${n.name}</span>`).join('');
  $('mode-hint').textContent=session?.status==='running'?(session.currentBar<0?'Un compás de entrada antes de empezar.':'Escucha el anuncio: el próximo cambio es imprevisible.'):'Los cambios llegarán por sorpresa al inicio de un compás.';
  renderFretboard(notes);renderFormula(notes);document.body.dataset.view=settings.view;
  for(const view of ['guide','memory','ear']){$('view-'+view).classList.toggle('selected',settings.view===view);$('view-'+view).setAttribute('aria-pressed',settings.view===view)}
  $('learning-intro').textContent=settings.view==='guide'?'Las notas iluminadas pertenecen al modo. La tónica aparece en dorado.':settings.view==='memory'?'Recuerda las notas antes de mirar el diapasón. Puedes volver a Guía cuando quieras.':'Escucha la voz e imagina el modo sin pistas visuales.';
  $('repeat-button').textContent=settings.priority[settings.family].includes(mode.id)?'✓ Modo prioritario':'↻ Priorizar este modo';$('repeat-button').disabled=false;
}
function renderStatus(){
  const status=session?.status||'stopped';
  $('status-pill').textContent=status==='running'?'EN PRÁCTICA':status==='paused'?'EN PAUSA':'LISTO PARA TOCAR';$('status-pill').classList.toggle('running',status==='running');
  $('start-button').querySelector('span').textContent=status==='stopped'?'Empezar práctica':'Terminar práctica';$('start-button').firstChild.textContent=status==='stopped'?'▶ ':'■ ';
  $('pause-button').disabled=status==='stopped';$('pause-button').innerHTML=status==='paused'?PLAY_ICON:PAUSE_ICON;$('pause-button').setAttribute('aria-label',status==='paused'?'Reanudar':'Pausar');
  $('next-button').disabled=status==='stopped';$('change-count').textContent=`${session?.changes||0} cambios`;
}
function renderReadouts(){
  $('meter-readout').textContent=`${settings.numerator}/${settings.denominator}`;$('bpm-readout').textContent=`${settings.bpm} BPM`;$('bpm-value').textContent=settings.bpm;
  $('swing-value').textContent=settings.swing+' %';$('drum-volume-value').textContent=settings.drumVolume+' %';
  $('root-every').disabled=settings.tonicRoute==='fixed'||!!session;renderLights(session?.activeUnit??-1);
}
function renderAll(){renderTonicList();renderModeList();renderStage();renderReadouts();renderStatus()}
function fillControls(){
  const fields={'tonic-route':'tonicRoute','root-every':'rootEvery','bpm':'bpm','meter-numerator':'numerator','meter-denominator':'denominator','pulse-group':'pulseGroup','min-bars':'minBars','max-bars':'maxBars','min-seconds':'minSeconds','session-minutes':'sessionMinutes','swing':'swing','drum-volume':'drumVolume'};
  for(const [id,key] of Object.entries(fields))$(id).value=settings[key];
  for(const [id,key] of Object.entries({'click-enabled':'clickEnabled','voice-enabled':'voiceEnabled','drums-enabled':'drumsEnabled','drone-enabled':'droneEnabled'}))$(id).checked=settings[key];
  $('voice-select').value=settings.voiceUri;
}
function lockConfig(locked){
  ['tonic-route','root-every','meter-numerator','meter-denominator','pulse-group','min-bars','max-bars','min-seconds','session-minutes','select-all','family-diatonic','family-pentatonic','reset-button'].forEach(id=>$(id).disabled=locked);
  document.querySelectorAll('#tonic-list button,#mode-list button').forEach(button=>button.disabled=locked);
  if(!locked)$('root-every').disabled=settings.tonicRoute==='fixed';
}
function openFormulaEditor(){
  if(session){toast('Termina la sesión para editar la fórmula.');return}
  editingSteps=[...selectedSteps(currentMode())];$('formula-title').textContent=`Editar ${currentMode().name.toLowerCase()} pentatónico`;
  $('formula-error').textContent='';renderIntervalGrid();$('formula-dialog').showModal();
}
function renderIntervalGrid(){
  const tonic=currentTonic(),mode=currentMode();
  $('interval-grid').innerHTML=INTERVALS.map((degree,step)=>`<button type="button" data-step="${step}" class="interval-option ${editingSteps.includes(step)?'selected':''}" aria-pressed="${editingSteps.includes(step)}" ${step===0?'disabled':''}><b>${degree}</b><small>${spellNote(tonic,step,degreeForStep(step,mode.id))}</small></button>`).join('');
  $('formula-error').textContent=`${editingSteps.length} de 5 notas seleccionadas`;
}

function noiseBuffer(ctx){
  const length=Math.ceil(ctx.sampleRate*.6),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=Math.random()*2-1;
  return buffer;
}
function noiseHit(s,time,filterType,frequency,duration,volume){
  const src=s.ctx.createBufferSource(),filter=s.ctx.createBiquadFilter(),gain=s.ctx.createGain();
  src.buffer=s.noise;filter.type=filterType;filter.frequency.setValueAtTime(frequency,time);
  gain.gain.setValueAtTime(Math.max(.0001,volume),time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  src.connect(filter).connect(gain).connect(s.ctx.destination);src.start(time);src.stop(time+duration+.01);
}
function toneHit(s,time,freq,duration,volume){
  const osc=s.ctx.createOscillator(),gain=s.ctx.createGain();osc.type='sine';
  osc.frequency.setValueAtTime(freq,time);osc.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.68),time+duration);
  gain.gain.setValueAtTime(Math.max(.0001,volume),time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  osc.connect(gain).connect(s.ctx.destination);osc.start(time);osc.stop(time+duration+.01);
}
function scheduleClick(s,time,unit){
  if(!settings.clickEnabled)return;
  const first=unit===0,group=unit%settings.pulseGroup===0;
  toneHit(s,time,first?1300:group?1050:820,.035,first?.18:group?.11:.055);
}
function scheduleDrums(s,time,unit){
  if(!settings.drumsEnabled||unit%settings.pulseGroup!==0)return;
  const amount=settings.drumVolume/100;if(amount<=0)return;
  const beat=Math.floor(unit/settings.pulseGroup);
  const unitSeconds=60/(settings.bpm*settings.pulseGroup);
  const beatLength=unitSeconds*Math.min(settings.pulseGroup,settings.numerator-unit);
  noiseHit(s,time,'highpass',5600,.24,.055*amount);
  noiseHit(s,time+beatLength*settings.swing/100,'highpass',6700,.13,.033*amount);
  if(beat===0)toneHit(s,time,110,.22,.16*amount);
  if(beat%2===1){noiseHit(s,time,'bandpass',1900,.16,.10*amount);noiseHit(s,time,'highpass',9000,.055,.05*amount)}
}
function droneFrequency(pc){return 130.81278265*Math.pow(2,pc/12)}
function makeDrone(s){
  const ctx=s.ctx,osc=ctx.createOscillator(),oct=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
  const freq=droneFrequency(TONICS[s.tonicIndex].pc);
  osc.type='sine';oct.type='triangle';osc.frequency.value=freq;oct.frequency.value=freq*2;
  filter.type='lowpass';filter.frequency.value=600;gain.gain.value=0;
  osc.connect(filter);oct.connect(filter);filter.connect(gain).connect(ctx.destination);
  osc.start();oct.start();s.drone={osc,oct,gain};updateDrone(s,ctx.currentTime);
}
function updateDrone(s,time){
  if(!s.drone)return;
  const freq=droneFrequency(TONICS[s.tonicIndex].pc);
  s.drone.osc.frequency.setTargetAtTime(freq,time,.06);s.drone.oct.frequency.setTargetAtTime(freq*2,time,.06);
  s.drone.gain.gain.setTargetAtTime(settings.droneEnabled?.035:0,time,.08);
}
function speak(rootIndex,modeId,force=false){
  if((!settings.voiceEnabled&&!force)||!('speechSynthesis' in window))return;
  const spokenTonic=TONICS[rootIndex].label.replace('♯',' sostenido').replace('♭',' bemol');
  const utterance=new SpeechSynthesisUtterance(`${spokenTonic} ${selectedMode(settings.family,modeId).name}`);
  utterance.lang='es-ES';utterance.rate=1.08;utterance.volume=1;
  const voice=availableVoices.find(v=>v.voiceURI===settings.voiceUri)||availableVoices.find(v=>v.lang.toLowerCase().startsWith('es'));
  if(voice)utterance.voice=voice;
  speechSynthesis.cancel();speechSynthesis.speak(utterance);
}
function scheduler(){
  const s=session;if(!s||s.status!=='running')return;
  let guard=0;
  while(s.nextUnitTime<s.ctx.currentTime+.14&&guard++<128){
    const unit=s.unitCount%s.numerator,bar=Math.floor(s.unitCount/s.numerator)-1,time=s.nextUnitTime;
    if(unit===0){
      let cue=false;
      if(bar===0){s.startAt=time;cue=true}
      else if(bar>0&&(bar>=s.nextChangeAt||s.forceNext)){
        s.forceNext=false;
        s.modeId=chooseNextMode(settings.selected[settings.family],s.modeId,settings.priority[settings.family]);
        s.modeChangesSinceRoot++;
        if(s.modeChangesSinceRoot>=settings.rootEvery){s.tonicIndex=chooseNextTonic(s.tonicIndex,settings.tonicRoute);s.modeChangesSinceRoot=0;updateDrone(s,time)}
        s.nextChangeAt=bar+chooseBarCount(settings.minBars,settings.maxBars,settings.minSeconds,settings.numerator,settings.pulseGroup,settings.bpm);
        s.changes++;cue=true;
      }
      s.events.push({type:'bar',time,bar,modeId:s.modeId,tonicIndex:s.tonicIndex,cue,changes:s.changes});
    }
    scheduleClick(s,time,unit);if(bar>=0)scheduleDrums(s,time,unit);
    s.events.push({type:'beat',time,unit});s.unitCount++;
    s.nextUnitTime+=60/(settings.bpm*settings.pulseGroup);
  }
}
function formatTime(seconds){const n=Math.max(0,Math.floor(seconds));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
function frame(){
  const s=session;if(!s||s.status!=='running')return;
  const now=s.ctx.currentTime;
  while(s.events.length&&s.events[0].time<=now+.015){
    const event=s.events.shift();
    if(event.type==='bar'){
      s.currentBar=event.bar;$('bar-readout').textContent=event.bar<0?'Cuenta atrás':`Compás ${event.bar+1}`;
      if(event.cue){s.displayModeId=event.modeId;s.displayTonicIndex=event.tonicIndex;$('change-count').textContent=`${event.changes} cambios`;renderStage();speak(event.tonicIndex,event.modeId)}
    }else{
      s.activeUnit=event.unit;
      for(const [i,light] of [...$('beat-lights').children].entries())light.classList.toggle('active',i===event.unit);
    }
  }
  if(s.startAt!==null){
    const elapsed=now-s.startAt;$('elapsed').textContent=formatTime(elapsed);
    if(settings.sessionMinutes>0&&elapsed>=settings.sessionMinutes*60){stopPractice();toast('Sesión terminada.');return}
  }
  s.frameId=requestAnimationFrame(frame);
}
async function requestWakeLock(){if(!('wakeLock' in navigator)||!session)return;try{session.wakeLock=await navigator.wakeLock.request('screen')}catch{}}
async function startPractice(){
  const AudioContextType=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextType){toast('Este navegador no permite reproducir el metrónomo.');return}
  try{
    syncNumericInputs();
    const ctx=new AudioContextType();await ctx.resume();
    const ids=settings.selected[settings.family],initialId=ids.includes(previewModeId)?previewModeId:ids[0];
    session={ctx,status:'running',noise:noiseBuffer(ctx),events:[],tonicIndex:settings.tonicIndex,displayTonicIndex:settings.tonicIndex,
      modeId:initialId,displayModeId:initialId,numerator:settings.numerator,unitCount:0,nextUnitTime:ctx.currentTime+.12,
      currentBar:-1,activeUnit:-1,startAt:null,changes:0,modeChangesSinceRoot:0,forceNext:false,
      nextChangeAt:chooseBarCount(settings.minBars,settings.maxBars,settings.minSeconds,settings.numerator,settings.pulseGroup,settings.bpm)};
    makeDrone(session);lockConfig(true);renderStatus();renderStage();
    $('elapsed').textContent='00:00';$('bar-readout').textContent='Cuenta atrás';
    scheduler();session.timerId=setInterval(scheduler,25);session.frameId=requestAnimationFrame(frame);requestWakeLock();
  }catch(error){console.error(error);toast('No se pudo iniciar el audio. Pulsa de nuevo para intentarlo.')}
}
async function pausePractice(){
  const s=session;if(!s)return;
  if(s.status==='running'){s.status='paused';clearInterval(s.timerId);cancelAnimationFrame(s.frameId);window.speechSynthesis?.cancel();await s.ctx.suspend()}
  else{await s.ctx.resume();s.status='running';s.timerId=setInterval(scheduler,25);s.frameId=requestAnimationFrame(frame);speak(s.displayTonicIndex,s.displayModeId);requestWakeLock()}
  renderStatus();
}
function stopPractice(){
  const s=session;if(!s)return;
  clearInterval(s.timerId);cancelAnimationFrame(s.frameId);window.speechSynthesis?.cancel();s.wakeLock?.release?.();
  if(s.drone){s.drone.osc.stop();s.drone.oct.stop()}s.ctx.close();session=null;lockConfig(false);
  $('bar-readout').textContent='Compás 0';$('elapsed').textContent='00:00';renderLights();renderStage();renderStatus();
}

function bind(){
  $('tonic-list').addEventListener('click',event=>{if(session)return;const button=event.target.closest('button[data-index]');if(!button)return;settings.tonicIndex=Number(button.dataset.index);save();renderTonicList();renderStage()});
  $('mode-list').addEventListener('click',event=>{if(session)return;const button=event.target.closest('button[data-preview],button[data-toggle]');if(!button)return;
    const id=button.dataset.preview||button.dataset.toggle,list=settings.selected[settings.family];
    if(button.dataset.toggle){
      if(list.includes(id)){if(list.length===1){toast('Mantén al menos un modo seleccionado.');return}settings.selected[settings.family]=list.filter(x=>x!==id);if(previewModeId===id)previewModeId=settings.selected[settings.family][0]}
      else settings.selected[settings.family]=[...list,id];
    }else{if(!list.includes(id))settings.selected[settings.family]=[...list,id];previewModeId=id}
    save();renderModeList();renderStage();
  });
  for(const family of ['diatonic','pentatonic'])$('family-'+family).addEventListener('click',()=>{if(session)return;settings.family=family;previewModeId=settings.selected[family][0];save();renderModeList();renderStage()});
  $('select-all').addEventListener('click',()=>{settings.selected[settings.family]=MODES[settings.family].map(m=>m.id);save();renderModeList()});
  $('tonic-route').addEventListener('change',()=>{settings.tonicRoute=$('tonic-route').value;save();renderReadouts()});
  const fields={
    'root-every':['rootEvery',1,32,4],'meter-numerator':['numerator',1,64,4],'meter-denominator':['denominator',1,128,4],
    'pulse-group':['pulseGroup',1,16,1],'min-bars':['minBars',1,64,4],'max-bars':['maxBars',1,64,8],
    'min-seconds':['minSeconds',0,120,10],'session-minutes':['sessionMinutes',0,180,0]
  };
  for(const [id,[key,min,max,fallback]] of Object.entries(fields))$(id).addEventListener('change',()=>{
    settings[key]=number(id,min,max,fallback);
    if(key==='pulseGroup'||key==='numerator')settings.pulseGroup=Math.min(settings.pulseGroup,settings.numerator);
    if(settings.maxBars<settings.minBars)settings.maxBars=settings.minBars;
    fillControls();save();renderReadouts();
  });
  $('bpm').addEventListener('input',()=>{settings.bpm=number('bpm',30,300,100);save();$('bpm-value').textContent=settings.bpm;$('bpm-readout').textContent=settings.bpm+' BPM'});
  for(const [id,key] of Object.entries({'click-enabled':'clickEnabled','voice-enabled':'voiceEnabled','drums-enabled':'drumsEnabled','drone-enabled':'droneEnabled'}))$(id).addEventListener('change',()=>{
    settings[key]=$(id).checked;if(key==='droneEnabled'&&session)updateDrone(session,session.ctx.currentTime);
    if(key==='voiceEnabled'&&!settings.voiceEnabled){window.speechSynthesis?.cancel();if(settings.view==='ear'){settings.view='guide';renderStage()}}
    save();
  });
  for(const [id,key] of Object.entries({swing:'swing','drum-volume':'drumVolume'}))$(id).addEventListener('input',()=>{settings[key]=Number($(id).value);save();renderReadouts()});
  for(const view of ['guide','memory','ear'])$('view-'+view).addEventListener('click',()=>{if(view==='ear'&&!settings.voiceEnabled){toast('Activa la voz para practicar de oído.');return}settings.view=view;save();renderStage()});
  for(const [id,delta] of [['fret-prev',-1],['fret-next',1]])$(id).addEventListener('click',()=>{fretPage=Math.max(0,Math.min(FRET_PAGE_STARTS.length-1,fretPage+delta));renderFretboard(currentNotes())});
  mobileFretboard.addEventListener('change',()=>renderFretboard(currentNotes()));
  $('start-button').addEventListener('click',()=>session?stopPractice():startPractice());
  $('pause-button').addEventListener('click',pausePractice);
  $('next-button').addEventListener('click',()=>{if(!session)return;session.forceNext=true;toast('El cambio llegará al comienzo del próximo compás.')});
  $('repeat-button').addEventListener('click',()=>{const id=currentMode().id,list=settings.priority[settings.family];settings.priority[settings.family]=list.includes(id)?list.filter(x=>x!==id):[...list,id];save();renderStage();toast(settings.priority[settings.family].includes(id)?'Este modo aparecerá más a menudo.':'Prioridad quitada.')});
  $('reset-button').addEventListener('click',()=>{if(!window.confirm('¿Restablecer todos los ajustes, el orden y las fórmulas pentatónicas?'))return;settings=structuredClone(DEFAULTS);previewModeId=settings.selected[settings.family][0];save();fillControls();renderAll();renderSectionOrder();toast('Ajustes restablecidos.')});
  $('formula-close').addEventListener('click',()=>$('formula-dialog').close());
  $('interval-grid').addEventListener('click',event=>{const button=event.target.closest('button[data-step]');if(!button)return;const step=Number(button.dataset.step);if(step===0)return;
    if(editingSteps.includes(step))editingSteps=editingSteps.filter(x=>x!==step);
    else if(editingSteps.length<5)editingSteps.push(step);
    else{toast('Quita una nota antes de añadir otra.');return}
    editingSteps.sort((a,b)=>a-b);renderIntervalGrid();
  });
  $('formula-default').addEventListener('click',()=>{editingSteps=[...currentMode().steps];renderIntervalGrid()});
  $('formula-save').addEventListener('click',()=>{if(!validatePentatonic(editingSteps)){$('formula-error').textContent='Selecciona exactamente cinco notas, incluida la tónica.';return}
    settings.pentaSteps[currentMode().id]=[...editingSteps];save();$('formula-dialog').close();renderStage();toast('Fórmula guardada para todas las tónicas.');
  });
  $('voice-test').addEventListener('click',()=>speak(session?.displayTonicIndex??settings.tonicIndex,session?.displayModeId??previewModeId,true));
  $('voice-select').addEventListener('change',()=>{settings.voiceUri=$('voice-select').value;save()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session?.status==='running')requestWakeLock()});
}
function loadVoices(){
  if(!('speechSynthesis' in window)){$('voice-enabled').disabled=true;$('voice-test').disabled=true;return}
  availableVoices=window.speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith('es'));
  $('voice-select').innerHTML='<option value="">Automática en español</option>'+availableVoices.map(v=>`<option value="${v.voiceURI.replaceAll('&','&amp;').replaceAll('"','&quot;')}">${v.name} · ${v.lang}</option>`).join('');
  $('voice-select').value=availableVoices.some(v=>v.voiceURI===settings.voiceUri)?settings.voiceUri:'';
  window.speechSynthesis.onvoiceschanged=loadVoices;
}
function publicState(){
  return {family:settings.family,tonic:TONICS[settings.tonicIndex].label,tonicRoute:settings.tonicRoute,
    modes:[...settings.selected[settings.family]],bpm:settings.bpm,meter:`${settings.numerator}/${settings.denominator}`,
    pulseGroup:settings.pulseGroup,minBars:settings.minBars,maxBars:settings.maxBars,minSeconds:settings.minSeconds,
    practiceStatus:session?.status||'stopped'};
}
function registerWebMcp(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(error=>console.warn('WebMCP',error))}catch(error){console.warn('WebMCP',error)}};
  register({name:'read_practice_state',title:'Ver configuración de práctica',description:'Lee la configuración y el estado actual de la sesión de modos.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>publicState()});
  register({name:'configure_practice',title:'Configurar práctica',description:'Configura la familia, la tónica, los modos, el tempo y el compás antes de empezar.',
    inputSchema:{type:'object',properties:{family:{type:'string',enum:['diatonic','pentatonic']},tonic:{type:'string',enum:TONICS.map(t=>t.label)},tonicRoute:{type:'string',enum:['fixed','circle','random']},modes:{type:'array',items:{type:'string'}},bpm:{type:'integer',minimum:30,maximum:300},numerator:{type:'integer',minimum:1,maximum:64},denominator:{type:'integer',minimum:1,maximum:128},pulseGroup:{type:'integer',minimum:1,maximum:16}},additionalProperties:false},
    annotations:{readOnlyHint:false},execute(input){
      if(session)throw new Error('Termina la sesión antes de cambiar la configuración.');
      const next=structuredClone(settings);
      if(input.family!==undefined){if(!['diatonic','pentatonic'].includes(input.family))throw new Error('Familia no válida.');next.family=input.family}
      if(input.tonic!==undefined){const i=TONICS.findIndex(t=>t.label===input.tonic);if(i<0)throw new Error('Tónica no válida.');next.tonicIndex=i}
      if(input.tonicRoute!==undefined){if(!['fixed','circle','random'].includes(input.tonicRoute))throw new Error('Recorrido no válido.');next.tonicRoute=input.tonicRoute}
      if(input.modes!==undefined){if(!Array.isArray(input.modes)||!input.modes.length||input.modes.some(id=>!MODES[next.family].some(m=>m.id===id)))throw new Error('Modos no válidos.');next.selected[next.family]=[...new Set(input.modes)]}
      for(const [key,min,max] of [['bpm',30,300],['numerator',1,64],['denominator',1,128],['pulseGroup',1,16]])if(input[key]!==undefined){if(!Number.isInteger(input[key])||input[key]<min||input[key]>max)throw new Error(`${key} fuera de rango.`);next[key]=input[key]}
      if(next.pulseGroup>next.numerator)throw new Error('Las unidades por pulso no pueden superar el numerador.');
      settings=next;previewModeId=settings.selected[settings.family][0];save();fillControls();renderAll();return publicState();
    }});
}
setupSectionOrder();fillControls();bind();loadVoices();renderAll();registerWebMcp();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(error=>console.warn('Sin conexión no disponible',error)));
