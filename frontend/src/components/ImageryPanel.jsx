import React, { useState } from 'react';

export default function ImageryPanel({
  opticalCanvas,
  sarCanvas,
  opticalScene,
  sarScene,
  opticalAnalysis,
  sarAnalysis,
  isLoadingImagery,
  imageryError,
  onRefresh
}) {
  const [previewModal, setPreviewModal] = useState(null);

  const optDataUrl = opticalCanvas ? opticalCanvas.toDataURL() : null;
  const sarDataUrl = sarCanvas ? sarCanvas.toDataURL() : null;

  const vegPct = opticalAnalysis?.vegPct ?? 34;
  const waterPct = opticalAnalysis?.waterPct ?? 8;
  const urbanPct = opticalAnalysis?.urbanPct ?? 52;

  const floodColor = sarAnalysis?.floodRisk === 'HIGH' ? '#ef4444' : sarAnalysis?.floodRisk === 'MODERATE' ? '#f59e0b' : '#10b981';

  return (
    <div className="anim-sensory" style={{
      background: '#141416',
      border: '1px solid #27272a',
      borderRadius: '16px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace" }}>
          Sensory Analysis
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '500' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
            Optical &amp; Radar Fused
          </span>
          <button
            onClick={onRefresh}
            disabled={isLoadingImagery}
            style={{
              padding: '3px 8px',
              fontSize: '10px',
              borderRadius: '9999px',
              border: '1px solid #27272a',
              background: '#18181b',
              color: '#d4d4d8',
              cursor: isLoadingImagery ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
            title="Refresh satellite passes for current ROI"
          >
            <span style={{ transform: isLoadingImagery ? 'rotate(180deg)' : 'none', transition: 'transform 0.5s ease', display: 'inline-block' }}>↻</span>
            <span>{isLoadingImagery ? 'Streaming...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {imageryError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '8px 12px',
          color: '#fca5a5',
          fontSize: '11px'
        }}>
          {imageryError}
        </div>
      )}

      {/* Side-by-Side Dual Sensor Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {/* Optical Sentinel-2 Tile */}
        <div
          onClick={() => optDataUrl && setPreviewModal({ url: optDataUrl, title: 'Sentinel-2 MSI Level-2A (10m True Color RGB)' })}
          style={{
            position: 'relative',
            borderRadius: '12px',
            overflow: 'hidden',
            height: '115px',
            background: '#0c0c0e',
            border: '1px solid #27272a',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px',
            cursor: optDataUrl ? 'pointer' : 'default',
            transition: 'border-color 0.15s ease'
          }}
        >
          {optDataUrl ? (
            <img
              src={optDataUrl}
              alt="Sentinel-2 Optical"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontSize: '11px' }}>
              {isLoadingImagery ? 'Streaming Optical Bands...' : 'Awaiting Sentinel-2 Pass'}
            </div>
          )}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '9999px', background: 'rgba(12, 12, 14, 0.85)', color: '#fafafa', fontWeight: '500' }}>
              True Color
            </span>
          </div>
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#e4e4e7', fontFamily: "'JetBrains Mono', monospace", background: 'rgba(12, 12, 14, 0.85)', padding: '2px 7px', borderRadius: '4px' }}>
            <span>{opticalScene?.cloud_cover !== undefined ? `${opticalScene.cloud_cover.toFixed(1)}% Cloud` : 'Clear Sky'}</span>
            <span style={{ color: '#10b981' }}>Sentinel-2</span>
          </div>
        </div>

        {/* SAR Sentinel-1 Tile */}
        <div
          onClick={() => sarDataUrl && setPreviewModal({ url: sarDataUrl, title: 'Sentinel-1 C-Band SAR False-Color Radar (VV/VH Backscatter)' })}
          style={{
            position: 'relative',
            borderRadius: '12px',
            overflow: 'hidden',
            height: '115px',
            background: '#0c0c0e',
            border: '1px solid #27272a',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px',
            cursor: sarDataUrl ? 'pointer' : 'default',
            transition: 'border-color 0.15s ease'
          }}
        >
          {sarDataUrl ? (
            <img
              src={sarDataUrl}
              alt="Sentinel-1 SAR Radar"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontSize: '11px' }}>
              {isLoadingImagery ? 'Streaming Radar Data...' : 'Awaiting Sentinel-1 Pass'}
            </div>
          )}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '9999px', background: 'rgba(12, 12, 14, 0.85)', color: '#00e5ff', fontWeight: '500' }}>
              Synthetic Radar
            </span>
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(12, 12, 14, 0.85)', color: floodColor, fontWeight: '700' }}>
              Flood: {sarAnalysis?.floodRisk || 'LOW'}
            </span>
          </div>
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#e4e4e7', fontFamily: "'JetBrains Mono', monospace", background: 'rgba(12, 12, 14, 0.85)', padding: '2px 7px', borderRadius: '4px' }}>
            <span>~{sarAnalysis?.estimatedMeanDb ?? -15} dB</span>
            <span style={{ color: '#00e5ff' }}>Sentinel-1</span>
          </div>
        </div>
      </div>

      {/* Three-Pillar Land Cover Distribution Meter */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace" }}>
          <span>Urban {urbanPct}%</span>
          <span>Vegetation {vegPct}%</span>
          <span>Water {waterPct}%</span>
        </div>
        <div style={{ width: '100%', height: '6px', borderRadius: '9999px', background: '#27272a', display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: `${urbanPct}%`, background: '#71717a', height: '100%', transition: 'width 0.4s var(--ease-smooth)' }} />
          <div style={{ width: `${vegPct}%`, background: '#10b981', height: '100%', transition: 'width 0.4s var(--ease-smooth)' }} />
          <div style={{ width: `${waterPct}%`, background: '#00e5ff', height: '100%', transition: 'width 0.4s var(--ease-smooth)' }} />
        </div>
      </div>

      {/* Enlarged Inspection Modal */}
      {previewModal && (
        <div
          onClick={() => setPreviewModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(0, 0, 0, 0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#141416',
              border: '1px solid #27272a',
              borderRadius: '16px',
              overflow: 'hidden',
              maxWidth: '680px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }}
          >
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#fafafa', fontFamily: "'JetBrains Mono', monospace" }}>
                {previewModal.title}
              </span>
              <button
                onClick={() => setPreviewModal(null)}
                style={{ background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'center', background: '#09090b' }}>
              <img
                src={previewModal.url}
                alt="Enlarged satellite inspection"
                style={{ maxWidth: '100%', maxHeight: '68vh', borderRadius: '8px', border: '1px solid #27272a' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
