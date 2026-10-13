/* Original procedural cues; shared PCM for browser and native mini games. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GardenExplosiveSound=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SAMPLE_RATE=22050;
  const DURATIONS=Object.freeze({fuse:1,cherry:.75,fire:.85});
  const VOLUMES=Object.freeze({fuse:.55,cherry:.72,fire:.65});
  function generate(kind,rate=SAMPLE_RATE){
    if(!Object.prototype.hasOwnProperty.call(DURATIONS,kind))throw new RangeError('Unknown explosive sound: '+kind);
    if(!Number.isFinite(rate)||rate<8000||rate>192000)throw new RangeError('Unsupported sample rate');
    const duration=DURATIONS[kind],samples=new Float32Array(Math.ceil(duration*rate));
    let seed=kind==='fuse'?0x7426f91:kind==='cherry'?0x513ace9:0x78af312;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
    let low=0,body=0,phase=0,crackle=0;
    for(let i=0;i<samples.length;i++){
      const t=i/rate,p=t/duration,noise=random()*2-1;
      const cutoff=kind==='fuse'?300+1500*p*p:kind==='cherry'?1000*Math.exp(-t*5)+180:1450;
      low+=(noise-low)*(1-Math.exp(-Math.PI*2*cutoff/rate));
      body+=(noise-body)*(1-Math.exp(-Math.PI*2*95/rate));
      let value;
      if(kind==='fuse'){
        // A rising inhalation: broad noise with a restrained hollow undertone.
        phase+=Math.PI*2*(105+235*p*p)/rate;
        const swell=Math.pow(p,1.8),flutter=.88+.12*Math.sin(phase*.19);
        value=swell*(low*.74+Math.sin(phase)*.13+Math.sin(phase*1.97)*.035)*flutter;
      }else if(kind==='cherry'){
        // Sharp crack, a fast descending low thump, then a short dusty tail.
        phase+=Math.PI*2*(39+128*Math.exp(-t*24))/rate;
        value=noise*.45*Math.exp(-t*52)+low*.84*Math.exp(-t*8)
          +Math.sin(phase)*.52*Math.exp(-t*9)+body*.48*Math.exp(-t*5);
      }else{
        // One ignition transient followed by a continuous rushing flame.
        phase+=Math.PI*2*(46+66*Math.exp(-t*13))/rate;
        if(random()<18/rate)crackle=.1+random()*.22;
        crackle*=Math.exp(-1/(rate*.0045));
        const rush=Math.min(1,t/.045)*Math.pow(Math.max(0,1-p),1.15);
        value=noise*.33*Math.exp(-t*42)+low*.86*rush
          +(noise-low)*.17*rush+Math.sin(phase)*.20*Math.exp(-t*7)
          +crackle*noise*(1-p);
      }
      const ramp=Math.max(0,Math.min(1,t/(kind==='fuse'?.015:.0015),(duration-t)/.025));
      samples[i]=Math.tanh(value*1.7)*.72*ramp;
    }
    // Ensure the shared PCM has a silent endpoint, including low sample rates.
    samples[samples.length-1]=0;
    return samples;
  }
  return Object.freeze({SAMPLE_RATE,DURATIONS,VOLUMES,generate});
});
