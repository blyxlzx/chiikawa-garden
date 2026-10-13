/* Browser motion-asset recovery; static actors remain playable during loading. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GardenBrowserAssets=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(options){
    const motion=options.motion,platform=options.platform,setTimer=options.setTimeout||setTimeout,clearTimer=options.clearTimeout||clearTimeout;
    const delays=options.retryDelays||[1000,2000,4000],timeout=options.timeoutMs||15000;
    let attempts=0,generation=0,disposed=false,active=false,timer=null,deadline=null,images=[],lastError='';
    let status=motion&&motion.load?'idle':'ready';
    function getState(){return {status,attempts,error:lastError,ready:status==='ready',pending:status==='loading'||status==='waiting'};}
    function emit(){if(typeof options.onChange==='function')options.onChange(getState());}
    function detach(){for(const image of images){image.onload=null;image.onerror=null;}images=[];if(deadline!==null)clearTimer(deadline);deadline=null;}
    function attempt(){
      if(disposed||active||!motion||!motion.load||status==='ready')return false;
      if(timer!==null)clearTimer(timer);timer=null;active=true;status='loading';attempts++;const token=++generation;images=[];emit();
      const adapter=Object.create(platform);adapter.createImage=function(){const image=platform.createImage();images.push(image);return image;};
      function settle(error){
        if(disposed||token!==generation||!active)return;active=false;detach();
        if(error){lastError=String(error.message||error);status=attempts<=delays.length?'waiting':'failed';if(status==='waiting')timer=setTimer(attempt,delays[attempts-1]);}
        else {lastError='';status='ready';if(typeof options.onReady==='function')options.onReady();}
        emit();
      }
      deadline=setTimer(()=>settle(new Error('动作资源加载超时')),timeout);
      try{Promise.resolve(motion.load(adapter,options.assetRoot||'assets/')).then(()=>settle(null),settle);}catch(error){settle(error);}
      return true;
    }
    return Object.freeze({start:attempt,getState,retry(){if(disposed||active||status==='ready')return false;attempts=0;return attempt();},dispose(){disposed=true;generation++;active=false;if(timer!==null)clearTimer(timer);timer=null;detach();}});
  }
  return Object.freeze({create});
});
