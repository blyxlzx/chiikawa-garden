(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GardenBattleLayout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function calculate(width,height,safe,battle){
    safe=safe||{};
    const left=Math.max(0,+safe.left||0),top=Math.max(0,+safe.top||0),right=Math.min(width,+safe.right||width),bottom=Math.min(height,+safe.bottom||height);
    const sw=Math.max(1,right-left),sh=Math.max(1,bottom-top),mobile=!!battle&&sh<=500&&sw/sh>=1.45;
    const logicalWidth=mobile?Math.max(1472,sw/sh*960):battle?1472:Math.max(1280,sw/sh*960),scale=Math.min(sw/logicalWidth,sh/960);
    return {mobile,logicalWidth,scale,x:left+(sw-logicalWidth*scale)/2,y:top+(sh-960*scale)/2,width:logicalWidth*scale,height:960*scale,
      boardBounds:mobile?{x:148,y:245,w:logicalWidth-294,h:582}:null,
      hud:mobile?{bank:{x:0,y:0,w:logicalWidth,h:170},cardX:150,cardY:10,cardW:(logicalWidth-338)/10-7,cardH:144,cardStep:(logicalWidth-338)/10,shovelX:logicalWidth-158,speed:{x:logicalWidth-398,y:838,w:182,h:116}}:null};
  }
  return {calculate};
});
