/* Isolated proposal. No production renderer or browser is started by this module.
 * Compile the original XY/UV stream once per visual keyframe. Transfer the packet
 * to the presentation owner, then change only a GPU interpolation uniform at RAF.
 * Dynamic Canvas raster layers use their current exact pixels; they do not claim
 * to synthesize the intermediate phase of an effect or a whole animation cycle.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GardenRetainedScene=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=1,MAX_VERTICES=1024*1024,MAX_COMMANDS=16384,MAX_SOURCES=256;
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const own=(v,key)=>Object.prototype.hasOwnProperty.call(v,key);
  const vec4=v=>Array.isArray(v)&&v.length===4&&v.every(finite);
  const validClip=c=>c===null||c&&['x','y','width','height'].every(k=>finite(c[k]))&&c.width>=0&&c.height>=0;
  const sameView=(a,b)=>a&&b&&a.scope===b.scope&&a.width===b.width&&a.height===b.height&&a.view===b.view;
  const copyClip=c=>c?{x:c.x,y:c.y,width:c.width,height:c.height}:null;
  const sameClip=(a,b)=>!a&&!b||a&&b&&a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;
  const lerp=(a,b,t)=>a+(b-a)*t;
  function identity(command,ordinal){
    return command.owner&&typeof command.owner.id==='string'&&typeof command.owner.continuity==='string'
      ?command.owner.id+'\u0000'+command.owner.continuity+'\u0000'+ordinal:null;
  }
  function validateDescriptor(command,count){
    if(!command||!['mesh','image','layer'].includes(command.type)||typeof command.textureId!=='string'||typeof command.signature!=='string'||
      !Number.isSafeInteger(command.first)||!Number.isSafeInteger(command.count)||command.first<0||command.count<=0||command.count%3||command.first+command.count>count||
      !vec4(command.hole)||!vec4(command.tint)||!validClip(command.clip))throw new Error('Invalid retained draw descriptor');
  }
  function createCompiler(){
    let previous=null;
    return {reset(){previous=null;},compile({scope,sequence,width,height,view='',vertices,alphas,commands,sources=[]}){
      if(typeof scope!=='string'||!scope||!Number.isSafeInteger(sequence)||sequence<0||!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||
        width*height>32*1024*1024||typeof view!=='string'||!(vertices instanceof Float32Array)||vertices.length%4||!(alphas instanceof Float32Array)||
        alphas.length!==vertices.length/4||alphas.length>MAX_VERTICES||!Array.isArray(commands)||commands.length>MAX_COMMANDS||!Array.isArray(sources)||sources.length>MAX_SOURCES)throw new Error('Invalid retained keyframe');
      const count=alphas.length,currentVertices=vertices.slice(),currentAlphas=alphas.slice(),previousPoints=new Float32Array(count*2),previousAlphas=alphas.slice();
      for(let i=0;i<count;i++){
        const x=currentVertices[i*4],y=currentVertices[i*4+1],u=currentVertices[i*4+2],v=currentVertices[i*4+3];
        if(!finite(x)||!finite(y)||!finite(u)||!finite(v)||!finite(currentAlphas[i]))throw new Error('Nonfinite retained stream');
        previousPoints[i*2]=x;previousPoints[i*2+1]=y;
      }
      const compatibleFrame=sameView(previous,{scope,width,height,view})&&sequence>previous.sequence;
      if(previous&&sameView(previous,{scope,width,height,view})&&sequence<=previous.sequence)throw new Error('Nonmonotonic retained sequence');
      const owners=new Map(),nextByIdentity=new Map(),descriptors=[];let interpolated=0,snapped=0,expectedFirst=0;
      for(const source of sources){
        if(!source||typeof source.id!=='string'||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<=0||source.height<=0||typeof source.version!=='string')throw new Error('Invalid retained texture manifest');
      }
      for(const command of commands){
        validateDescriptor(command,count);
        if(command.first!==expectedFirst)throw new Error('Retained stream must preserve contiguous painter order');expectedFirst+=command.count;
        const ownerId=command.owner?.id,ordinal=owners.get(ownerId)||0;owners.set(ownerId,ordinal+1);const id=identity(command,ordinal);
        const before=compatibleFrame&&id?previous.byIdentity.get(id):null;
        // CPU layers cannot interpolate raster content. Their exact current
        // texture and current geometry are authoritative at a new keyframe.
        const continuous=command.type!=='layer'&&command.continuous!==false&&before&&before.type===command.type&&before.signature===command.signature&&before.count===command.count;
        const clip=copyClip(command.clip),previousClip=continuous?copyClip(before.clip):copyClip(clip);
        if(continuous){
          for(let i=0;i<command.count;i++){
            const current=command.first+i,old=before.first+i;
            previousPoints[current*2]=previous.positions[old*2];previousPoints[current*2+1]=previous.positions[old*2+1];previousAlphas[current]=previous.alphas[old];
          }
          interpolated++;
        }else snapped++;
        const descriptor={type:command.type,textureId:command.textureId,first:command.first,count:command.count,signature:command.signature,
          hole:command.hole.slice(),tint:command.tint.slice(),clip,previousClip,interpolated:!!continuous,owner:command.owner?{id:command.owner.id,continuity:command.owner.continuity}:null};
        descriptors.push(descriptor);if(id)nextByIdentity.set(id,descriptor);
      }
      if(expectedFirst!==count)throw new Error('Retained descriptors do not cover the vertex stream');
      // Keep a separate compact CPU endpoint for the next worker compilation.
      // Transferring the returned packet may detach every returned ArrayBuffer.
      const positions=new Float32Array(count*2);for(let i=0;i<count;i++){positions[i*2]=currentVertices[i*4];positions[i*2+1]=currentVertices[i*4+1];}
      previous={scope,sequence,width,height,view,positions,alphas:currentAlphas.slice(),byIdentity:nextByIdentity};
      return {version:VERSION,scope,sequence,width,height,view,vertices:currentVertices,alphas:currentAlphas,previousPoints,previousAlphas,commands:descriptors,
        sources:sources.map(s=>({...s})),stats:{vertices:count,commands:descriptors.length,interpolated,snapped,transferBytes:count*32,retainedCompilerBytes:count*12}};
    }};
  }
  function transferables(packet){return [packet.vertices.buffer,packet.alphas.buffer,packet.previousPoints.buffer,packet.previousAlphas.buffer];}
  function vertexShader(precision='highp'){
    return 'attribute vec2 point;attribute vec2 uv;attribute float vertexAlpha;attribute vec2 previousPoint;attribute float previousAlpha;'+
      'uniform vec2 extent;uniform float sceneBlend;varying mediump float primitiveAlpha;varying '+precision+' vec2 texUV;'+
      'void main(){texUV=uv;vec2 p=sceneBlend==1.0?point:sceneBlend==0.0?previousPoint:mix(previousPoint,point,sceneBlend);'+
      'primitiveAlpha=sceneBlend==1.0?vertexAlpha:sceneBlend==0.0?previousAlpha:mix(previousAlpha,vertexAlpha,sceneBlend);'+
      'gl_Position=vec4(p.x/extent.x*2.0-1.0,1.0-p.y/extent.y*2.0,0.0,1.0);}';
  }
  function fragmentShader(precision='highp'){
    return 'precision mediump float;uniform sampler2D atlas;uniform '+precision+' vec4 hole;uniform vec4 tint;uniform float opacity;'+
      'varying mediump float primitiveAlpha;varying '+precision+' vec2 texUV;void main(){'+
      'if(hole.z>0.0&&texUV.x>hole.x&&texUV.y>hole.y&&texUV.x<hole.z&&texUV.y<hole.w)discard;'+
      'vec4 color=texture2D(atlas,texUV);color.rgb=mix(color.rgb,tint.rgb*color.a,tint.a);gl_FragColor=color*(opacity*primitiveAlpha);}';
  }
  // Output-only shader-bank experiment. It preserves the packet streams and
  // painter order, and never repacks, rescales or resamples a source texture.
  function samplerVertexShader(precision='highp'){
    return 'attribute vec4 pointUV;attribute vec4 previousAndAlpha;attribute vec4 primitiveTint;attribute vec4 primitiveHole;attribute vec4 primitiveClip;attribute float textureSlot;'+
      'uniform vec2 extent;uniform float sceneBlend;varying mediump float primitiveAlpha;varying '+precision+' vec2 texUV;'+
      'varying mediump vec4 bankTint;varying '+precision+' vec4 bankHole;varying highp vec4 bankClip;varying highp float bankSlot;'+
      'void main(){texUV=pointUV.zw;vec2 p=sceneBlend==1.0?pointUV.xy:sceneBlend==0.0?previousAndAlpha.xy:mix(previousAndAlpha.xy,pointUV.xy,sceneBlend);'+
      'primitiveAlpha=sceneBlend==1.0?previousAndAlpha.z:sceneBlend==0.0?previousAndAlpha.w:mix(previousAndAlpha.w,previousAndAlpha.z,sceneBlend);'+
      'bankTint=primitiveTint;bankHole=primitiveHole;bankClip=primitiveClip;bankSlot=textureSlot;'+
      'gl_Position=vec4(p.x/extent.x*2.0-1.0,1.0-p.y/extent.y*2.0,0.0,1.0);}';
  }
  function samplerFragmentShader(precision='highp',slots=8){
    if(!Number.isInteger(slots)||slots<1||slots>16)throw new Error('Invalid sampler shader bank');
    let declarations='',sample='';
    for(let i=0;i<slots;i++){
      declarations+='uniform sampler2D atlas'+i+';';
      sample+=(i===0?'if':i===slots-1?'else':'else if')+(i===slots-1&&i>0?'':'(bankSlot<'+(i+.5).toFixed(1)+')')+'{color=texture2D(atlas'+i+',texUV);}';
    }
    return 'precision mediump float;'+declarations+'uniform float opacity;varying mediump float primitiveAlpha;varying '+precision+' vec2 texUV;'+
      'varying mediump vec4 bankTint;varying '+precision+' vec4 bankHole;varying highp vec4 bankClip;varying highp float bankSlot;'+
      'void main(){if(gl_FragCoord.x<bankClip.x||gl_FragCoord.y<bankClip.y||gl_FragCoord.x>=bankClip.z||gl_FragCoord.y>=bankClip.w)discard;'+
      'if(bankHole.z>0.0&&texUV.x>bankHole.x&&texUV.y>bankHole.y&&texUV.x<bankHole.z&&texUV.y<bankHole.w)discard;vec4 color;'+sample+
      'color.rgb=mix(color.rgb,bankTint.rgb*color.a,bankTint.a);gl_FragColor=color*(opacity*primitiveAlpha);}';
  }
  function bankScissor(command,blend,width,height){
    const a=command.previousClip,b=command.clip;
    if(!b)return [0,0,width,height];
    if(!a||blend===1)return [b.x,height-b.y-b.height,b.width,b.height];
    if(blend===0)return [a.x,height-a.y-a.height,a.width,a.height];
    return [Math.trunc(lerp(a.x,b.x,blend)),Math.trunc(height-lerp(a.y+a.height,b.y+b.height,blend)),Math.trunc(lerp(a.width,b.width,blend)),Math.trunc(lerp(a.height,b.height,blend))];
  }
  function clipBoundsAt(command,blend,width,height){
    // bankScissor is deliberately unchanged: interpolate in JavaScript double,
    // truncate at the same point, then apply WebIDL signed-long conversion.
    const box=bankScissor(command,blend,width,height).map(v=>v|0);
    if(box[2]<0||box[3]<0)return null;
    const x0=Math.max(0,Math.min(width,box[0])),y0=Math.max(0,Math.min(height,box[1]));
    const x1=Math.max(0,Math.min(width,box[0]+box[2])),y1=Math.max(0,Math.min(height,box[1]+box[3]));
    return x1<=x0||y1<=y0?[0,0,0,0]:[x0,y0,x1,y1];
  }
  function dynamicBankClip(command){
    return !!command.clip&&!!command.previousClip&&!sameClip(command.clip,command.previousClip);
  }
  function clipFitsBank(command,width,height){
    // A width crossing the signed WebIDL boundary could produce a negative GL
    // scissor extent. Keep that unusual input on the unchanged legacy path.
    const clips=[command.clip,command.previousClip].filter(Boolean);
    const a=clipBoundsAt(command,0,width,height),b=clipBoundsAt(command,1,width,height);
    // Empty/offscreen endpoints remain on the identical original scissor path.
    // A driver-level empty-scissor discrepancy appeared in strict real GPU QA;
    // do not substitute a fragment discard for that existing behavior.
    const nonempty=c=>c&&c[2]>c[0]&&c[3]>c[1];
    return width<=0x7fffff&&height<=0x7fffff&&clips.every(c=>c.width<=0x7fffffff&&c.height<=0x7fffffff)&&nonempty(a)&&nonempty(b);
  }
  function fixedBankClip(command,width,height){
    return dynamicBankClip(command)?null:clipBoundsAt(command,1,width,height);
  }
  function compileSamplerBanks(draws,slots,width,height){
    const banks=[];let current=null,fastCommands=0,scissorCommands=0,dynamicClipCommands=0,dynamicClipVertices=0;
    for(const draw of draws){
      const bounds=clipBoundsAt(draw,1,width,height),scissorOnly=!clipFitsBank(draw,width,height),dynamicClip=!scissorOnly&&dynamicBankClip(draw);
      const compatible=current&&current.scissorOnly===scissorOnly&&(!scissorOnly||sameClip(current.clip,draw.clip)&&sameClip(current.previousClip,draw.previousClip));
      if(!compatible||!current.slots.has(draw.texture)&&current.textures.length===slots){
        current={first:draw.first,count:0,commands:[],textures:[],slots:new Map(),scissorOnly,clip:draw.clip,previousClip:draw.previousClip};banks.push(current);
      }
      let slot=current.slots.get(draw.texture);
      if(slot===undefined){slot=current.textures.length;current.slots.set(draw.texture,slot);current.textures.push(draw.texture);}
      current.commands.push({...draw,slot,bounds:scissorOnly?[0,0,width,height]:bounds,dynamicClip});current.count+=draw.count;
      if(scissorOnly)scissorCommands++;else fastCommands++;
      if(dynamicClip){dynamicClipCommands++;dynamicClipVertices+=draw.count;}
    }
    return {banks,fastCommands,scissorCommands,dynamicClipCommands,dynamicClipVertices};
  }
  // Pure CPU preparation belongs to the capture worker. The receiver retains
  // descriptor/source validation and recomputes the inexpensive bank plan as a
  // consistency check; it skips only the expensive per-vertex stream packing.
  const PREPARED_SCHEMA=1;
  function packetPreparationBinding(packet){
    return JSON.stringify([packet.version,packet.scope,packet.sequence,packet.width,packet.height,packet.view,
      packet.sources.map(s=>[s.id,s.version,s.width,s.height]),
      packet.commands.map(c=>[c.type,c.textureId,c.first,c.count,c.signature,c.hole,c.tint,c.clip,c.previousClip])]);
  }
  function validatePreparationInput(next){
    if(!next||next.version!==VERSION||!finite(next.width)||!finite(next.height)||!Number.isInteger(next.width)||!Number.isInteger(next.height)||next.width<1||next.height<1)throw new Error('Invalid preparation packet dimensions');
    if(!(next.vertices instanceof Float32Array)||!(next.alphas instanceof Float32Array)||!(next.previousPoints instanceof Float32Array)||!(next.previousAlphas instanceof Float32Array)||next.vertices.length!==next.alphas.length*4||next.previousPoints.length!==next.alphas.length*2||next.previousAlphas.length!==next.alphas.length||next.alphas.length>MAX_VERTICES)throw new Error('Invalid preparation packet streams');
    if(!Array.isArray(next.commands)||!Array.isArray(next.sources)||next.commands.length>MAX_COMMANDS||next.sources.length>MAX_SOURCES)throw new Error('Invalid preparation packet manifest');
    let covered=0;for(const c of next.commands){validateDescriptor(c,next.alphas.length);if(c.first!==covered||!validClip(c.previousClip))throw new Error('Invalid preparation packet order/clip');covered+=c.count;}
    if(covered!==next.alphas.length)throw new Error('Incomplete preparation packet streams');
    const sources=new Map();for(const s of next.sources){if(!s||typeof s.id!=='string'||!s.id||sources.has(s.id)||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<1)throw new Error('Invalid preparation source manifest');sources.set(s.id,{id:s.id});}
    for(const c of next.commands)if(!sources.has(c.textureId))throw new Error('Preparation texture source unavailable');return sources;
  }
  function serializePreparationPlan(plan){
    return plan.banks.map(bank=>({first:bank.first,count:bank.count,scissorOnly:bank.scissorOnly,
      textureIds:bank.textures.map(texture=>texture.id),commands:bank.commands.map(c=>({first:c.first,count:c.count,textureId:c.textureId,slot:c.slot,bounds:c.bounds.slice(),dynamicClip:c.dynamicClip}))}));
  }
  function packPreparedStreams(next,plan){
    const geometry=new Float32Array(next.alphas.length*17),clips=new Float32Array(next.alphas.length*4);
    for(const bank of plan.banks)for(const c of bank.commands)for(let k=0;k<c.count;k++){
      const v=c.first+k,o=v*17,q=v*4,p=v*2;
      geometry[o]=next.vertices[q];geometry[o+1]=next.vertices[q+1];geometry[o+2]=next.vertices[q+2];geometry[o+3]=next.vertices[q+3];
      geometry[o+4]=next.previousPoints[p];geometry[o+5]=next.previousPoints[p+1];geometry[o+6]=next.alphas[v];geometry[o+7]=next.previousAlphas[v];
      geometry[o+8]=c.tint[0];geometry[o+9]=c.tint[1];geometry[o+10]=c.tint[2];geometry[o+11]=c.tint[3];
      geometry[o+12]=c.hole[0];geometry[o+13]=c.hole[1];geometry[o+14]=c.hole[2];geometry[o+15]=c.hole[3];geometry[o+16]=c.slot;
      clips[q]=c.bounds[0];clips[q+1]=c.bounds[1];clips[q+2]=c.bounds[2];clips[q+3]=c.bounds[3];
    }
    return {geometry,clips};
  }
  // Private transferred packet validation: retain every descriptor/source
  // comparison while avoiding serializing and rebuilding a second bank plan.
  // Geometry floats remain trusted capture output, exactly as schema 1 before.
  const DIRECT_PREPARATION_BINDING='direct-v1';
  function clipContract(c){return c?[c.x,c.y,c.width,c.height]:null;}
  function preparationContract(packet){
    return {version:1,header:[packet.version,packet.scope,packet.sequence,packet.width,packet.height,packet.view],
      sources:packet.sources.map(s=>[s.id,s.version,s.width,s.height]),
      commands:packet.commands.map(c=>[c.type,c.textureId,c.first,c.count,c.signature,c.hole.slice(),c.tint.slice(),clipContract(c.clip),clipContract(c.previousClip)])};
  }
  function equalFour(a,b){return Array.isArray(a)&&a.length===4&&a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]&&a[3]===b[3];}
  function exactRecordKeys(value,keys){return value&&typeof value==='object'&&Object.keys(value).length===keys.length&&keys.every(key=>own(value,key));}
  const preparedBankKeys=['first','count','scissorOnly','textureIds','commands'],preparedCommandKeys=['first','count','textureId','slot','bounds','dynamicClip'];
  function clipContractMatches(a,b){return b===null?a===null:Array.isArray(a)&&a.length===4&&a[0]===b.x&&a[1]===b.y&&a[2]===b.width&&a[3]===b.height;}
  function validateDirectContract(value,next){
    const contract=value.contract,h=contract&&contract.header;
    if(value.binding!==DIRECT_PREPARATION_BINDING||!contract||contract.version!==1||!Array.isArray(h)||h.length!==6||h[0]!==next.version||h[1]!==next.scope||h[2]!==next.sequence||h[3]!==next.width||h[4]!==next.height||h[5]!==next.view||!Array.isArray(contract.sources)||contract.sources.length!==next.sources.length||!Array.isArray(contract.commands)||contract.commands.length!==next.commands.length)throw new Error('Prepared packet direct binding mismatch');
    for(let i=0;i<next.sources.length;i++){
      const a=contract.sources[i],s=next.sources[i];
      if(!Array.isArray(a)||a.length!==4||a[0]!==s.id||a[1]!==s.version||a[2]!==s.width||a[3]!==s.height)throw new Error('Prepared packet direct source binding mismatch');
    }
    for(let i=0;i<next.commands.length;i++){
      const a=contract.commands[i],c=next.commands[i];
      if(!Array.isArray(a)||a.length!==9||a[0]!==c.type||a[1]!==c.textureId||a[2]!==c.first||a[3]!==c.count||a[4]!==c.signature||!equalFour(a[5],c.hole)||!equalFour(a[6],c.tint)||!clipContractMatches(a[7],c.clip)||!clipContractMatches(a[8],c.previousClip))throw new Error('Prepared packet direct descriptor binding mismatch');
    }
  }
  function acceptPreparedPacketDirect(next,draws,slots){
    const value=next.prepared;
    if(!value||value.schema!==PREPARED_SCHEMA||value.samplerBankSize!==slots||value.vertexCount!==next.alphas.length)throw new Error('Prepared packet schema/capability/binding mismatch');
    validateDirectContract(value,next);
    if(!(value.geometry instanceof Float32Array)||!(value.clips instanceof Float32Array)||value.geometry.length!==next.alphas.length*17||value.clips.length!==next.alphas.length*4||value.geometry.byteOffset!==0||value.clips.byteOffset!==0||value.geometry.buffer.byteLength!==value.geometry.byteLength||value.clips.buffer.byteLength!==value.clips.byteLength||value.geometry.buffer===value.clips.buffer||[next.vertices.buffer,next.alphas.buffer,next.previousPoints.buffer,next.previousAlphas.buffer].some(buffer=>buffer===value.geometry.buffer||buffer===value.clips.buffer))throw new Error('Prepared packet stream layout/ownership mismatch');
    if(!Array.isArray(value.banks)||value.banks.length>MAX_COMMANDS)throw new Error('Prepared packet descriptor/bank plan mismatch');
    const idByTexture=new Map();for(const c of draws){const prior=idByTexture.get(c.texture);if(prior!==undefined&&prior!==c.textureId)throw new Error('Prepared packet texture mapping is not one-to-one');idByTexture.set(c.texture,c.textureId);}
    const banks=[];let current=null,expected=null,commandIndex=0,bankIndex=0,fastCommands=0,scissorCommands=0,dynamicClipCommands=0,dynamicClipVertices=0;
    function closeBank(){
      if(current&&(current.count!==expected.count||commandIndex!==expected.commands.length||current.textures.length!==expected.textureIds.length))throw new Error('Prepared packet descriptor/bank plan mismatch');
    }
    for(const draw of draws){
      const bounds=clipBoundsAt(draw,1,next.width,next.height),scissorOnly=!clipFitsBank(draw,next.width,next.height),dynamicClip=!scissorOnly&&dynamicBankClip(draw);
      const compatible=current&&current.scissorOnly===scissorOnly&&(!scissorOnly||sameClip(current.clip,draw.clip)&&sameClip(current.previousClip,draw.previousClip));
      if(!compatible||!current.slots.has(draw.texture)&&current.textures.length===slots){
        closeBank();expected=value.banks[bankIndex++];commandIndex=0;
        if(!exactRecordKeys(expected,preparedBankKeys)||expected.first!==draw.first||expected.scissorOnly!==scissorOnly||!Number.isSafeInteger(expected.count)||expected.count<=0||!Array.isArray(expected.commands)||expected.commands.length<1||expected.commands.length>MAX_COMMANDS||!Array.isArray(expected.textureIds)||expected.textureIds.length<1||expected.textureIds.length>slots)throw new Error('Prepared packet descriptor/bank plan mismatch');
        current={first:draw.first,count:0,commands:[],textures:[],slots:new Map(),scissorOnly,clip:draw.clip,previousClip:draw.previousClip};banks.push(current);
      }
      let slot=current.slots.get(draw.texture);
      if(slot===undefined){slot=current.textures.length;if(expected.textureIds[slot]!==draw.textureId)throw new Error('Prepared packet descriptor/bank plan mismatch');current.slots.set(draw.texture,slot);current.textures.push(draw.texture);}
      const record=expected.commands[commandIndex++],actualBounds=scissorOnly?[0,0,next.width,next.height]:bounds;
      if(!exactRecordKeys(record,preparedCommandKeys)||record.first!==draw.first||record.count!==draw.count||record.textureId!==draw.textureId||record.slot!==slot||record.dynamicClip!==dynamicClip||!equalFour(record.bounds,actualBounds))throw new Error('Prepared packet descriptor/bank plan mismatch');
      // Reuse the stage-owned resolved descriptor instead of a second spread.
      draw.slot=slot;draw.bounds=actualBounds;draw.dynamicClip=dynamicClip;current.commands.push(draw);current.count+=draw.count;
      if(scissorOnly)scissorCommands++;else fastCommands++;
      if(dynamicClip){dynamicClipCommands++;dynamicClipVertices+=draw.count;}
    }
    closeBank();if(bankIndex!==value.banks.length)throw new Error('Prepared packet descriptor/bank plan mismatch');
    return {plan:{banks,fastCommands,scissorCommands,dynamicClipCommands,dynamicClipVertices},packed:value.geometry,clipData:value.clips};
  }
  function acceptPreparedPacket(next,draws,slots){
    if(next.prepared?.compact!==undefined){if(next.descriptorWire!==COMPACT_DESCRIPTOR_SCHEMA)throw new Error('Compact prepared packet requires validated descriptor wire');return acceptPreparedPacketCompact(next,draws,slots);}
    return next.prepared&&next.prepared.contract!==undefined?acceptPreparedPacketDirect(next,draws,slots):acceptPreparedPacketLegacy(next,draws,slots);
  }

  // Optional private-channel wire: transfer numeric descriptor tables instead
  // of cloning three nested command/contract/plan object graphs. Geometry and
  // all Canvas/ImageBitmap ownership are unchanged. Clip values stay doubles.
  const compactDecodedPackets=new WeakMap(),compactValidatedDescriptors=new WeakMap();
  function decodeCompactPacket(wire){if(!wire||wire.descriptorWire===undefined)return wire;const decoded=expandCompactPacket(wire);compactDecodedPackets.set(wire,decoded);return decoded;}
  function sceneCommands(packet){return (compactDecodedPackets.get(packet)||decodeCompactPacket(packet)).commands;}
  const COMPACT_DESCRIPTOR_SCHEMA=1,COMPACT_META=9,COMPACT_VALUES=16,COMPACT_BINDING_META=6,COMPACT_BANK=7,COMPACT_BANK_COMMAND=9;
  const compactTypes=['mesh','image','layer'];
  function compactWholeArray(value,Type,length){return value instanceof Type&&value.length===length&&value.byteOffset===0&&value.buffer.byteLength===value.byteLength;}
  function prepareCompactPacket(input,{samplerBankSize=8}={}){
    const packet=input.prepared===undefined?{...input,prepared:preparePacket(input,{samplerBankSize}).prepared}:input;
    const resolved=validatePreparationInput(packet);validateDirectContract(packet.prepared,packet);
    const p=packet.prepared,n=packet.commands.length;
    if(p.schema!==PREPARED_SCHEMA||p.samplerBankSize!==samplerBankSize)throw new Error('Compact prepared capability mismatch');
    acceptPreparedPacketDirect(packet,packet.commands.map(command=>({...command,texture:resolved.get(command.textureId)})),samplerBankSize);
    const strings=[],stringIds=new Map(),sourceIds=new Map(packet.sources.map((s,i)=>[s.id,i]));
    const intern=s=>{if(typeof s!=='string')throw new Error('Invalid compact descriptor string');let i=stringIds.get(s);if(i===undefined){i=strings.length;strings.push(s);stringIds.set(s,i);}return i;};
    const metadata=new Uint32Array(n*COMPACT_META),values=new Float64Array(n*COMPACT_VALUES),bindingMetadata=new Uint32Array(n*COMPACT_BINDING_META),bindingValues=new Float64Array(n*COMPACT_VALUES);
    for(let i=0;i<n;i++){
      const c=packet.commands[i],m=i*COMPACT_META,b=i*COMPACT_BINDING_META,v=i*COMPACT_VALUES,type=compactTypes.indexOf(c.type),source=sourceIds.get(c.textureId),signature=intern(c.signature),flags=(c.clip?1:0)|(c.previousClip?2:0);
      if(type<0||source===undefined)throw new Error('Invalid compact descriptor type/source');
      let ownerId=0,ownerContinuity=0;if(c.owner){ownerId=intern(c.owner.id)+1;ownerContinuity=intern(c.owner.continuity)+1;}
      metadata[m]=type;metadata[m+1]=source;metadata[m+2]=c.first;metadata[m+3]=c.count;metadata[m+4]=signature;metadata[m+5]=ownerId;metadata[m+6]=ownerContinuity;metadata[m+7]=c.interpolated?1:0;metadata[m+8]=flags;
      bindingMetadata[b]=type;bindingMetadata[b+1]=source;bindingMetadata[b+2]=c.first;bindingMetadata[b+3]=c.count;bindingMetadata[b+4]=signature;bindingMetadata[b+5]=flags;
      for(let k=0;k<4;k++){values[v+k]=c.hole[k];values[v+4+k]=c.tint[k];}
      if(c.clip){values[v+8]=c.clip.x;values[v+9]=c.clip.y;values[v+10]=c.clip.width;values[v+11]=c.clip.height;}
      if(c.previousClip){values[v+12]=c.previousClip.x;values[v+13]=c.previousClip.y;values[v+14]=c.previousClip.width;values[v+15]=c.previousClip.height;}
    }
    bindingValues.set(values);
    let textureCount=0,commandCount=0;for(const bank of p.banks){textureCount+=bank.textureIds.length;commandCount+=bank.commands.length;}
    if(commandCount!==n||textureCount>n)throw new Error('Invalid compact prepared plan extent');
    const banks=new Uint32Array(p.banks.length*COMPACT_BANK),textureIds=new Uint32Array(textureCount),bankCommands=new Uint32Array(n*COMPACT_BANK_COMMAND);
    let ti=0,ci=0;for(let i=0;i<p.banks.length;i++){
      const bank=p.banks[i],at=i*COMPACT_BANK;banks[at]=bank.first;banks[at+1]=bank.count;banks[at+2]=bank.scissorOnly?1:0;banks[at+3]=ti;banks[at+4]=bank.textureIds.length;banks[at+5]=ci;banks[at+6]=bank.commands.length;
      for(const id of bank.textureIds){const source=sourceIds.get(id);if(source===undefined)throw new Error('Invalid compact prepared plan source');textureIds[ti++]=source;}
      for(const c of bank.commands){const at=ci++*COMPACT_BANK_COMMAND,source=sourceIds.get(c.textureId);if(source===undefined)throw new Error('Invalid compact prepared plan source');bankCommands[at]=c.first;bankCommands[at+1]=c.count;bankCommands[at+2]=source;bankCommands[at+3]=c.slot;for(let k=0;k<4;k++)bankCommands[at+4+k]=c.bounds[k];bankCommands[at+8]=c.dynamicClip?1:0;}
    }
    const compact={schema:COMPACT_DESCRIPTOR_SCHEMA,count:n,header:p.contract.header.slice(),sources:p.contract.sources.map(s=>s.slice()),strings:strings.slice(),metadata:bindingMetadata,values:bindingValues,banks,textureIds,bankCommands};
    const wire={...packet,descriptorWire:COMPACT_DESCRIPTOR_SCHEMA,commands:metadata,descriptorValues:values,descriptorStrings:strings,
      prepared:{schema:p.schema,samplerBankSize:p.samplerBankSize,vertexCount:p.vertexCount,binding:'compact-direct-v1',compact,geometry:p.geometry,clips:p.clips}};
    const extra=[metadata.buffer,values.buffer,bindingMetadata.buffer,bindingValues.buffer,banks.buffer,textureIds.buffer,bankCommands.buffer];
    return {packet:wire,transferables:[...transferables(wire),p.geometry.buffer,p.clips.buffer,...extra]};
  }
  function expandCompactPacket(wire){
    const p=wire&&wire.prepared,c=p&&p.compact,n=c&&c.count,strings=wire&&wire.descriptorStrings;
    if(!wire||wire.descriptorWire!==COMPACT_DESCRIPTOR_SCHEMA||!p||p.binding!=='compact-direct-v1'||!c||c.schema!==COMPACT_DESCRIPTOR_SCHEMA||!Number.isSafeInteger(n)||n<0||n>MAX_COMMANDS||!Array.isArray(strings)||strings.length>MAX_COMMANDS*3||strings.some(s=>typeof s!=='string')||new Set(strings).size!==strings.length||!Array.isArray(wire.sources)||wire.sources.length>MAX_SOURCES||
      !compactWholeArray(wire.commands,Uint32Array,n*COMPACT_META)||!compactWholeArray(wire.descriptorValues,Float64Array,n*COMPACT_VALUES)||!compactWholeArray(c.metadata,Uint32Array,n*COMPACT_BINDING_META)||!compactWholeArray(c.values,Float64Array,n*COMPACT_VALUES)||
      !(c.banks instanceof Uint32Array)||c.banks.length%COMPACT_BANK||c.banks.length/COMPACT_BANK>MAX_COMMANDS||!compactWholeArray(c.banks,Uint32Array,c.banks.length)||!(c.textureIds instanceof Uint32Array)||c.textureIds.length>n||!compactWholeArray(c.textureIds,Uint32Array,c.textureIds.length)||!compactWholeArray(c.bankCommands,Uint32Array,n*COMPACT_BANK_COMMAND))throw new Error('Invalid compact retained descriptor layout');
    const buffers=[wire.commands.buffer,wire.descriptorValues.buffer,c.metadata.buffer,c.values.buffer,c.banks.buffer,c.textureIds.buffer,c.bankCommands.buffer];
    const raw=[wire.vertices,wire.alphas,wire.previousPoints,wire.previousAlphas,p.geometry,p.clips].map(a=>a&&a.buffer);
    if(new Set(buffers).size!==buffers.length||buffers.some(buffer=>raw.includes(buffer)))throw new Error('Invalid compact retained descriptor ownership');
    const h=c.header;if(!Array.isArray(h)||h.length!==6||h[0]!==wire.version||h[1]!==wire.scope||h[2]!==wire.sequence||h[3]!==wire.width||h[4]!==wire.height||h[5]!==wire.view||!Array.isArray(c.sources)||c.sources.length!==wire.sources.length)throw new Error('Compact retained header/source binding mismatch');
    if(!Array.isArray(c.strings)||c.strings.length!==strings.length||strings.some((s,i)=>s!==c.strings[i]))throw new Error('Compact retained string binding mismatch');
    for(let i=0;i<wire.sources.length;i++){const a=c.sources[i],s=wire.sources[i];if(!Array.isArray(a)||a.length!==4||a[0]!==s.id||a[1]!==s.version||a[2]!==s.width||a[3]!==s.height)throw new Error('Compact retained source binding mismatch');}
    const descriptors=[],meta=wire.commands,values=wire.descriptorValues;
    const vertexCount=wire.alphas instanceof Float32Array?wire.alphas.length:null;let covered=0;
    for(let i=0;i<n;i++){
      const m=i*COMPACT_META,b=i*COMPACT_BINDING_META,v=i*COMPACT_VALUES,type=meta[m],source=meta[m+1],signature=meta[m+4],ownerId=meta[m+5],continuity=meta[m+6],flags=meta[m+8];
      if(type>=compactTypes.length||source>=wire.sources.length||signature>=strings.length||ownerId>strings.length||continuity>strings.length||(!ownerId!==!continuity)||meta[m+7]>1||flags>3)throw new Error('Invalid compact retained descriptor index/flag');
      if(type!==c.metadata[b]||source!==c.metadata[b+1]||meta[m+2]!==c.metadata[b+2]||meta[m+3]!==c.metadata[b+3]||signature!==c.metadata[b+4]||flags!==c.metadata[b+5])throw new Error('Compact retained descriptor binding mismatch');
      for(let k=0;k<COMPACT_VALUES;k++)if(!finite(values[v+k])||values[v+k]!==c.values[v+k])throw new Error('Compact retained descriptor value binding mismatch');
      const clip=flags&1?{x:values[v+8],y:values[v+9],width:values[v+10],height:values[v+11]}:null,previousClip=flags&2?{x:values[v+12],y:values[v+13],width:values[v+14],height:values[v+15]}:null;
      if(!clip&&(values[v+8]||values[v+9]||values[v+10]||values[v+11])||!previousClip&&(values[v+12]||values[v+13]||values[v+14]||values[v+15]))throw new Error('Invalid compact absent clip values');
      // Type/string/array-shape/finite validation is already established by
      // the wire gates immediately above. Keep all remaining original draw,
      // order and both-clip predicates here while the scalars are in hand.
      const first=meta[m+2],count=meta[m+3];
      if(vertexCount!==null){
        if(count<=0||count%3||first+count>vertexCount||clip&&(clip.width<0||clip.height<0))throw new Error('Invalid retained draw descriptor');
        if(first!==covered||previousClip&&(previousClip.width<0||previousClip.height<0))throw new Error('Invalid retained packet order/clip');
        covered+=count;
      }
      descriptors.push({type:compactTypes[type],textureId:wire.sources[source].id,first,count,signature:strings[signature],hole:[values[v],values[v+1],values[v+2],values[v+3]],tint:[values[v+4],values[v+5],values[v+6],values[v+7]],clip,previousClip,owner:ownerId?{id:strings[ownerId-1],continuity:strings[continuity-1]}:null,interpolated:!!meta[m+7]});
    }
    const decoded={...wire,commands:descriptors};
    if(vertexCount!==null)compactValidatedDescriptors.set(decoded,{covered,vertexCount,alphas:wire.alphas});
    return decoded;
  }
  function acceptPreparedPacketCompact(next,draws,slots){
    const value=next.prepared,c=value.compact,n=draws.length;
    if(value.schema!==PREPARED_SCHEMA||value.samplerBankSize!==slots||value.vertexCount!==next.alphas.length)throw new Error('Compact prepared schema/capability mismatch');
    if(!compactWholeArray(value.geometry,Float32Array,next.alphas.length*17)||!compactWholeArray(value.clips,Float32Array,next.alphas.length*4)||value.geometry.buffer===value.clips.buffer||[next.vertices.buffer,next.alphas.buffer,next.previousPoints.buffer,next.previousAlphas.buffer].some(buffer=>buffer===value.geometry.buffer||buffer===value.clips.buffer))throw new Error('Compact prepared stream layout/ownership mismatch');
    const idByTexture=new Map();for(const draw of draws){const prior=idByTexture.get(draw.texture);if(prior!==undefined&&prior!==draw.textureId)throw new Error('Compact prepared texture mapping is not one-to-one');idByTexture.set(draw.texture,draw.textureId);}
    const banks=[];let current=null,bankIndex=0,textureOffset=0,commandOffset=0,bankAt=0,bankCommandStart=0,fastCommands=0,scissorCommands=0,dynamicClipCommands=0,dynamicClipVertices=0;
    function closeBank(){if(current&&(current.count!==c.banks[bankAt+1]||current.textures.length!==c.banks[bankAt+4]||commandOffset-bankCommandStart!==c.banks[bankAt+6]))throw new Error('Compact prepared bank plan mismatch');}
    for(let i=0;i<n;i++){
      const draw=draws[i],bounds=clipBoundsAt(draw,1,next.width,next.height),scissorOnly=!clipFitsBank(draw,next.width,next.height),dynamicClip=!scissorOnly&&dynamicBankClip(draw),source=next.commands[i]?next.commands[i].textureId:null;
      const compatible=current&&current.scissorOnly===scissorOnly&&(!scissorOnly||sameClip(current.clip,draw.clip)&&sameClip(current.previousClip,draw.previousClip));
      if(!compatible||!current.slots.has(draw.texture)&&current.textures.length===slots){
        closeBank();bankAt=bankIndex++*COMPACT_BANK;bankCommandStart=commandOffset;
        if(bankAt>=c.banks.length||c.banks[bankAt]!==draw.first||c.banks[bankAt+1]===0||c.banks[bankAt+2]!==Number(scissorOnly)||c.banks[bankAt+3]!==textureOffset||c.banks[bankAt+4]<1||c.banks[bankAt+4]>slots||c.banks[bankAt+5]!==commandOffset||c.banks[bankAt+6]<1||c.banks[bankAt+6]>n)throw new Error('Compact prepared bank plan mismatch');
        current={first:draw.first,count:0,commands:[],textures:[],slots:new Map(),scissorOnly,clip:draw.clip,previousClip:draw.previousClip};banks.push(current);
      }
      let slot=current.slots.get(draw.texture);
      if(slot===undefined){slot=current.textures.length;const sourceIndex=c.textureIds[textureOffset++];if(sourceIndex>=next.sources.length||next.sources[sourceIndex].id!==source)throw new Error('Compact prepared bank texture mismatch');current.slots.set(draw.texture,slot);current.textures.push(draw.texture);}
      const at=commandOffset++*COMPACT_BANK_COMMAND,actualBounds=scissorOnly?[0,0,next.width,next.height]:bounds,sourceIndex=c.bankCommands[at+2];
      if(c.bankCommands[at]!==draw.first||c.bankCommands[at+1]!==draw.count||sourceIndex>=next.sources.length||next.sources[sourceIndex].id!==source||c.bankCommands[at+3]!==slot||c.bankCommands[at+8]!==Number(dynamicClip))throw new Error('Compact prepared bank command mismatch');
      for(let k=0;k<4;k++)if(c.bankCommands[at+4+k]!==actualBounds[k])throw new Error('Compact prepared bank bounds mismatch');
      draw.slot=slot;draw.bounds=actualBounds;draw.dynamicClip=dynamicClip;current.commands.push(draw);current.count+=draw.count;
      if(scissorOnly)scissorCommands++;else fastCommands++;if(dynamicClip){dynamicClipCommands++;dynamicClipVertices+=draw.count;}
    }
    closeBank();if(bankIndex*COMPACT_BANK!==c.banks.length||textureOffset!==c.textureIds.length||commandOffset!==n)throw new Error('Compact prepared bank coverage mismatch');
    return {plan:{banks,fastCommands,scissorCommands,dynamicClipCommands,dynamicClipVertices},packed:value.geometry,clipData:value.clips};
  }

  function preparePacket(packet,{samplerBankSize=8}={}){
    if(!Number.isInteger(samplerBankSize)||samplerBankSize<1||samplerBankSize>16)throw new Error('Invalid preparation sampler capability');
    const sources=validatePreparationInput(packet),draws=packet.commands.map(c=>({...c,texture:sources.get(c.textureId)}));
    const plan=compileSamplerBanks(draws,samplerBankSize,packet.width,packet.height),streams=packPreparedStreams(packet,plan);
    const prepared={schema:PREPARED_SCHEMA,samplerBankSize,vertexCount:packet.alphas.length,binding:DIRECT_PREPARATION_BINDING,contract:preparationContract(packet),banks:serializePreparationPlan(plan),...streams};
    return {prepared,transferables:[streams.geometry.buffer,streams.clips.buffer]};
  }
  function acceptPreparedPacketLegacy(next,draws,slots){
    const value=next.prepared;
    if(!value||value.schema!==PREPARED_SCHEMA||value.samplerBankSize!==slots||value.vertexCount!==next.alphas.length||value.binding!==packetPreparationBinding(next))throw new Error('Prepared packet schema/capability/binding mismatch');
    if(!(value.geometry instanceof Float32Array)||!(value.clips instanceof Float32Array)||value.geometry.length!==next.alphas.length*17||value.clips.length!==next.alphas.length*4||value.geometry.byteOffset!==0||value.clips.byteOffset!==0||value.geometry.buffer.byteLength!==value.geometry.byteLength||value.clips.buffer.byteLength!==value.clips.byteLength||value.geometry.buffer===value.clips.buffer||[next.vertices.buffer,next.alphas.buffer,next.previousPoints.buffer,next.previousAlphas.buffer].some(buffer=>buffer===value.geometry.buffer||buffer===value.clips.buffer))throw new Error('Prepared packet stream layout/ownership mismatch');
    // Texture object aliases may produce a different but equivalent plan for a
    // custom resolver. The production receiver's source bank is one-to-one;
    // conservatively decline any topology mismatch instead of remapping slots.
    const idByTexture=new Map();for(const c of draws){const previous=idByTexture.get(c.texture);if(previous!==undefined&&previous!==c.textureId)throw new Error('Prepared packet texture mapping is not one-to-one');idByTexture.set(c.texture,c.textureId);}
    const plan=compileSamplerBanks(draws,slots,next.width,next.height),serialized=serializePreparationPlan({...plan,banks:plan.banks.map(bank=>({...bank,textures:bank.textures.map(texture=>({id:idByTexture.get(texture)}))}))});
    if(!Array.isArray(value.banks)||value.banks.length>MAX_COMMANDS||JSON.stringify(value.banks)!==JSON.stringify(serialized))throw new Error('Prepared packet descriptor/bank plan mismatch');
    return {plan,packed:value.geometry,clipData:value.clips};
  }

  function createRenderer(gl,{canvas,resolveTexture,sourceValid=()=>true,samplerBankSize=8,stageDiagnostics=false,privateReplayStateCache=false,coalesceClipUploads=false}={}){
    if(!gl||!canvas||typeof resolveTexture!=='function')throw new Error('Retained renderer requires owned GL surface and texture resolver');
    const maxUnits=gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),maxAttributes=gl.getParameter(gl.MAX_VERTEX_ATTRIBS),maxVaryings=gl.getParameter(gl.MAX_VARYING_VECTORS);
    if(!Number.isInteger(maxUnits)||maxUnits<1||maxAttributes<6||maxVaryings<6)throw new Error('Sampler-bank GPU capabilities unavailable');
    const slots=Math.min(maxUnits,Number.isInteger(samplerBankSize)&&samplerBankSize>=1?samplerBankSize:8,16);
    let disposed=false,packet=null,token=null,replays=0,uploads=0,capacity=0,clipCapacity=0,clipUploadCalls=0,clipUploadBytes=0,lastClipUploadBytes=0,lastStageTimings=null;const shaders=[];
    // Explicitly opt in only for a privately owned context. Cached GL state
    // mutations require invalidation; program/attribute ownership remains the
    // renderer's exclusive contract. Import invalidates before upload/resize.
    const cacheReplayState=privateReplayStateCache===true,mergeClipUploads=coalesceClipUploads===true;
    const boundReplayTextures=Array(slots).fill(null);
    let replayStateReady=false,activeReplayUnit=null,staticStateSetups=0,textureBindCalls=0,skippedTextureBindCalls=0,replayStateInvalidations=0;
    function invalidateReplayState(){
      if(!cacheReplayState)return;
      replayStateReady=false;activeReplayUnit=null;boundReplayTextures.fill(null);replayStateInvalidations++;
    }
    function selectReplayUnit(unit){
      if(!cacheReplayState||activeReplayUnit!==unit){gl.activeTexture(gl.TEXTURE0+unit);if(cacheReplayState)activeReplayUnit=unit;}
    }
    const shader=(type,text)=>{const s=gl.createShader(type);if(!s)throw new Error('Retained shader allocation failed');shaders.push(s);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Retained shader compilation failed');return s;};
    let precision='mediump';try{if(gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision>0)precision='highp';}catch(_){}
    // The fixed pixel-center clip gate requires fragment highp. Fail closed on
    // older WebGL devices; this candidate must not weaken the current fallback.
    if(precision!=='highp')throw new Error('Sampler-bank requires fragment highp');
    const program=gl.createProgram();
    try{gl.attachShader(program,shader(gl.VERTEX_SHADER,samplerVertexShader(precision)));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,samplerFragmentShader(precision,slots)));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Retained shader linking failed');}
    catch(error){shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);throw error;}
    const names=['pointUV','previousAndAlpha','primitiveTint','primitiveHole','primitiveClip','textureSlot'];
    const attributes=Object.fromEntries(names.map(n=>[n,gl.getAttribLocation(program,n)]));
    if(Object.values(attributes).some(a=>a<0)){shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);throw new Error('Retained attribute missing');}
    const uniforms=Object.fromEntries(['extent','sceneBlend','opacity',...Array.from({length:slots},(_,i)=>'atlas'+i)].map(n=>[n,gl.getUniformLocation(program,n)]));
    const buffer=gl.createBuffer(),clipBuffer=gl.createBuffer();if(!buffer||!clipBuffer){if(buffer)gl.deleteBuffer(buffer);if(clipBuffer)gl.deleteBuffer(clipBuffer);shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);throw new Error('Retained VBO allocation failed');}
    function bindStream(){
      gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      const fields=[['pointUV',4,0],['previousAndAlpha',4,16],['primitiveTint',4,32],['primitiveHole',4,48],['textureSlot',1,64]];
      for(const [name,size,offset]of fields){gl.enableVertexAttribArray(attributes[name]);gl.vertexAttribPointer(attributes[name],size,gl.FLOAT,false,68,offset);}
      gl.bindBuffer(gl.ARRAY_BUFFER,clipBuffer);gl.enableVertexAttribArray(attributes.primitiveClip);gl.vertexAttribPointer(attributes.primitiveClip,4,gl.FLOAT,false,16,0);
    }
    const valid=()=>!disposed&&packet&&!gl.isContextLost()&&canvas.width===packet.width&&canvas.height===packet.height&&packet.sources.every(sourceValid);
    function restoreUploadUnit(){selectReplayUnit(0);}
    return {stage(next){
      invalidateReplayState();
      const clock=stageDiagnostics?()=>globalThis.performance&&typeof globalThis.performance.now==='function'?globalThis.performance.now():Date.now():null;
      const phases=clock?{}:null;let lastPhaseAt=clock?clock():0;
      const phase=name=>{if(phases){const at=clock();phases[name]=at-lastPhaseAt;lastPhaseAt=at;}};
      if(disposed||gl.isContextLost()||!next||next.version!==VERSION)throw new Error('Invalid retained packet/context');
      if(next.descriptorWire!==undefined){next=decodeCompactPacket(next);phase('decodeDescriptorsMs');}
      if(!(next.vertices instanceof Float32Array)||!(next.alphas instanceof Float32Array)||!(next.previousPoints instanceof Float32Array)||!(next.previousAlphas instanceof Float32Array)||next.vertices.length!==next.alphas.length*4||next.previousPoints.length!==next.alphas.length*2||next.previousAlphas.length!==next.alphas.length||next.alphas.length>MAX_VERTICES)throw new Error('Invalid retained packet streams');
      const validated=compactValidatedDescriptors.get(next);let covered=validated?validated.covered:0;
      if(!validated)for(const c of next.commands){validateDescriptor(c,next.alphas.length);if(c.first!==covered||!validClip(c.previousClip))throw new Error('Invalid retained packet order/clip');covered+=c.count;}
      if(validated&&(validated.vertexCount!==next.alphas.length||validated.alphas!==next.alphas))throw new Error('Invalid retained packet streams');
      if(covered!==next.alphas.length||next.commands.length>MAX_COMMANDS||next.sources.length>MAX_SOURCES||next.width!==canvas.width||next.height!==canvas.height)throw new Error('Retained packet scope/dimensions invalid');
      // The compact decoder creates private records for this import. Reuse
      // them as draws instead of cloning each record again with object spread.
      // Wire metadata and the encoder's original descriptors remain untouched.
      const draws=validated?next.commands:next.commands.map(c=>({...c,texture:resolveTexture(c.textureId)}));
      if(validated)for(const c of draws)c.texture=resolveTexture(c.textureId);
      if(draws.some(c=>!c.texture)||!next.sources.every(sourceValid))throw new Error('Retained texture unavailable');
      phase('validateResolveMs');token=null;packet=null;
      let plan,packed,clipData;
      if(next.prepared!==undefined){
        const accepted=acceptPreparedPacket(next,draws,slots);plan=accepted.plan;packed=accepted.packed;clipData=accepted.clipData;phase('compilePlanMs');
      }else{
        plan=compileSamplerBanks(draws,slots,next.width,next.height);phase('compilePlanMs');
        const streams=packPreparedStreams(next,plan);packed=streams.geometry;clipData=streams.clips;
      }
      const dynamicClips=plan.banks.flatMap(bank=>bank.commands.filter(command=>command.dynamicClip));
      phase('packStreamsMs');gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);let allocated=false;
      if(packed.byteLength>capacity){gl.bufferData(gl.ARRAY_BUFFER,packed.byteLength,gl.DYNAMIC_DRAW);capacity=packed.byteLength;allocated=true;}
      if(packed.length)gl.bufferSubData(gl.ARRAY_BUFFER,0,packed);uploads++;
      gl.bindBuffer(gl.ARRAY_BUFFER,clipBuffer);
      if(clipData.byteLength>clipCapacity){gl.bufferData(gl.ARRAY_BUFFER,clipData.byteLength,gl.DYNAMIC_DRAW);clipCapacity=clipData.byteLength;allocated=true;}
      if(clipData.length)gl.bufferSubData(gl.ARRAY_BUFFER,0,clipData);
      phase('submitVBOMs');if(allocated&&gl.getError()!==gl.NO_ERROR)throw new Error('Retained VBO allocation failed');phase('allocationCheckMs');
      const clipSpans=[];for(const c of dynamicClips){const tail=clipSpans.at(-1);if(tail&&tail.first+tail.count===c.first)tail.count+=c.count;else clipSpans.push({first:c.first,count:c.count});}
      const originalClipUploadSpans=clipSpans.length;
      // The optional single span reuploads original static clip values between
      // moving commands. All geometry, clip bounds and painter order stay exact.
      // Views are prepared once at stage; RAF allocates no new buffer or view.
      if(mergeClipUploads&&clipSpans.length>1){const first=clipSpans[0].first,last=clipSpans.at(-1);clipSpans.splice(0,clipSpans.length,{first,count:last.first+last.count-first});}
      for(const span of clipSpans)span.data=clipData.subarray(span.first*4,(span.first+span.count)*4);
      lastClipUploadBytes=0;
      packet={...next,commands:draws,...plan,packedBytes:packed.byteLength+clipData.byteLength,geometryBytes:packed.byteLength,preparedPacket:next.prepared!==undefined,preparedValidation:next.prepared?(next.prepared.compact!==undefined?'compact-v1':next.prepared.contract!==undefined?'direct-v1':'json-v1'):null,clipData,dynamicClips,clipSpans,originalClipUploadSpans,lastClipBlend:1};token=Object.freeze({scope:next.scope,sequence:next.sequence});bindStream();restoreUploadUnit();phase('setupMs');lastStageTimings=phases;return token;
    },replay(frame,{blend=1,present}={}){
      if(frame!==token||!finite(blend)||blend<0||blend>1)return false;
      if(!valid()){invalidateReplayState();return false;}
      lastClipUploadBytes=0;
      if(packet.dynamicClips.length&&packet.lastClipBlend!==blend){
        for(const c of packet.dynamicClips){const bounds=clipBoundsAt(c,blend,packet.width,packet.height);if(!bounds)return false;for(let k=0;k<c.count;k++)packet.clipData.set(bounds,(c.first+k)*4);}
        gl.bindBuffer(gl.ARRAY_BUFFER,clipBuffer);
        for(const span of packet.clipSpans){gl.bufferSubData(gl.ARRAY_BUFFER,span.first*16,span.data);clipUploadCalls++;clipUploadBytes+=span.data.byteLength;lastClipUploadBytes+=span.data.byteLength;}
        packet.lastClipBlend=blend;
      }
      if(!cacheReplayState||!replayStateReady){
        gl.uniform2f(uniforms.extent,packet.width,packet.height);gl.uniform1f(uniforms.sceneBlend,blend);gl.uniform1f(uniforms.opacity,1);
        for(let i=0;i<slots;i++)gl.uniform1i(uniforms['atlas'+i],i);
        gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.viewport(0,0,packet.width,packet.height);
        if(cacheReplayState)replayStateReady=true;staticStateSetups++;
      }else gl.uniform1f(uniforms.sceneBlend,blend);
      // Clear and current scissor remain per replay; sceneBlend is never cached.
      gl.scissor(0,0,packet.width,packet.height);gl.clear(gl.COLOR_BUFFER_BIT);
      const full=[0,0,packet.width,packet.height];let lastClip=full;
      try{
        for(const bank of packet.banks){
          const clip=bank.scissorOnly?bankScissor(bank,blend,packet.width,packet.height):full;
          if(clip.some((v,k)=>v!==lastClip[k])){gl.scissor(...clip);lastClip=clip;}
          // WebGL validates every active sampler, including unchosen branches.
          // Bind a legal in-bank texture to unused slots without changing UVs.
          for(let i=0;i<slots;i++){
            const texture=bank.textures[i]||bank.textures[0];
            if(!cacheReplayState||boundReplayTextures[i]!==texture){selectReplayUnit(i);gl.bindTexture(gl.TEXTURE_2D,texture);textureBindCalls++;if(cacheReplayState)boundReplayTextures[i]=texture;}
            else skippedTextureBindCalls++;
          }
          gl.drawArrays(gl.TRIANGLES,bank.first,bank.count);
        }
      }catch(error){invalidateReplayState();throw error;}finally{restoreUploadUnit();}
      if(!valid()){invalidateReplayState();return false;}replays++;return typeof present==='function'?present(canvas)!==false:true;
    },invalidateReplayState,invalidate(){invalidateReplayState();token=null;packet=null;},dispose(){if(disposed)return;invalidateReplayState();disposed=true;token=null;packet=null;gl.deleteBuffer(buffer);gl.deleteBuffer(clipBuffer);shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);},
      get stats(){return {replays,uploads,active:!!token,bytes:packet?.stats?.transferBytes||0,packedBytes:packet?.packedBytes||0,commands:packet?.commands?.length||0,drawRuns:packet?.banks?.length||0,samplerBankSize:slots,fastCommands:packet?.fastCommands||0,scissorCommands:packet?.scissorCommands||0,dynamicClipCommands:packet?.dynamicClipCommands||0,dynamicClipVertices:packet?.dynamicClipVertices||0,privateReplayStateCache:cacheReplayState,coalesceClipUploads:mergeClipUploads,staticStateSetups,textureBindCalls,skippedTextureBindCalls,replayStateInvalidations,originalClipUploadSpans:packet?.originalClipUploadSpans||0,clipUploadSpans:packet?.clipSpans?.length||0,clipUploadCalls,clipUploadBytes,lastClipUploadBytes,preparedPacket:packet?.preparedPacket||false,preparedValidation:packet?.preparedValidation||null,lastStageTimings:lastStageTimings&&{...lastStageTimings}};}};
  }

  // A separate presentation surface needs no motion PNGs loaded on main. The
  // worker sends a bitmap once for each sheet/static version and once per new
  // dynamic atlas page. The receiver owns and closes every bitmap after upload.
  function createPacketPresenter(platform){
    const canvas=platform.createMeshCanvas(),gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance',desynchronized:true});
    if(!gl)throw new Error('Packet presentation WebGL unavailable');
    const bank=new Map(),spares=[];
    let disposed=false,lost=false,frame=null,pooledPixels=0,physicalAllocations=0,recycledTextures=0,subimageUpdates=0,lastAllocations=[],lastImportStages=null;
    const TEXTURE_PIXEL_LIMIT=64*1024*1024;
    function retireTexture(texture){
      // A finished keyframe no longer names this ID. Keep the physical store
      // only for another source with the EXACT same dimensions; no UV scaling,
      // texture padding or shader sampling change is permitted.
      spares.push(texture);pooledPixels+=texture.width*texture.height;
    }
    function borrowTexture(width,height){
      for(let i=spares.length-1;i>=0;i--)if(spares[i].width===width&&spares[i].height===height){
        const texture=spares.splice(i,1)[0];pooledPixels-=width*height;recycledTextures++;return texture;
      }
      return null;
    }
    function trimTextures(pixelBudget){
      // Oldest unused physical stores leave first. Active plus retained stores
      // fit the existing 64 Mpixel texture budget; at most one manifest's count
      // of unused stores may remain, regardless of their source-ID churn.
      while(spares.length&&(pooledPixels>pixelBudget||spares.length>MAX_SOURCES)){
        const texture=spares.shift();pooledPixels-=texture.width*texture.height;gl.deleteTexture(texture.texture);
      }
    }
    if(canvas.addEventListener)canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;});
    const valid=s=>{const v=bank.get(s.id);return !!v&&v.version===s.version&&v.width===s.width&&v.height===s.height;};
    const renderer=createRenderer(gl,{canvas,resolveTexture:id=>bank.get(id)?.texture,sourceValid:valid,samplerBankSize:platform.samplerBankSize||8,stageDiagnostics:platform.stageDiagnostics===true,privateReplayStateCache:platform.privateReplayStateCache===true,coalesceClipUploads:platform.coalesceClipUploads===true});
    const maxSide=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    function closeSources(records){const closed=new Set();for(const r of Array.isArray(records)?records:[])if(r?.source&&!closed.has(r.source)){closed.add(r.source);if(typeof r.source.close==='function')try{r.source.close();}catch(_){}}}
    return {import({packet,textures=[]}){
      const clock=platform.stageDiagnostics===true?()=>globalThis.performance&&typeof globalThis.performance.now==='function'?globalThis.performance.now():Date.now():null;
      const phases=clock?{}:null;let lastPhaseAt=clock?clock():0;
      const phase=name=>{if(phases){const at=clock();phases[name]=at-lastPhaseAt;lastPhaseAt=at;}};
      frame=null;renderer.invalidate();
      try{
        if(disposed||lost||gl.isContextLost()||!packet||packet.version!==VERSION||!Array.isArray(textures)||textures.length>MAX_SOURCES+32||packet.sources.length>MAX_SOURCES)throw new Error('Packet presentation unavailable');
        const required=new Map(packet.sources.map(s=>[s.id,s]));if(required.size!==packet.sources.length)throw new Error('Duplicate packet texture ID');
        const updates=new Map();for(const r of textures){const needed=required.get(r.id);if(!needed||!r.source||r.version!==needed.version||r.width!==needed.width||r.height!==needed.height||r.source.width!==r.width||r.source.height!==r.height||r.width>maxSide||r.height>maxSide||updates.has(r.id))throw new Error('Invalid packet bitmap manifest');updates.set(r.id,r);}
        for(const [id,s]of required)if(!valid(s)&&!updates.has(id))throw new Error('Missing packet bitmap version');
        // Validate the bounded complete manifest before reallocating the bank.
        let pixels=0;for(const s of required.values()){pixels+=s.width*s.height;if(!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<=0||s.height<=0||s.width>maxSide||s.height>maxSide||pixels>64*1024*1024)throw new Error('Packet texture budget exceeded');}
        phase('validationMs');for(const [id,v]of bank)if(!required.has(id)){retireTexture(v);bank.delete(id);}
        const residentPixels=Array.from(bank.values()).reduce((sum,v)=>sum+v.width*v.height,0);
        trimTextures(Math.max(0,TEXTURE_PIXEL_LIMIT-Math.max(pixels,residentPixels)));
        lastAllocations=[];
        gl.activeTexture(gl.TEXTURE0);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
        phase('prepareTexturesMs');let textureAllocated=false;
        for(const [id,r]of updates){
          let v=bank.get(id);
          if(!v){
            v=borrowTexture(r.width,r.height);
            if(!v){const texture=gl.createTexture();if(!texture)throw new Error('Packet texture allocation failed');v={texture};}
            bank.set(id,v);
          }
          gl.bindTexture(gl.TEXTURE_2D,v.texture);
          const reallocate=v.width!==r.width||v.height!==r.height;
          if(reallocate){
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          }
          // Replace only at a keyframe. Replaying a GPU frame never uploads.
          if(reallocate){
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,r.source);textureAllocated=true;physicalAllocations++;
            if(lastAllocations.length<16)lastAllocations.push({id,width:r.width,height:r.height,previousWidth:v.width||0,previousHeight:v.height||0});
          }else {gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,r.source);subimageUpdates++;}
          Object.assign(v,{version:r.version,width:r.width,height:r.height});
        }
        trimTextures(Math.max(0,TEXTURE_PIXEL_LIMIT-pixels));
        phase('textureUploadsMs');if(textureAllocated&&gl.getError()!==gl.NO_ERROR)throw new Error('Packet texture allocation failed');phase('textureAllocationCheckMs');
        if(canvas.width!==packet.width)canvas.width=packet.width;if(canvas.height!==packet.height)canvas.height=packet.height;
        phase('surfaceResizeMs');frame=renderer.stage(packet);phase('rendererStageMs');lastImportStages=phases;return frame;
      }finally{closeSources(textures);}
    },replay(token,blend,present){if(disposed||lost||token!==frame)return false;return renderer.replay(token,{blend,present});},
      invalidateReplayState(){renderer.invalidateReplayState();},invalidate(){frame=null;renderer.invalidate();},dispose(){if(disposed)return;disposed=true;renderer.dispose();for(const v of bank.values())gl.deleteTexture(v.texture);bank.clear();for(const v of spares)gl.deleteTexture(v.texture);spares.length=0;pooledPixels=0;frame=null;},
      get canvas(){return canvas;},get stats(){return {...renderer.stats,textureCount:bank.size,pooledTextureCount:spares.length,pooledTexturePixels:pooledPixels,
        lastImportStages:lastImportStages&&{...lastImportStages},physicalTextureAllocations:physicalAllocations,recycledTextures,subimageUpdates,lastAllocations:lastAllocations.map(r=>({...r}))};}};
  }
  return {compactDescriptorSchema:COMPACT_DESCRIPTOR_SCHEMA,prepareCompactPacket,decodeCompactPacket,sceneCommands,preparedSchema:PREPARED_SCHEMA,preparePacket,version:VERSION,MAX_VERTICES,MAX_COMMANDS,MAX_SOURCES,createCompiler,createRenderer,createPacketPresenter,transferables,vertexShader,fragmentShader,samplerVertexShader,samplerFragmentShader,compileSamplerBanks,fixedBankClip,bankScissor,clipBoundsAt,dynamicBankClip,clipFitsBank};
});
