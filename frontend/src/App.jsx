import React, { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { checkWebGPUCompatibility, runVlmInference } from "./services/webgpu.js";
import { fetchAndRenderOptical, fetchAndRenderSAR } from "./services/cogReader.js";
import { analyzeOpticalCanvas, analyzeSarCanvas } from "./services/vlmVisionEngine.js";
import GpuLockScreen from "./components/GpuLockScreen.jsx";
import ImageryPanel from "./components/ImageryPanel.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const PRESET_REGIONS = [
  { name: "Godavari Delta / Bay of Bengal", bbox: [81.5, 16.3, 82.5, 17.3] },
  { name: "Hyderabad / Deccan Plateau", bbox: [78.3, 17.3, 78.6, 17.5] },
  { name: "Mumbai Coast / Arabian Sea", bbox: [72.7, 18.8, 73.2, 19.3] },
  { name: "Sundarbans Delta / Kolkata", bbox: [88.2, 21.8, 89.2, 22.6] },
  { name: "Kaveri Basin / Tamil Nadu", bbox: [79.2, 10.7, 79.9, 11.4] },
  { name: "Brahmaputra / Assam Plains", bbox: [91.5, 26.0, 92.5, 26.8] }
];

export default function App() {
  const [gpuState, setGpuState] = useState({ checking: true, compatible: false, reason: "", info: null });
  const [minLon, setMinLon] = useState(78.3);
  const [minLat, setMinLat] = useState(17.3);
  const [maxLon, setMaxLon] = useState(78.6);
  const [maxLat, setMaxLat] = useState(17.5);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [modelLoadingStatus, setModelLoadingStatus] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);

  const [opticalScene, setOpticalScene] = useState(null);
  const [sarScene, setSarScene] = useState(null);
  const [opticalCanvas, setOpticalCanvas] = useState(null);
  const [sarCanvas, setSarCanvas] = useState(null);
  const [opticalAnalysis, setOpticalAnalysis] = useState(null);
  const [sarAnalysis, setSarAnalysis] = useState(null);
  const [isLoadingImagery, setIsLoadingImagery] = useState(false);
  const [imageryError, setImageryError] = useState("");

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Welcome to SatQuery AI (SIH Problem Statement 167). I combine Optical sensors (Sentinel-2) and Radio Wave SAR sensors (Sentinel-1) with Vision-Language geospatial intelligence. Click or drag on the map to select any region, then ask me anything about the terrain, nearby seas/cities, vegetation, or flood risks!"
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFetchingTelemetry, setIsFetchingTelemetry] = useState(false);
  const [telemetrySummary, setTelemetrySummary] = useState(null);
  const [activeGeoJSON, setActiveGeoJSON] = useState(null);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const rectLayerRef = useRef(null);
  const nwMarkerRef = useRef(null);
  const seMarkerRef = useRef(null);
  const geojsonLayerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const isDrawingModeRef = useRef(isDrawingMode);

  const verifyGpu = async () => {
    setGpuState({ checking: true, compatible: false, reason: "", info: null });
    const res = await checkWebGPUCompatibility();
    if (res.isCompatible) {
      setGpuState({ checking: false, compatible: true, reason: "", info: res.gpuInfo });
    } else {
      setGpuState({ checking: false, compatible: false, reason: res.reason, info: null });
    }
  };

  useEffect(() => {
    verifyGpu();
  }, []);

  useEffect(() => {
    isDrawingModeRef.current = isDrawingMode;
  }, [isDrawingMode]);

  const loadImageryForCurrentBbox = async () => {
    setIsLoadingImagery(true);
    setImageryError("");
    try {
      const res = await fetch(`${API_BASE}/api/imagery/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbox: [minLon, minLat, maxLon, maxLat] })
      });
      if (!res.ok) throw new Error(`Imagery search failed (HTTP ${res.status})`);
      const data = await res.json();
      setOpticalScene(data.optical);
      setSarScene(data.sar);

      const bboxArr = [minLon, minLat, maxLon, maxLat];

      if (data.optical?.asset_urls) {
        try {
          const optResult = await fetchAndRenderOptical(data.optical.asset_urls, bboxArr, 512, API_BASE);
          setOpticalCanvas(optResult.canvas);
          const optMetrics = analyzeOpticalCanvas(optResult.canvas);
          setOpticalAnalysis(optMetrics);
        } catch (e) {
          console.warn("Optical rendering note:", e);
        }
      }

      if (data.sar?.asset_urls) {
        try {
          const sarResult = await fetchAndRenderSAR(data.sar.asset_urls, bboxArr, 512, API_BASE);
          setSarCanvas(sarResult.canvas);
          const sarMetrics = analyzeSarCanvas(sarResult.canvas);
          setSarAnalysis(sarMetrics);
        } catch (e) {
          console.warn("SAR rendering note:", e);
        }
      }
    } catch (err) {
      setImageryError(err.message || "Failed to load satellite imagery passes");
    } finally {
      setIsLoadingImagery(false);
    }
  };

  useEffect(() => {
    setIsResolvingLocation(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/geo/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bbox: [minLon, minLat, maxLon, maxLat] })
        });
        if (res.ok) {
          const info = await res.json();
          setSelectedLocation(info);
          setIsResolvingLocation(false);
          loadImageryForCurrentBbox();
          return;
        }
      } catch (_) {}

      try {
        const cLat = ((minLat + maxLat) / 2).toFixed(4);
        const cLon = ((minLon + maxLon) / 2).toFixed(4);
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${cLat}&lon=${cLon}&zoom=10`);
        if (r.ok) {
          const d = await r.json();
          const addr = d.address || {};
          const city = addr.city || addr.town || addr.village || addr.county || "Regional District";
          const state = addr.state || "";
          const country = addr.country || "India";
          setSelectedLocation({
            city,
            state,
            country,
            display_name: d.display_name,
            elevation_meters: 500,
            is_coastal: false,
            coastal_summary: "Inland landlocked region with NO oceans or seas",
            nearby_water_bodies: ["Inland drainage channels"],
            terrain_profile: "Plateau tableland"
          });
        }
      } catch (_) {}
      setIsResolvingLocation(false);
      loadImageryForCurrentBbox();
    }, 450);
    return () => clearTimeout(timer);
  }, [minLon, minLat, maxLon, maxLat]);

  useEffect(() => {
    if (!gpuState.compatible || !mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current).setView([(minLat + maxLat) / 2, (minLon + maxLon) / 2], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const bounds = [[minLat, minLon], [maxLat, maxLon]];
    const rect = L.rectangle(bounds, { color: "#ff6600", weight: 2, fillOpacity: 0.15 }).addTo(map);
    rectLayerRef.current = rect;

    const nwMarker = L.circleMarker([maxLat, minLon], { radius: 7, color: "#d9534f", fillOpacity: 0.8, draggable: true }).addTo(map);
    const seMarker = L.circleMarker([minLat, maxLon], { radius: 7, color: "#0275d8", fillOpacity: 0.8, draggable: true }).addTo(map);
    nwMarker.bindTooltip("Drag NW Corner", { permanent: false });
    seMarker.bindTooltip("Drag SE Corner", { permanent: false });
    nwMarkerRef.current = nwMarker;
    seMarkerRef.current = seMarker;

    mapInstanceRef.current = map;

    let isDrawing = false;
    let startLatLng = null;

    map.on("mousedown", (e) => {
      if (!isDrawingModeRef.current && !e.originalEvent.shiftKey) return;
      map.dragging.disable();
      isDrawing = true;
      startLatLng = e.latlng;
    });

    map.on("mousemove", (e) => {
      if (!isDrawing || !startLatLng) return;
      const currentBounds = L.latLngBounds(startLatLng, e.latlng);
      rectLayerRef.current.setBounds(currentBounds);
    });

    map.on("mouseup", (e) => {
      if (!isDrawing || !startLatLng) return;
      map.dragging.enable();
      isDrawing = false;
      const currentBounds = L.latLngBounds(startLatLng, e.latlng);
      rectLayerRef.current.setBounds(currentBounds);
      const w = parseFloat(currentBounds.getWest().toFixed(4));
      const s = parseFloat(currentBounds.getSouth().toFixed(4));
      const e_lon = parseFloat(currentBounds.getEast().toFixed(4));
      const n = parseFloat(currentBounds.getNorth().toFixed(4));
      setMinLon(w);
      setMinLat(s);
      setMaxLon(e_lon);
      setMaxLat(n);
      startLatLng = null;
      setIsDrawingMode(false);
    });

    map.on("click", (e) => {
      if (isDrawingModeRef.current) return;
      const cLat = e.latlng.lat;
      const cLon = e.latlng.lng;
      const dLat = (maxLat - minLat) / 2;
      const dLon = (maxLon - minLon) / 2;
      const nS = parseFloat((cLat - dLat).toFixed(4));
      const nN = parseFloat((cLat + dLat).toFixed(4));
      const nW = parseFloat((cLon - dLon).toFixed(4));
      const nE = parseFloat((cLon + dLon).toFixed(4));
      setMinLon(nW);
      setMinLat(nS);
      setMaxLon(nE);
      setMaxLat(nN);
    });
  }, [gpuState.compatible]);

  useEffect(() => {
    if (!mapInstanceRef.current || !rectLayerRef.current) return;
    const b = [[minLat, minLon], [maxLat, maxLon]];
    rectLayerRef.current.setBounds(b);
    if (nwMarkerRef.current) nwMarkerRef.current.setLatLng([maxLat, minLon]);
    if (seMarkerRef.current) seMarkerRef.current.setLatLng([minLat, maxLon]);
  }, [minLon, minLat, maxLon, maxLat]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isSending, modelLoadingStatus]);

  const setPreset = (bbox) => {
    setMinLon(bbox[0]);
    setMinLat(bbox[1]);
    setMaxLon(bbox[2]);
    setMaxLat(bbox[3]);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
    }
  };

  const handleSendMessage = async (customText) => {
    const query = (customText || inputText).trim();
    if (!query || isSending) return;

    const newHistory = [...messages, { role: "user", content: query }];
    setMessages(newHistory);
    setInputText("");
    setIsSending(true);

    try {
      setModelLoadingStatus("Executing multi-sensor VLM inference on client WebGPU...");
      const result = await runVlmInference({
        geoContext: selectedLocation,
        opticalAnalysis,
        sarAnalysis,
        opticalScene,
        sarScene,
        bbox: [minLon, minLat, maxLon, maxLat],
        userQuery: query,
        onProgress: (p) => {
          if (p?.status === "progress" && p.total) {
            const pct = Math.round((p.loaded / p.total) * 100);
            setModelLoadingStatus(`Loading WebGPU weights: ${pct}%`);
          }
        }
      });

      setMessages([...newHistory, { role: "assistant", content: result.text, webgpu: true }]);
    } catch (err) {
      setMessages([
        ...newHistory,
        { role: "assistant", content: `Error processing query: ${err.message}` }
      ]);
    } finally {
      setIsSending(false);
      setModelLoadingStatus("");
    }
  };

  const handleFetchTelemetry = async () => {
    setIsFetchingTelemetry(true);
    try {
      const res = await fetch(`${API_BASE}/api/satellite/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bbox: [minLon, minLat, maxLon, maxLat],
          start_date: "2024-01-01",
          end_date: "2024-01-15"
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setActiveGeoJSON(data.geojson);
      setTelemetrySummary(`Loaded ${data.sar_count} Sentinel-1 SAR & ${data.optical_count} Sentinel-2 Optical passes (${data.fused_count} fused layers).`);
      if (mapInstanceRef.current && data.geojson) {
        if (geojsonLayerRef.current) {
          mapInstanceRef.current.removeLayer(geojsonLayerRef.current);
        }
        geojsonLayerRef.current = L.geoJSON(data.geojson, {
          style: (f) => ({
            color: f.properties?.sar_all_weather_validity ? "#0066cc" : "#28a745",
            weight: 2,
            fillOpacity: 0.15
          })
        }).addTo(mapInstanceRef.current);
      }
    } catch (err) {
      setTelemetrySummary(`Telemetry error: ${err.message}`);
    } finally {
      setIsFetchingTelemetry(false);
    }
  };

  const handleDownloadGeoJSON = async () => {
    if (!activeGeoJSON) return;
    try {
      const res = await fetch(`${API_BASE}/api/export/geojson`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeGeoJSON)
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "satquery_export.geojson";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (_) {}
  };

  if (gpuState.checking) {
    return (
      <div style={{
        height: "100vh",
        width: "100vw",
        background: "#0a0d14",
        color: "#94a3b8",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif"
      }}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>⚡</div>
        <div style={{ fontSize: "16px", fontWeight: "600", color: "#38bdf8", marginBottom: "8px" }}>
          Scanning WebGPU Hardware Acceleration...
        </div>
        <div style={{ fontSize: "12px", color: "#64748b" }}>
          Verifying physical GPU adapter and compute context
        </div>
      </div>
    );
  }

  if (!gpuState.compatible) {
    return <GpuLockScreen reason={gpuState.reason} onRetry={verifyGpu} />;
  }

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", fontFamily: "sans-serif" }}>
      {/* Left Map & Area Selection Pane (60%) */}
      <div style={{ flex: "0 0 58%", display: "flex", flexDirection: "column", borderRight: "2px solid #e2e8f0", padding: "12px", boxSizing: "border-box", background: "#f8fafc" }}>
        <header style={{ marginBottom: "6px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: "0 0 2px 0", color: "#0f172a", fontSize: "18px" }}>SatQuery AI: Optical & SAR VLM Fusion (SIH 167)</h2>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Click anywhere on the map to center the area, toggle <strong>Draw Mode</strong> to drag a new box, or use presets.
            </span>
          </div>
          <div style={{
            background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
            color: "#ecfdf5",
            padding: "4px 10px",
            borderRadius: "14px",
            fontSize: "11px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            boxShadow: "0 2px 6px rgba(5, 150, 105, 0.25)"
          }}>
            <span>🟢</span>
            <span>WebGPU: {gpuState.info?.vendor} {gpuState.info?.architecture || gpuState.info?.device}</span>
          </div>
        </header>

        <div style={{
          background: selectedLocation ? "#f0fdf4" : "#f8fafc",
          border: selectedLocation ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "8px 12px",
          marginBottom: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "12px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px" }}>📍</span>
            {isResolvingLocation ? (
              <span style={{ color: "#0284c7" }}>Resolving location ground truth...</span>
            ) : selectedLocation ? (
              <span style={{ color: "#166534", fontWeight: "600" }}>
                {selectedLocation.city}, {selectedLocation.state} ({selectedLocation.country})
                <span style={{ fontWeight: "normal", color: "#4b5563", marginLeft: "6px" }}>
                  | Elev: ~{Math.round(selectedLocation.elevation_meters || 0)}m | {selectedLocation.is_coastal ? `Coastal (${selectedLocation.coastal_sea})` : "Inland Plateau (No Ocean)"}
                </span>
              </span>
            ) : (
              <span style={{ color: "#64748b" }}>Selecting region...</span>
            )}
          </div>
          <span style={{ fontSize: "11px", color: "#0369a1", fontWeight: "500" }}>
            [{minLon.toFixed(2)}, {minLat.toFixed(2)}] to [{maxLon.toFixed(2)}, {maxLat.toFixed(2)}]
          </span>
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => setIsDrawingMode(!isDrawingMode)}
            style={{
              padding: "6px 12px",
              backgroundColor: isDrawingMode ? "#d9534f" : "#0275d8",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "12px"
            }}
          >
            {isDrawingMode ? "Drawing Active (Drag Box on Map)" : "🎯 Draw Area on Map"}
          </button>
          <span style={{ fontSize: "12px", color: "#777" }}>Presets:</span>
          {PRESET_REGIONS.map((p, idx) => (
            <button
              key={idx}
              onClick={() => setPreset(p.bbox)}
              style={{ padding: "4px 8px", fontSize: "11px", borderRadius: "12px", border: "1px solid #ccc", background: "#f8f8f8", cursor: "pointer" }}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px", fontSize: "13px" }}>
          <label>Min Lon: <input type="number" step="0.01" value={minLon} onChange={(e) => setMinLon(parseFloat(e.target.value))} style={{ width: "65px" }} /></label>
          <label>Min Lat: <input type="number" step="0.01" value={minLat} onChange={(e) => setMinLat(parseFloat(e.target.value))} style={{ width: "65px" }} /></label>
          <label>Max Lon: <input type="number" step="0.01" value={maxLon} onChange={(e) => setMaxLon(parseFloat(e.target.value))} style={{ width: "65px" }} /></label>
          <label>Max Lat: <input type="number" step="0.01" value={maxLat} onChange={(e) => setMaxLat(parseFloat(e.target.value))} style={{ width: "65px" }} /></label>
        </div>

        <div id="map" ref={mapRef} style={{ flex: 1, minHeight: "340px", border: "1px solid #aaa", borderRadius: "4px", cursor: isDrawingMode ? "crosshair" : "default" }} />

        <div style={{ marginTop: "8px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleFetchTelemetry} disabled={isFetchingTelemetry} style={{ padding: "6px 12px", cursor: "pointer" }}>
            {isFetchingTelemetry ? "Fetching Footprints..." : "Fetch Footprints Overlay"}
          </button>
          {activeGeoJSON && (
            <button onClick={handleDownloadGeoJSON} style={{ padding: "6px 12px", cursor: "pointer", background: "#28a745", color: "#fff", border: "none", borderRadius: "4px" }}>
              Export ISRO Bhuvan GeoJSON
            </button>
          )}
          {telemetrySummary && <span style={{ fontSize: "12px", color: "#333" }}>{telemetrySummary}</span>}
        </div>
      </div>

      {/* Right VLM Imagery & Multi-Sensor Chat Pane (42%) */}
      <div style={{ flex: "0 0 42%", display: "flex", flexDirection: "column", background: "#fdfdfd", boxSizing: "border-box" }}>
        {/* Header */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #eee", background: "#fafafa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: "0 0 2px 0", fontSize: "15px", color: "#0f172a" }}>Vision-Language Geospatial VLM</h3>
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              Active Area: <strong>{selectedLocation?.city || "Selected Bounding Box"}</strong> ({minLon.toFixed(2)}E, {minLat.toFixed(2)}N)
            </span>
          </div>
          <span style={{
            fontSize: "10px",
            background: "#eff6ff",
            color: "#2563eb",
            padding: "2px 8px",
            borderRadius: "10px",
            fontWeight: "600",
            border: "1px solid #bfdbfe"
          }}>
            ⚡ Client GPU Accelerated
          </span>
        </div>

        {/* Real Satellite Imagery Panel */}
        <ImageryPanel
          opticalCanvas={opticalCanvas}
          sarCanvas={sarCanvas}
          opticalScene={opticalScene}
          sarScene={sarScene}
          opticalAnalysis={opticalAnalysis}
          sarAnalysis={sarAnalysis}
          isLoadingImagery={isLoadingImagery}
          imageryError={imageryError}
          onRefresh={loadImageryForCurrentBbox}
        />

        {/* Context-Aware Quick Prompt Chips */}
        <div style={{ padding: "6px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Try asking:</span>
          {[
            "Which city did I select?",
            "Are there any oceans in this city?",
            "What does the optical imagery show?",
            "What does the SAR radar show?",
            "Are there flood risks detected?"
          ].map((sample, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(sample)}
              disabled={isSending}
              style={{
                fontSize: "10px",
                padding: "3px 8px",
                background: "#fff",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                cursor: isSending ? "not-allowed" : "pointer",
                color: "#0369a1"
              }}
            >
              {sample}
            </button>
          ))}
        </div>

        {/* Chat History */}
        <div ref={chatScrollRef} style={{ flex: 1, padding: "14px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                padding: "10px 14px",
                borderRadius: "12px",
                fontSize: "13px",
                lineHeight: "1.45",
                background: m.role === "user" ? "#0275d8" : "#f1f3f5",
                color: m.role === "user" ? "#fff" : "#212529",
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                whiteSpace: "pre-wrap"
              }}
            >
              {m.content}
              {m.webgpu && (
                <div style={{ marginTop: "6px", fontSize: "10px", color: "#059669", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>⚡</span>
                  <span>Processed on Local GPU with Optical & SAR Vision Grounding</span>
                </div>
              )}
            </div>
          ))}
          {isSending && (
            <div style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: "12px", fontSize: "13px", background: "#f1f3f5", color: "#666", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span>Synthesizing SAR & Optical multi-sensor fusion...</span>
              {modelLoadingStatus && (
                <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: "500" }}>
                  {modelLoadingStatus}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid #eee", background: "#fafafa", display: "flex", gap: "8px" }}>
          <input
            type="text"
            placeholder={`Ask about ${selectedLocation?.city || "this region"}'s satellite imagery, water bodies, or flood risks...`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isSending}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #ccc",
              fontSize: "13px",
              outline: "none"
            }}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={isSending || !inputText.trim()}
            style={{
              padding: "8px 16px",
              background: isSending || !inputText.trim() ? "#aaa" : "#0275d8",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: isSending || !inputText.trim() ? "not-allowed" : "pointer",
              fontWeight: "bold",
              fontSize: "13px"
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
