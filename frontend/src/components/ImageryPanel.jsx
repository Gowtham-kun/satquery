import React, { useState } from 'react';

export default function ImageryPanel({
  hasBbox = true,
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

  const vegPct = opticalAnalysis?.vegPct ?? null;
  const waterPct = opticalAnalysis?.waterPct ?? null;
  const urbanPct = opticalAnalysis?.urbanPct ?? null;

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
          {hasBbox ? (
            <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '500' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
              Optical &amp; Radar Fused
            </span>
          ) : (
            <span style={{ fontSize: '11px', color: '#71717a', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '500', fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#52525b', display: 'inline-block' }} />
              Awaiting ROI Selection
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={!hasBbox || isLoadingImagery}
            style={{
              padding: '3px 8px',
              fontSize: '10px',
              borderRadius: '9999px',
              border: '1px solid #27272a',
              background: '#18181b',
              color: !hasBbox ? '#52525b' : '#d4d4d8',
              cursor: !hasBbox || isLoadingImagery ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
            title={hasBbox ? "Refresh satellite passes for current ROI" : "Select an ROI first"}
          >
            <span style={{ transform: isLoadingImagery ? 'rotate(180deg)' : 'none', transition: 'transform 0.5s ease', display: 'inline-block' }}>↻</span>
            <span>{isLoadingImagery ? 'Streaming...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {imageryError && (
        <div style={{
          background: '#1c1314',
          border: '1px solid #3f2020',
          borderLeft: '3px solid #ef4444',
          borderRadius: '8px',
          padding: '8px 12px',
          color: '#fca5a5',
          fontSize: '11px',
          fontFamily: "'JetBrains Mono', monospace"
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
            height: '130px',
            background: '#0c0c0e',
            border: '1px solid #27272a',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px',
            cursor: optDataUrl ? 'pointer' : 'default',
            transition: 'border-color 0.15s ease'
          }}
          onMouseOver={(e) => {
            if (optDataUrl) e.currentTarget.style.borderColor = '#3f3f46';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = '#27272a';
          }}
        >
          {optDataUrl ? (
            <img
              src={optDataUrl}
              alt="Sentinel-2 Optical"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontSize: '11px', padding: '12px', textAlign: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#52525b' }}>satellite_alt</span>
              <span>{isLoadingImagery ? 'Streaming Optical Bands...' : hasBbox ? 'Awaiting Sentinel-2 Pass' : 'Select area on map'}</span>
            </div>
          )}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '9999px', background: 'rgba(12, 12, 14, 0.9)', color: '#fafafa', fontWeight: '500', border: '1px solid #27272a' }}>
              True Color
            </span>
          </div>
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#e4e4e7', fontFamily: "'JetBrains Mono', monospace", background: 'rgba(12, 12, 14, 0.9)', padding: '2px 7px', borderRadius: '4px', border: '1px solid #27272a' }}>
            <span>{opticalScene?.cloud_cover !== undefined ? `${opticalScene.cloud_cover.toFixed(1)}% Cloud` : hasBbox ? 'Clear Sky' : 'Standby'}</span>
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
            height: '130px',
            background: '#0c0c0e',
            border: '1px solid #27272a',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px',
            cursor: sarDataUrl ? 'pointer' : 'default',
            transition: 'border-color 0.15s ease'
          }}
          onMouseOver={(e) => {
            if (sarDataUrl) e.currentTarget.style.borderColor = '#3f3f46';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = '#27272a';
          }}
        >
          {sarDataUrl ? (
            <img
              src={sarDataUrl}
              alt="Sentinel-1 SAR Radar"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontSize: '11px', padding: '12px', textAlign: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#52525b' }}>radar</span>
              <span>{isLoadingImagery ? 'Streaming Radar Data...' : hasBbox ? 'Awaiting Sentinel-1 Pass' : 'Select area on map'}</span>
            </div>
          )}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '9999px', background: 'rgba(12, 12, 14, 0.9)', color: '#00e5ff', fontWeight: '500', border: '1px solid #27272a' }}>
              Synthetic Radar
            </span>
            {hasBbox && sarAnalysis && (
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(12, 12, 14, 0.9)', color: floodColor, fontWeight: '700', border: '1px solid #27272a' }}>
                Flood: {sarAnalysis?.floodRisk || 'LOW'}
              </span>
            )}
          </div>
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#e4e4e7', fontFamily: "'JetBrains Mono', monospace", background: 'rgba(12, 12, 14, 0.9)', padding: '2px 7px', borderRadius: '4px', border: '1px solid #27272a' }}>
            <span>{hasBbox && sarAnalysis?.estimatedMeanDb !== undefined ? `~${sarAnalysis.estimatedMeanDb} dB` : 'Standby'}</span>
            <span style={{ color: '#00e5ff' }}>Sentinel-1</span>
          </div>
        </div>
      </div>

      {/* Three-Pillar Land Cover Distribution Meter */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace" }}>
          <span>Urban {urbanPct !== null ? `${urbanPct}%` : '--'}</span>
          <span>Vegetation {vegPct !== null ? `${vegPct}%` : '--'}</span>
          <span>Water {waterPct !== null ? `${waterPct}%` : '--'}</span>
        </div>
        <div style={{ width: '100%', height: '6px', borderRadius: '9999px', background: '#27272a', display: 'flex', overflow: 'hidden' }}>
          {urbanPct !== null ? (
            <>
              <div style={{ width: `${urbanPct}%`, background: '#71717a', height: '100%', transition: 'width 0.4s var(--ease-smooth)' }} />
              <div style={{ width: `${vegPct}%`, background: '#10b981', height: '100%', transition: 'width 0.4s var(--ease-smooth)' }} />
              <div style={{ width: `${waterPct}%`, background: '#00e5ff', height: '100%', transition: 'width 0.4s var(--ease-smooth)' }} />
            </>
          ) : (
            <div style={{ width: '100%', background: '#18181b', height: '100%' }} />
          )}
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
            background: 'rgba(9, 9, 11, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0c0c0e',
              border: '1px solid #27272a',
              borderRadius: '16px',
              overflow: 'hidden',
              maxWidth: '680px',
              width: '100%'
            }}
          >
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#141416'
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
