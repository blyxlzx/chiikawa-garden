/* Keep browser presentation and native pointer coordinates in the same space. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GardenBrowserViewport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  const positive=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
  function copy(layout){return Object.assign({},layout,{safeArea:Object.assign({},layout.safeArea)});}
  function create(options){
    options=options||{};
    const win=options.window||{},doc=options.document||{},canvas=options.canvas,surface=options.surface,probe=options.insetProbe;
    const cleanups=[];
    let layout=null,disposed=false,scheduled=false,frame=null,coarse=null;
    try{if(typeof win.matchMedia==='function')coarse=win.matchMedia('(pointer:coarse)');}catch(_){}
    function listen(target,name,handler){
      if(!target||typeof target.addEventListener!=='function')return;
      target.addEventListener(name,handler);
      cleanups.push(()=>{if(typeof target.removeEventListener==='function')target.removeEventListener(name,handler);});
    }
    function insets(){
      let style={};
      try{if(probe&&typeof win.getComputedStyle==='function')style=win.getComputedStyle(probe)||{};}catch(_){}
      const read=side=>Math.max(0,finite(parseFloat(style['padding'+side]),0));
      return {left:read('Left'),top:read('Top'),right:read('Right'),bottom:read('Bottom')};
    }
    function measure(){
      const visual=win.visualViewport||{},element=doc.documentElement||{};
      const physicalWidth=positive(visual.width,positive(win.innerWidth,positive(element.clientWidth,1)));
      const physicalHeight=positive(visual.height,positive(win.innerHeight,positive(element.clientHeight,1)));
      const offsetLeft=finite(visual.offsetLeft,0),offsetTop=finite(visual.offsetTop,0);
      const touch=!!(coarse&&coarse.matches)||finite(win.navigator&&win.navigator.maxTouchPoints,0)>0;
      const rotated=touch&&physicalHeight>physicalWidth;
      const width=rotated?physicalHeight:physicalWidth,height=rotated?physicalWidth:physicalHeight;
      const physical=insets(),local=rotated?{left:physical.top,top:physical.right,right:physical.bottom,bottom:physical.left}:physical;
      const left=Math.min(width-1,local.left),top=Math.min(height-1,local.top);
      const safeArea={left,top,right:Math.max(left+1,width-local.right),bottom:Math.max(top+1,height-local.bottom)};
      return {physicalWidth,physicalHeight,offsetLeft,offsetTop,width,height,rotated,safeArea};
    }
    function changed(next,previous){
      return !previous||['physicalWidth','physicalHeight','offsetLeft','offsetTop','width','height','rotated'].some(key=>next[key]!==previous[key])||
        ['left','top','right','bottom'].some(key=>next.safeArea[key]!==previous.safeArea[key]);
    }
    function apply(next){
      if(surface&&surface.style)Object.assign(surface.style,{
        position:'fixed',transformOrigin:'0 0',
        left:(next.offsetLeft+(next.rotated?next.physicalWidth:0))+'px',top:next.offsetTop+'px',
        width:next.width+'px',height:next.height+'px',transform:next.rotated?'rotate(90deg)':'none'
      });
      if(canvas&&canvas.style)Object.assign(canvas.style,{display:'block',width:'100%',height:'100%'});
    }
    function refresh(){
      if(disposed)return layout&&copy(layout);
      const next=measure(),previous=layout;
      if(changed(next,previous)){
        layout=next;apply(next);
        // The initial dimensions must be available before the runtime boots.
        if(previous&&typeof options.onResize==='function')options.onResize(copy(next),copy(previous));
      }
      return copy(layout);
    }
    function queueRefresh(){
      if(disposed||scheduled)return;
      if(typeof win.requestAnimationFrame!=='function'){refresh();return;}
      scheduled=true;
      frame=win.requestAnimationFrame(function(){scheduled=false;frame=null;refresh();});
    }
    function mapPoint(point){
      const current=layout||measure();
      let rect=null;
      try{if(canvas&&typeof canvas.getBoundingClientRect==='function')rect=canvas.getBoundingClientRect();}catch(_){}
      rect=rect||{};
      const left=finite(rect.left,current.offsetLeft),top=finite(rect.top,current.offsetTop);
      const width=positive(rect.width,positive(finite(rect.right,NaN)-left,current.physicalWidth));
      const height=positive(rect.height,positive(finite(rect.bottom,NaN)-top,current.physicalHeight));
      const clientX=finite(point&&point.clientX,NaN),clientY=finite(point&&point.clientY,NaN);
      // Bounding rectangles include the CSS rotation. Undo it before the
      // runtime applies its own letterbox/scene transform, including drags
      // that have moved outside the canvas under pointer capture.
      return Object.assign({},point,{
        clientX:current.rotated?(clientY-top)*current.width/height:(clientX-left)*current.width/width,
        clientY:current.rotated?(left+width-clientX)*current.height/width:(clientY-top)*current.height/height
      });
    }
    function getSystemInfo(){
      const current=layout||measure();
      return {windowWidth:current.width,windowHeight:current.height,safeArea:Object.assign({},current.safeArea)};
    }
    function destroy(){
      if(disposed)return;
      disposed=true;
      if(scheduled&&typeof win.cancelAnimationFrame==='function')win.cancelAnimationFrame(frame);
      scheduled=false;frame=null;
      cleanups.splice(0).forEach(remove=>remove());
    }
    refresh();
    listen(win,'resize',queueRefresh);listen(win,'orientationchange',queueRefresh);
    listen(win.visualViewport,'resize',queueRefresh);listen(win.visualViewport,'scroll',queueRefresh);
    listen(win.screen&&win.screen.orientation,'change',queueRefresh);
    if(coarse&&typeof coarse.addEventListener==='function')listen(coarse,'change',queueRefresh);
    else if(coarse&&typeof coarse.addListener==='function'){
      coarse.addListener(queueRefresh);cleanups.push(()=>{if(typeof coarse.removeListener==='function')coarse.removeListener(queueRefresh);});
    }
    return {getSystemInfo,mapPoint,refresh,destroy,getLayout:()=>copy(layout)};
  }
  return Object.freeze({create});
});
