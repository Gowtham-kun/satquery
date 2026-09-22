let cachedPipeline=null;
let isInitializing=false;

export async function checkWebGPUCompatibility(){
if(typeof navigator==='undefined'||!('gpu' in navigator)||!navigator.gpu){
return{isCompatible:false,reason:"WebGPU is not supported by your browser or OS. Please open this application in Google Chrome, Microsoft Edge, or a WebGPU-enabled browser."};
}
try{
const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
if(!adapter){
return{isCompatible:false,reason:"No compatible GPU adapter found. Hardware graphics acceleration may be disabled in your browser settings (Settings > System > Use graphics acceleration when available)."};
}
if(adapter.isFallbackAdapter){
return{isCompatible:false,reason:"A software fallback adapter was detected instead of a physical hardware GPU. SatQuery AI requires a dedicated or integrated hardware GPU."};
}
let info={vendor:'Detected GPU',architecture:'Hardware Accelerated',device:'WebGPU Device',description:''};
if(adapter.info){
info={vendor:adapter.info.vendor||'Detected GPU',architecture:adapter.info.architecture||'',device:adapter.info.device||'Hardware Accelerator',description:adapter.info.description||''};
}else if(typeof adapter.requestAdapterInfo==='function'){
const raw=await adapter.requestAdapterInfo();
info={vendor:raw.vendor||'Detected GPU',architecture:raw.architecture||'',device:raw.device||'Hardware Accelerator',description:raw.description||''};
}
const device=await adapter.requestDevice();
if(!device){
return{isCompatible:false,reason:"Failed to allocate WebGPU device context on your GPU."};
}
device.destroy();
return{isCompatible:true,gpuInfo:info};
}catch(err){
return{isCompatible:false,reason:"GPU initialization check failed: "+(err?.message||String(err))};
}
}

export async function getClientGPUPipeline(onProgress){
if(cachedPipeline)return cachedPipeline;
if(isInitializing){
while(isInitializing){
await new Promise(r=>setTimeout(r,200));
}
if(cachedPipeline)return cachedPipeline;
}
isInitializing=true;
try{
const{pipeline,env}=await import('@huggingface/transformers');
env.allowLocalModels=false;
env.useBrowserCache=true;
cachedPipeline=await pipeline('text-generation','onnx-community/Qwen2.5-0.5B-Instruct',{
device:'webgpu',
dtype:'q4',
progress_callback:onProgress
});
return cachedPipeline;
}finally{
isInitializing=false;
}
}

export async function generateOnClientGPU(systemPrompt,userPrompt,onProgress){
const generator=await getClientGPUPipeline(onProgress);
const prompt=`<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;
const output=await generator(prompt,{
max_new_tokens:220,
temperature:0.2,
do_sample:false,
return_full_text:false
});
let text='';
if(Array.isArray(output)&&output[0]?.generated_text){
text=output[0].generated_text;
}else if(typeof output==='string'){
text=output;
}
return text.replace(/<\|im_end\|>/g,'').trim();
}
