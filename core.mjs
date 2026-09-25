export const TONICS = [
  {label:'Do',letter:'C',pc:0},{label:'Sol',letter:'G',pc:7},
  {label:'Re',letter:'D',pc:2},{label:'La',letter:'A',pc:9},
  {label:'Mi',letter:'E',pc:4},{label:'Si',letter:'B',pc:11},
  {label:'Fa♯',letter:'F',pc:6},{label:'Re♭',letter:'D',pc:1},
  {label:'La♭',letter:'A',pc:8},{label:'Mi♭',letter:'E',pc:3},
  {label:'Si♭',letter:'B',pc:10},{label:'Fa',letter:'F',pc:5}
];

export const MODES = {
  diatonic:[
    {id:'ionian',name:'Jónico',steps:[0,2,4,5,7,9,11],degrees:['1','2','3','4','5','6','7'],color:[4,11]},
    {id:'dorian',name:'Dórico',steps:[0,2,3,5,7,9,10],degrees:['1','2','♭3','4','5','6','♭7'],color:[9]},
    {id:'phrygian',name:'Frigio',steps:[0,1,3,5,7,8,10],degrees:['1','♭2','♭3','4','5','♭6','♭7'],color:[1]},
    {id:'lydian',name:'Lidio',steps:[0,2,4,6,7,9,11],degrees:['1','2','3','♯4','5','6','7'],color:[6]},
    {id:'mixolydian',name:'Mixolidio',steps:[0,2,4,5,7,9,10],degrees:['1','2','3','4','5','6','♭7'],color:[10]},
    {id:'aeolian',name:'Eólico',steps:[0,2,3,5,7,8,10],degrees:['1','2','♭3','4','5','♭6','♭7'],color:[8]},
    {id:'locrian',name:'Locrio',steps:[0,1,3,5,6,8,10],degrees:['1','♭2','♭3','4','♭5','♭6','♭7'],color:[6]}
  ],
  pentatonic:[
    {id:'ionian',name:'Jónico',steps:[0,2,4,7,9],color:[4]},
    {id:'dorian',name:'Dórico',steps:[0,2,5,7,10],color:[10]},
    {id:'phrygian',name:'Frigio',steps:[0,3,5,8,10],color:[8]},
    {id:'mixolydian',name:'Mixolidio',steps:[0,2,5,7,9],color:[9]},
    {id:'aeolian',name:'Eólico',steps:[0,3,5,7,10],color:[3]}
  ]
};

export const INTERVALS = [
  '1','♭2','2','♭3','3','4','♯4 / ♭5','5','♭6','6','♭7','7'
];
const LETTERS=['C','D','E','F','G','A','B'];
const NATURAL=[0,2,4,5,7,9,11];
const SOLFEGE={C:'Do',D:'Re',E:'Mi',F:'Fa',G:'Sol',A:'La',B:'Si'};

export function validatePentatonic(steps){
  return Array.isArray(steps)&&steps.length===5&&steps[0]===0&&steps.every((v,i)=>Number.isInteger(v)&&v>=0&&v<12&&(i===0||v>steps[i-1]));
}

export function degreeForStep(step,modeId){
  if(step===6)return modeId==='locrian'?'♭5':'♯4';
  return INTERVALS[step];
}

export function spellNote(tonic,step,degree){
  const degreeNumber=Number(degree.match(/[1-7]/)?.[0]||1);
  const first=LETTERS.indexOf(tonic.letter);
  const letterIndex=(first+degreeNumber-1)%7;
  const natural=NATURAL[letterIndex];
  const target=(tonic.pc+step)%12;
  let accidental=((target-natural+18)%12)-6;
  if(accidental>2||accidental< -2){
    const simple=['Do','Re♭','Re','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'];
    return simple[target];
  }
  return SOLFEGE[LETTERS[letterIndex]]+(accidental>0?'♯'.repeat(accidental):'♭'.repeat(-accidental));
}

export function scaleNotes(tonic,mode,customSteps){
  const steps=customSteps||mode.steps;
  return steps.map((step,i)=>{
    const degree=mode.degrees?.[i]||degreeForStep(step,mode.id);
    return {step,pc:(tonic.pc+step)%12,degree,name:spellNote(tonic,step,degree),root:i===0,color:mode.color.includes(step)};
  });
}

export function barSeconds(numerator,pulseGroup,bpm){
  return numerator*60/(pulseGroup*bpm);
}

export function chooseBarCount(minBars,maxBars,minSeconds,numerator,pulseGroup,bpm,random=Math.random){
  const low=Math.max(1,Math.ceil(minBars),Math.ceil(minSeconds/barSeconds(numerator,pulseGroup,bpm)));
  const high=Math.max(low,Math.floor(maxBars));
  return low+Math.floor(Math.min(.999999,Math.max(0,random()))*(high-low+1));
}

export function chooseNextMode(ids,lastId,priority=[],random=Math.random){
  const available=ids.filter(id=>id!==lastId);
  if(!available.length)return ids[0]||null;
  const weighted=available.flatMap(id=>priority.includes(id)?[id,id,id]:[id]);
  return weighted[Math.floor(Math.min(.999999,Math.max(0,random()))*weighted.length)];
}

export function chooseNextTonic(currentIndex,route,random=Math.random){
  if(route==='fixed')return currentIndex;
  if(route==='circle')return (currentIndex+1)%TONICS.length;
  const others=TONICS.map((_,i)=>i).filter(i=>i!==currentIndex);
  return others[Math.floor(Math.min(.999999,Math.max(0,random()))*others.length)];
}
