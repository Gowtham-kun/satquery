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
  const [activeTab, setActiveTab] = useState('both');
  const [previewModal, setPreviewModal] = useState(null);

  const optDataUrl = opticalCanvas ? opticalCanvas.toDataURL() : null;
  const sarDataUrl = sarCanvas ? sarCanvas.toDataURL() : null;

  const floodColor = sarAnalysis?.floodRisk === 'HIGH' ? '#ef4444' : sarAnalysis?.floodRisk === 'MODERATE' ? '#f59e0b' : '#10b981';

  return (
    <div style={{
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      padding: '10px 14px',
      fontSize: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px' }}>🛰️</span>
          <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '13px' }}>Fused Satellite Imagery</span>
          {isLoadingImagery && (
            <span style={{ fontSize: '11px', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="spinner" style={{ display: 'inline-block', width: '8px', height: '8px', border: '2px solid #0284c7', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Reading COG Pyramids...
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={onRefresh}
            disabled={isLoadingImagery}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              cursor: isLoadingImagery ? 'not-allowed' : 'pointer',
              color: '#334155'
            }}
          >
            ↻ Refresh Passes
          </button>
        </div>
      </div>

      {imageryError && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          padding: '6px 10px',
          color: '#b91c1c',
          fontSize: '11px',
          marginBottom: '8px'
        }}>
          {imageryError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {/* Optical Sensor Box */}
        <div style={{
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          overflow: 'hidden',
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '4px 8px',
            background: '#f1f5f9',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: '600', color: '#047857', fontSize: '11px' }}>
              🟢 Optical (Sentinel-2 L2A)
            </span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>
              {opticalScene?.cloud_cover !== undefined ? `${opticalScene.cloud_cover.toFixed(1)}% Cloud` : 'B04-B03-B02'}
            </span>
          </div>

          <div
            onClick={() => optDataUrl && setPreviewModal({ url: optDataUrl, title: 'Sentinel-2 Optical (10m True Color RGB)' })}
            style={{
              height: '115px',
              position: 'relative',
              background: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: optDataUrl ? 'pointer' : 'default',
              overflow: 'hidden'
            }}
          >
            {optDataUrl ? (
              <img
                src={optDataUrl}
                alt="Sentinel-2 Optical"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : isLoadingImagery ? (
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>Streaming Optical Band Pixels...</span>
            ) : (
              <span style={{ color: '#64748b', fontSize: '11px' }}>No Optical Scene Available</span>
            )}
          </div>

          <div style={{ padding: '6px 8px', fontSize: '10px', color: '#475569', display: 'flex', justifyContent: 'space-between', background: '#fff' }}>
            <span>Veg: <strong>{opticalAnalysis?.vegPct ?? '--'}%</strong></span>
            <span>Water: <strong>{opticalAnalysis?.waterPct ?? '--'}%</strong></span>
            <span>Built: <strong>{opticalAnalysis?.urbanPct ?? '--'}%</strong></span>
          </div>
        </div>

        {/* SAR Sensor Box */}
        <div style={{
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          overflow: 'hidden',
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '4px 8px',
            background: '#f1f5f9',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: '600', color: '#0284c7', fontSize: '11px' }}>
              🔵 SAR Radar (Sentinel-1 GRD)
            </span>
            <span style={{
              fontSize: '9px',
              background: `${floodColor}20`,
              color: floodColor,
              padding: '1px 5px',
              borderRadius: '6px',
              fontWeight: '700'
            }}>
              Flood: {sarAnalysis?.floodRisk || 'N/A'}
            </span>
          </div>

          <div
            onClick={() => sarDataUrl && setPreviewModal({ url: sarDataUrl, title: 'Sentinel-1 C-Band SAR False-Color Radar (VV/VH)' })}
            style={{
              height: '115px',
              position: 'relative',
              background: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: sarDataUrl ? 'pointer' : 'default',
              overflow: 'hidden'
            }}
          >
            {sarDataUrl ? (
              <img
                src={sarDataUrl}
                alt="Sentinel-1 SAR"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : isLoadingImagery ? (
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>Streaming Radar Backscatter...</span>
            ) : (
              <span style={{ color: '#64748b', fontSize: '11px' }}>No SAR Scene Available</span>
            )}
          </div>

          <div style={{ padding: '6px 8px', fontSize: '10px', color: '#475569', display: 'flex', justifyContent: 'space-between', background: '#fff' }}>
            <span>Radar: <strong>~{sarAnalysis?.estimatedMeanDb ?? '--'} dB</strong></span>
            <span>Specular: <strong>{sarAnalysis?.specularPct ?? '--'}%</strong></span>
            <span>Rough: <strong>{sarAnalysis?.urbanRoughPct ?? '--'}%</strong></span>
          </div>
        </div>
      </div>

      {previewModal && (
        <div
          onClick={() => setPreviewModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              borderRadius: '12px',
              overflow: 'hidden',
              maxWidth: '650px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
            }}
          >
            <div style={{
              padding: '10px 16px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#fff'
            }}>
              <span style={{ fontWeight: '600', fontSize: '13px' }}>{previewModal.title}</span>
              <button
                onClick={() => setPreviewModal(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
              <img
                src={previewModal.url}
                alt="Enlarged satellite inspection"
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px', border: '1px solid #334155' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
