import React, { useState } from 'react';

export default function GpuLockScreen({ reason, onRetry }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 999999,
      background: '#09090b',
      color: '#fafafa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '24px'
    }}>
      <div style={{
        maxWidth: '540px',
        width: '100%',
        background: '#0c0c0e',
        border: '1px solid #27272a',
        borderRadius: '16px',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Header Icon + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: '#18181b',
            border: '1px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            color: '#ef4444',
            flexShrink: 0
          }}>
            !
          </div>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '600',
              letterSpacing: '-0.02em',
              color: '#ffffff'
            }}>
              Hardware GPU Acceleration Required
            </h1>
            <p style={{
              margin: '4px 0 0 0',
              fontSize: '12px',
              color: '#71717a',
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              WebGPU · Direct Hardware Compute Gate
            </p>
          </div>
        </div>

        {/* Description */}
        <p style={{
          margin: 0,
          fontSize: '13px',
          color: '#a1a1aa',
          lineHeight: 1.6
        }}>
          SatQuery AI performs real-time multi-sensor visual-language inference and Synthetic Aperture Radar (SAR) backscatter analysis locally on your GPU via WebGPU. Access is suspended because a physical hardware accelerator could not be allocated.
        </p>

        {/* Diagnostics Inset Box */}
        <div style={{
          background: '#141416',
          border: '1px solid #27272a',
          borderLeft: '3px solid #ef4444',
          borderRadius: '8px',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ef4444', fontWeight: '600', fontFamily: "'JetBrains Mono', monospace" }}>
            Hardware Diagnostics
          </span>
          <span style={{ fontSize: '12px', color: '#e4e4e7', fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-word', lineHeight: 1.5 }}>
            {reason || 'WebGPU hardware adapter could not be initialized.'}
          </span>
        </div>

        {/* Resolution Steps Box */}
        <div style={{
          background: '#141416',
          border: '1px solid #27272a',
          borderRadius: '8px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          fontSize: '12px',
          color: '#a1a1aa',
          lineHeight: 1.5
        }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#ffffff', letterSpacing: '-0.01em' }}>
            Recommended Resolution:
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ color: '#00e5ff', fontFamily: "'JetBrains Mono', monospace" }}>01</span>
            <span>Use Google Chrome or Microsoft Edge with hardware acceleration active.</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ color: '#00e5ff', fontFamily: "'JetBrains Mono', monospace" }}>02</span>
            <span>Navigate to <code>chrome://settings/system</code> and toggle on <strong>"Use graphics acceleration when available"</strong>.</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ color: '#00e5ff', fontFamily: "'JetBrains Mono', monospace" }}>03</span>
            <span>If running dual GPUs (NVIDIA RTX + Intel iGPU), ensure browser is set to High Performance GPU in Windows Graphics Settings.</span>
          </div>
        </div>

        {/* Retry Button */}
        <button
          onClick={handleRetry}
          disabled={retrying}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: retrying ? '#18181b' : '#ef4444',
            color: retrying ? '#71717a' : '#ffffff',
            border: retrying ? '1px solid #27272a' : '1px solid #ef4444',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '13px',
            cursor: retrying ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseOver={(e) => {
            if (!retrying) e.currentTarget.style.background = '#dc2626';
          }}
          onMouseOut={(e) => {
            if (!retrying) e.currentTarget.style.background = '#ef4444';
          }}
        >
          {retrying ? 'Scanning Hardware Compute Adapters...' : 'Re-scan Hardware GPU'}
        </button>
      </div>
    </div>
  );
}
