import React,{useState}from'react';

export default function GpuLockScreen({reason,onRetry}){
const[retrying,setRetrying]=useState(false);
const handleRetry=async()=>{
setRetrying(true);
try{
await onRetry();
}finally{
setRetrying(false);
}
};

return(
<div style={{
position:'fixed',
inset:0,
zIndex:999999,
background:'radial-gradient(circle at center, #111422 0%, #06080e 100%)',
color:'#e2e8f0',
display:'flex',
alignItems:'center',
justifyContent:'center',
fontFamily:'system-ui, -apple-system, sans-serif',
padding:'24px'
}}>
<div style={{
maxWidth:'580px',
width:'100%',
background:'rgba(15, 23, 42, 0.85)',
backdropFilter:'blur(20px)',
border:'1px solid rgba(239, 68, 68, 0.35)',
borderRadius:'16px',
boxShadow:'0 25px 60px -15px rgba(239, 68, 68, 0.2), 0 0 40px rgba(0, 0, 0, 0.8)',
padding:'36px',
textAlign:'center'
}}>
<div style={{
width:'64px',
height:'64px',
margin:'0 auto 20px',
borderRadius:'50%',
background:'rgba(239, 68, 68, 0.12)',
border:'1px solid rgba(239, 68, 68, 0.4)',
display:'flex',
alignItems:'center',
justifyContent:'center',
fontSize:'30px'
}}>
🛑
</div>
<h1 style={{
margin:'0 0 10px 0',
fontSize:'22px',
fontWeight:'700',
letterSpacing:'-0.02em',
color:'#f87171'
}}>
Compatible GPU Required
</h1>
<p style={{
margin:'0 0 20px 0',
fontSize:'13px',
color:'#94a3b8',
lineHeight:1.6
}}>
SatQuery AI runs real-time satellite vision-language AI and synthetic aperture radar fusion directly on your local GPU via WebGPU. Access is locked because a compatible physical GPU was not detected.
</p>
<div style={{
background:'rgba(239, 68, 68, 0.08)',
border:'1px solid rgba(239, 68, 68, 0.2)',
borderRadius:'8px',
padding:'12px 16px',
margin:'0 0 24px 0',
textAlign:'left',
fontSize:'12px',
color:'#fca5a5',
fontFamily:'monospace',
wordBreak:'break-word'
}}>
<strong>Diagnostic:</strong> {reason||"WebGPU hardware acceleration unavailable."}
</div>
<div style={{
textAlign:'left',
background:'rgba(30, 41, 59, 0.6)',
borderRadius:'10px',
padding:'16px',
margin:'0 0 24px 0',
fontSize:'12px',
color:'#cbd5e1',
lineHeight:1.6
}}>
<div style={{fontWeight:'600',color:'#38bdf8',marginBottom:'8px'}}>How to enable GPU acceleration:</div>
<div style={{marginBottom:'6px'}}>1. Ensure you are using <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.</div>
<div style={{marginBottom:'6px'}}>2. Open <code>chrome://settings/system</code> (or Edge Settings) and enable <strong>"Use graphics acceleration when available"</strong>.</div>
<div style={{marginBottom:'6px'}}>3. In Chrome, visit <code>chrome://flags/#enable-unsafe-webgpu</code> and set it to <strong>Enabled</strong> if your GPU driver is legacy.</div>
<div>4. Restart your browser and click re-scan below.</div>
</div>
<button
onClick={handleRetry}
disabled={retrying}
style={{
width:'100%',
padding:'12px 20px',
background:retrying?'#475569':'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
color:'#fff',
border:'none',
borderRadius:'8px',
fontWeight:'600',
fontSize:'13px',
cursor:retrying?'not-allowed':'pointer',
boxShadow:'0 4px 14px rgba(239, 68, 68, 0.3)',
transition:'all 0.2s ease'
}}
>
{retrying?'Scanning Hardware Adapter...':'Re-scan Hardware GPU'}
</button>
</div>
</div>
);
}
