import React, { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { checkWebGPUCompatibility, runVlmInference } from "./services/webgpu.js";
import { fetchAndRenderOptical, fetchAndRenderSAR } from "./services/cogReader.js";
import { analyzeOpticalCanvas, analyzeSarCanvas } from "./services/vlmVisionEngine.js";
import GpuLockScreen from "./components/GpuLockScreen.jsx";
import ImageryPanel from "./components/ImageryPanel.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const PRESET_REGIONS = [
  { name: "Hyderabad", fullName: "Hyderabad / Deccan Plateau", bbox: [78.3, 17.3, 78.6, 17.5] },
  { name: "Bengaluru", fullName: "Bengaluru / Karnataka", bbox: [77.5, 12.8, 77.8, 13.1] },
  { name: "Mumbai", fullName: "Mumbai Coast / Arabian Sea", bbox: [72.7, 18.8, 73.2, 19.3] },
  { name: "Godavari", fullName: "Godavari Delta / Bay of Bengal", bbox: [81.5, 16.3, 82.5, 17.3] },
  { name: "Sundarbans", fullName: "Sundarbans Delta / Kolkata", bbox: [88.2, 21.8, 89.2, 22.6] },
  { name: "Kaveri", fullName: "Kaveri Basin / Tamil Nadu", bbox: [79.2, 10.7, 79.9, 11.4] },
  { name: "Brahmaputra", fullName: "Brahmaputra / Assam Plains", bbox: [91.5, 26.0, 92.5, 26.8] }
];

export default function App() {
  const [gpuState, setGpuState] = useState({ checking: true, compatible: false, reason: "", info: null });
  const [minLon, setMinLon] = useState(78.3);
  const [minLat, setMinLat] = useState(17.3);
  const [maxLon, setMaxLon] = useState(78.6);
  const [maxLat, setMaxLat] = useState(17.5);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [baseMapMode, setBaseMapMode] = useState("satellite");
  const [activeTab, setActiveTab] = useState("canvas");
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
      content: "Observation pipeline initialized. Dual-sensor Sentinel-2 (Optical) and Sentinel-1 (C-Band SAR) fusion active. Drag corner handles or the center ✥ icon on the Spatial Canvas to adjust your Region of Interest (ROI), or select a preset region to begin visual geospatial queries."
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFetchingTelemetry, setIsFetchingTelemetry] = useState(false);
  const [telemetrySummary, setTelemetrySummary] = useState(null);
  const [activeGeoJSON, setActiveGeoJSON] = useState(null);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const labelsLayerRef = useRef(null);
  const rectLayerRef = useRef(null);
  const nwHandleRef = useRef(null);
  const neHandleRef = useRef(null);
  const swHandleRef = useRef(null);
  const seHandleRef = useRef(null);
  const centerHandleRef = useRef(null);
  const geojsonLayerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const isDrawingModeRef = useRef(isDrawingMode);
  const currentBboxRef = useRef({ minLon, minLat, maxLon, maxLat });

  useEffect(() => {
    currentBboxRef.current = { minLon, minLat, maxLon, maxLat };
  }, [minLon, minLat, maxLon, maxLat]);

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

  const updateVisualBbox = (coords) => {
    const { minLon: w, minLat: s, maxLon: e, maxLat: n } = coords;
    const bounds = [[s, w], [n, e]];
    if (rectLayerRef.current) rectLayerRef.current.setBounds(bounds);
    if (nwHandleRef.current) nwHandleRef.current.setLatLng([n, w]);
    if (neHandleRef.current) neHandleRef.current.setLatLng([n, e]);
    if (swHandleRef.current) swHandleRef.current.setLatLng([s, w]);
    if (seHandleRef.current) seHandleRef.current.setLatLng([s, e]);
    if (centerHandleRef.current) centerHandleRef.current.setLatLng([(s + n) / 2, (w + e) / 2]);
  };

  const commitBbox = () => {
    const { minLon: w, minLat: s, maxLon: e, maxLat: n } = currentBboxRef.current;
    setMinLon(parseFloat(w.toFixed(4)));
    setMinLat(parseFloat(s.toFixed(4)));
    setMaxLon(parseFloat(e.toFixed(4)));
    setMaxLat(parseFloat(n.toFixed(4)));
  };

  const switchBaseMap = (mode) => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    if (labelsLayerRef.current) map.removeLayer(labelsLayerRef.current);

    if (mode === "satellite" || mode === "hybrid") {
      tileLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "&copy; Esri, Earthstar Geographics" }
      ).addTo(map);
      if (mode === "hybrid") {
        labelsLayerRef.current = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 19 }
        ).addTo(map);
      }
    } else {
      tileLayerRef.current = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }
      ).addTo(map);
    }
    setBaseMapMode(mode);
  };

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
    const map = L.map(mapRef.current, { zoomControl: false }).setView([(minLat + maxLat) / 2, (minLon + maxLon) / 2], 9);
    L.control.zoom({ position: "topright" }).addTo(map);

    const satTile = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "&copy; Esri, Earthstar Geographics" }
    ).addTo(map);
    tileLayerRef.current = satTile;

    const bounds = [[minLat, minLon], [maxLat, maxLon]];
    const rect = L.rectangle(bounds, {
      color: "#00e5ff",
      weight: 1.8,
      fillColor: "#00e5ff",
      fillOpacity: 0.12,
      dashArray: "4, 4"
    }).addTo(map);
    rectLayerRef.current = rect;

    const createCornerIcon = (cursor) => L.divIcon({
      className: "custom-bbox-handle",
      html: `<div style="
        width: 14px;
        height: 14px;
        background: #00e5ff;
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(0, 229, 255, 0.7);
        cursor: ${cursor};
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const createCenterIcon = () => L.divIcon({
      className: "custom-bbox-center",
      html: `<div style="
        width: 26px;
        height: 26px;
        background: rgba(12, 12, 14, 0.9);
        border: 2px solid #00e5ff;
        border-radius: 50%;
        color: #00e5ff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: bold;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
        cursor: grab;
      ">✥</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const nw = L.marker([maxLat, minLon], { draggable: true, icon: createCornerIcon("nwse-resize"), zIndexOffset: 1000 }).addTo(map);
    const ne = L.marker([maxLat, maxLon], { draggable: true, icon: createCornerIcon("nesw-resize"), zIndexOffset: 1000 }).addTo(map);
    const sw = L.marker([minLat, minLon], { draggable: true, icon: createCornerIcon("nesw-resize"), zIndexOffset: 1000 }).addTo(map);
    const se = L.marker([minLat, maxLon], { draggable: true, icon: createCornerIcon("nwse-resize"), zIndexOffset: 1000 }).addTo(map);
    const center = L.marker([(minLat + maxLat) / 2, (minLon + maxLon) / 2], { draggable: true, icon: createCenterIcon(), zIndexOffset: 999 }).addTo(map);

    nw.bindTooltip("Drag to resize NW", { permanent: false, direction: "top" });
    ne.bindTooltip("Drag to resize NE", { permanent: false, direction: "top" });
    sw.bindTooltip("Drag to resize SW", { permanent: false, direction: "bottom" });
    se.bindTooltip("Drag to resize SE", { permanent: false, direction: "bottom" });
    center.bindTooltip("Drag ✥ to reposition area", { permanent: false, direction: "top" });

    nw.on("drag", (e) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      if (lat > currentBboxRef.current.minLat + 0.01 && lon < currentBboxRef.current.maxLon - 0.01) {
        currentBboxRef.current.maxLat = lat;
        currentBboxRef.current.minLon = lon;
        updateVisualBbox(currentBboxRef.current);
      }
    });
    nw.on("dragend", commitBbox);

    ne.on("drag", (e) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      if (lat > currentBboxRef.current.minLat + 0.01 && lon > currentBboxRef.current.minLon + 0.01) {
        currentBboxRef.current.maxLat = lat;
        currentBboxRef.current.maxLon = lon;
        updateVisualBbox(currentBboxRef.current);
      }
    });
    ne.on("dragend", commitBbox);

    sw.on("drag", (e) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      if (lat < currentBboxRef.current.maxLat - 0.01 && lon < currentBboxRef.current.maxLon - 0.01) {
        currentBboxRef.current.minLat = lat;
        currentBboxRef.current.minLon = lon;
        updateVisualBbox(currentBboxRef.current);
      }
    });
    sw.on("dragend", commitBbox);

    se.on("drag", (e) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      if (lat < currentBboxRef.current.maxLat - 0.01 && lon > currentBboxRef.current.minLon + 0.01) {
        currentBboxRef.current.minLat = lat;
        currentBboxRef.current.maxLon = lon;
        updateVisualBbox(currentBboxRef.current);
      }
    });
    se.on("dragend", commitBbox);

    let centerDragStart = null;
    center.on("dragstart", (e) => {
      centerDragStart = e.latlng;
    });
    center.on("drag", (e) => {
      if (!centerDragStart) return;
      const dLat = e.latlng.lat - centerDragStart.lat;
      const dLon = e.latlng.lng - centerDragStart.lng;
      currentBboxRef.current.minLon += dLon;
      currentBboxRef.current.maxLon += dLon;
      currentBboxRef.current.minLat += dLat;
      currentBboxRef.current.maxLat += dLat;
      centerDragStart = e.latlng;
      updateVisualBbox(currentBboxRef.current);
    });
    center.on("dragend", () => {
      centerDragStart = null;
      commitBbox();
    });

    nwHandleRef.current = nw;
    neHandleRef.current = ne;
    swHandleRef.current = sw;
    seHandleRef.current = se;
    centerHandleRef.current = center;
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
      currentBboxRef.current = { minLon: w, minLat: s, maxLon: e_lon, maxLat: n };
      updateVisualBbox(currentBboxRef.current);
      setMinLon(w);
      setMinLat(s);
      setMaxLon(e_lon);
      setMaxLat(n);
      startLatLng = null;
      setIsDrawingMode(false);
    });
  }, [gpuState.compatible]);

  useEffect(() => {
    if (!mapInstanceRef.current || !rectLayerRef.current) return;
    updateVisualBbox({ minLon, minLat, maxLon, maxLat });
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
      setTelemetrySummary(`Loaded ${data.sar_count} Sentinel-1 SAR & ${data.optical_count} Sentinel-2 passes.`);
      if (mapInstanceRef.current && data.geojson) {
        if (geojsonLayerRef.current) {
          mapInstanceRef.current.removeLayer(geojsonLayerRef.current);
        }
        geojsonLayerRef.current = L.geoJSON(data.geojson, {
          style: (f) => ({
            color: f.properties?.sar_all_weather_validity ? "#00e5ff" : "#10b981",
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
        background: "#09090b",
        color: "#a1a1aa",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif"
      }}>
        <div style={{ fontSize: "28px", marginBottom: "14px" }}>⚡</div>
        <div style={{ fontSize: "15px", fontWeight: "600", color: "#fafafa", marginBottom: "6px" }}>
          Scanning WebGPU Hardware Compute...
        </div>
        <div style={{ fontSize: "12px", color: "#71717a", fontFamily: "'JetBrains Mono', monospace" }}>
          Allocating high-performance discrete GPU context
        </div>
      </div>
    );
  }

  if (!gpuState.compatible) {
    return <GpuLockScreen reason={gpuState.reason} onRetry={verifyGpu} />;
  }

  const isIntel = gpuState.info?.vendor?.toLowerCase().includes("intel") || gpuState.info?.description?.toLowerCase().includes("intel");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", background: "#09090b", overflow: "hidden", color: "#fafafa" }}>
      {/* Top Header - Spatial Minimalism */}
      <header className="anim-header" style={{
        height: "56px",
        width: "100%",
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #27272a",
        background: "#0c0c0e",
        zIndex: 50,
        flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px rgba(16, 185, 129, 0.7)" }} />
          <span style={{ fontWeight: "600", letterSpacing: "-0.02em", fontSize: "15px", color: "#ffffff" }}>SatQuery AI</span>
          <span style={{ fontSize: "11px", color: "#71717a", fontFamily: "'JetBrains Mono', monospace", marginLeft: "4px" }}>
            Earth Observation · SIH 167
          </span>
        </div>

        {/* Center Live Pipeline Indicator */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 12px",
          borderRadius: "9999px",
          background: "#141416",
          border: "1px solid #27272a",
          fontSize: "11px",
          color: "#a1a1aa",
          fontFamily: "'JetBrains Mono', monospace"
        }}>
          <span className="beacon-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
          <span>Live Sensor Pipeline Active</span>
        </div>

        {/* Right GPU Hardware Compute Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 12px",
            borderRadius: "9999px",
            background: isIntel ? "rgba(245, 158, 11, 0.12)" : "rgba(16, 185, 129, 0.12)",
            border: isIntel ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
            fontSize: "11px",
            color: isIntel ? "#fbbf24" : "#6ee7b7",
            fontWeight: "500",
            fontFamily: "'JetBrains Mono', monospace"
          }}>
            <span>{isIntel ? "🟡" : "🟢"}</span>
            <span>WebGPU: {gpuState.info?.vendor} {gpuState.info?.architecture || gpuState.info?.device}</span>
          </div>
          {isIntel && (
            <span style={{ fontSize: "10px", color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" }}>
              (RTX 4050 configured: restart browser to switch)
            </span>
          )}
        </div>
      </header>

      {/* Main Full-Bleed Bento Grid */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Sidebar Workspace Dock */}
        <aside className="anim-sidebar" style={{
          width: "200px",
          borderRight: "1px solid #27272a",
          background: "#0c0c0e",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "16px 12px",
          flexShrink: 0
        }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#71717a", fontFamily: "'JetBrains Mono', monospace", padding: "0 10px", marginBottom: "8px", fontWeight: "600" }}>
              Workspace
            </span>
            <button
              onClick={() => setActiveTab("canvas")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 12px",
                borderRadius: "10px",
                fontSize: "13px",
                border: "none",
                background: activeTab === "canvas" ? "#18181b" : "transparent",
                color: activeTab === "canvas" ? "#fafafa" : "#a1a1aa",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease"
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>crop_free</span>
              <span>Spatial Canvas</span>
            </button>
            <button
              onClick={handleFetchTelemetry}
              disabled={isFetchingTelemetry}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 12px",
                borderRadius: "10px",
                fontSize: "13px",
                border: "none",
                background: "transparent",
                color: "#a1a1aa",
                cursor: isFetchingTelemetry ? "not-allowed" : "pointer",
                textAlign: "left",
                transition: "all 0.15s ease"
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>satellite_alt</span>
              <span>{isFetchingTelemetry ? "Fetching Passes..." : "Footprints Pass"}</span>
            </button>
            {activeGeoJSON && (
              <button
                onClick={handleDownloadGeoJSON}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  border: "none",
                  background: "transparent",
                  color: "#10b981",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease"
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>download</span>
                <span>Export Bhuvan</span>
              </button>
            )}
            <button
              onClick={loadImageryForCurrentBbox}
              disabled={isLoadingImagery}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 12px",
                borderRadius: "10px",
                fontSize: "13px",
                border: "none",
                background: "transparent",
                color: "#a1a1aa",
                cursor: isLoadingImagery ? "not-allowed" : "pointer",
                textAlign: "left",
                transition: "all 0.15s ease"
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>refresh</span>
              <span>Refresh ROI</span>
            </button>
          </nav>

          {/* Bottom Satellite Metadata */}
          <div style={{ paddingTop: "14px", borderTop: "1px solid #1f1f23", display: "flex", flexDirection: "column", gap: "6px", padding: "10px 4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#71717a" }}>
              <span>Constellation</span>
              <span style={{ color: "#d4d4d8", fontFamily: "'JetBrains Mono', monospace" }}>Sentinel-1/2</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#71717a" }}>
              <span>Spatial GSD</span>
              <span style={{ color: "#d4d4d8", fontFamily: "'JetBrains Mono', monospace" }}>10m Optical</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#71717a" }}>
              <span>Radar Band</span>
              <span style={{ color: "#00e5ff", fontFamily: "'JetBrains Mono', monospace" }}>C-Band SAR</span>
            </div>
          </div>
        </aside>

        {/* Center Spatial Map Bento Card */}
        <section className="anim-map" style={{
          flex: "1",
          margin: "12px",
          display: "flex",
          flexDirection: "column",
          borderRadius: "16px",
          border: "1px solid #27272a",
          background: "#141416",
          position: "relative",
          overflow: "hidden"
        }}>
          {/* Top Floating Controls inside map */}
          <div style={{
            position: "absolute",
            top: "14px",
            left: "14px",
            right: "14px",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pointerEvents: "none"
          }}>
            {/* Basemap Mode Switcher Pill */}
            <div style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(12, 12, 14, 0.9)",
              border: "1px solid #27272a",
              borderRadius: "9999px",
              padding: "3px",
              pointerEvents: "auto",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)"
            }}>
              <button
                onClick={() => switchBaseMap("satellite")}
                style={{
                  padding: "4px 12px",
                  fontSize: "11px",
                  borderRadius: "9999px",
                  border: "none",
                  background: baseMapMode === "satellite" ? "#27272a" : "transparent",
                  color: baseMapMode === "satellite" ? "#ffffff" : "#a1a1aa",
                  cursor: "pointer",
                  fontWeight: baseMapMode === "satellite" ? "600" : "400",
                  transition: "all 0.15s ease"
                }}
              >
                Satellite
              </button>
              <button
                onClick={() => switchBaseMap("hybrid")}
                style={{
                  padding: "4px 12px",
                  fontSize: "11px",
                  borderRadius: "9999px",
                  border: "none",
                  background: baseMapMode === "hybrid" ? "#27272a" : "transparent",
                  color: baseMapMode === "hybrid" ? "#ffffff" : "#a1a1aa",
                  cursor: "pointer",
                  fontWeight: baseMapMode === "hybrid" ? "600" : "400",
                  transition: "all 0.15s ease"
                }}
              >
                Hybrid
              </button>
              <button
                onClick={() => switchBaseMap("streets")}
                style={{
                  padding: "4px 12px",
                  fontSize: "11px",
                  borderRadius: "9999px",
                  border: "none",
                  background: baseMapMode === "streets" ? "#27272a" : "transparent",
                  color: baseMapMode === "streets" ? "#ffffff" : "#a1a1aa",
                  cursor: "pointer",
                  fontWeight: baseMapMode === "streets" ? "600" : "400",
                  transition: "all 0.15s ease"
                }}
              >
                Streets
              </button>
            </div>

            {/* Adjust ROI / Draw Area Button */}
            <button
              onClick={() => setIsDrawingMode(!isDrawingMode)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "9999px",
                background: isDrawingMode ? "#dc2626" : "rgba(12, 12, 14, 0.9)",
                border: isDrawingMode ? "1px solid #ef4444" : "1px solid #27272a",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: "500",
                cursor: "pointer",
                pointerEvents: "auto",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
                transition: "all 0.15s ease"
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>crop_free</span>
              <span>{isDrawingMode ? "Drawing Active (Drag Box)" : "Adjust ROI"}</span>
            </button>
          </div>

          {/* Leaflet Map Div */}
          <div id="map" ref={mapRef} style={{ width: "100%", height: "100%", cursor: isDrawingMode ? "crosshair" : "default" }} />

          {/* Bottom Floating Presets Bar */}
          <div style={{
            position: "absolute",
            bottom: "14px",
            left: "14px",
            right: "14px",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pointerEvents: "none"
          }}>
            <div style={{ display: "flex", gap: "6px", pointerEvents: "auto", flexWrap: "wrap" }}>
              {PRESET_REGIONS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setPreset(p.bbox)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "9999px",
                    fontSize: "11px",
                    fontWeight: "500",
                    background: "rgba(12, 12, 14, 0.9)",
                    border: "1px solid #27272a",
                    color: "#d4d4d8",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
                    transition: "all 0.15s ease"
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "#27272a"; e.currentTarget.style.color = "#ffffff"; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "rgba(12, 12, 14, 0.9)"; e.currentTarget.style.color = "#d4d4d8"; }}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div style={{
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "#a1a1aa",
              background: "rgba(12, 12, 14, 0.9)",
              padding: "4px 10px",
              borderRadius: "9999px",
              border: "1px solid #27272a",
              pointerEvents: "auto"
            }}>
              Updated today
            </div>
          </div>

          {/* Coordinate HUD Strip over map top-left */}
          <div style={{
            position: "absolute",
            top: "62px",
            left: "14px",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(12, 12, 14, 0.9)",
            border: "1px solid #27272a",
            borderRadius: "8px",
            padding: "5px 10px",
            fontSize: "11px",
            fontFamily: "'JetBrains Mono', monospace",
            color: "#a1a1aa",
            pointerEvents: "auto"
          }}>
            <span style={{ color: "#00e5ff", fontWeight: "600" }}>ROI:</span>
            <span>[{minLon.toFixed(2)}, {minLat.toFixed(2)}] to [{maxLon.toFixed(2)}, {maxLat.toFixed(2)}]</span>
            <span style={{ color: "#71717a" }}>|</span>
            <span style={{ color: "#10b981" }}>{selectedLocation?.city || "Selected Area"}</span>
            <span style={{ color: "#71717a" }}>|</span>
            <span>Elev: ~{Math.round(selectedLocation?.elevation_meters || 0)}m</span>
          </div>
        </section>

        {/* Right Panel Multi-Sensor AI Stack (42%) */}
        <section style={{
          width: "440px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "12px 12px 12px 0",
          overflow: "hidden",
          flexShrink: 0
        }}>
          {/* Card 1: Fused Imagery Preview Bento */}
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

          {/* Card 2: SatQuery AI Assistant & Conversational Terminal */}
          <div className="anim-assistant" style={{
            flex: 1,
            borderRadius: "16px",
            border: "1px solid #27272a",
            background: "#141416",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "12px",
            overflow: "hidden"
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "10px", borderBottom: "1px solid #27272a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "#10b981" }}>auto_awesome</span>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#ffffff" }}>SatQuery Assistant</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "2px", height: "14px", padding: "2px 6px", background: "#18181b", borderRadius: "4px" }}>
                  <div className="stream-bar-1" style={{ width: "2px", height: "8px", background: "#10b981", borderRadius: "9999px" }} />
                  <div className="stream-bar-2" style={{ width: "2px", height: "11px", background: "#10b981", borderRadius: "9999px" }} />
                  <div className="stream-bar-3" style={{ width: "2px", height: "6px", background: "#10b981", borderRadius: "9999px" }} />
                </div>
                <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#a1a1aa" }}>Ready</span>
              </div>
            </div>

            {/* Conversation Feed */}
            <div ref={chatScrollRef} style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              paddingRight: "4px",
              overscrollBehavior: "contain"
            }}>
              {messages.map((m, idx) => (
                <div key={idx} style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "92%",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px"
                }}>
                  {m.role === "user" ? (
                    <div style={{
                      background: "#27272a",
                      color: "#fafafa",
                      padding: "8px 14px",
                      borderRadius: "14px",
                      borderTopRightRadius: "3px",
                      fontSize: "13px",
                      lineHeight: "1.45"
                    }}>
                      {m.content}
                    </div>
                  ) : (
                    <div style={{
                      background: "#0c0c0e",
                      border: "1px solid #27272a",
                      borderRadius: "12px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px"
                    }}>
                      <div style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#10b981", fontWeight: "600" }}>
                        SatQuery AI
                      </div>
                      <p style={{ fontSize: "13px", lineHeight: "1.5", color: "#e4e4e7", whiteSpace: "pre-wrap" }}>
                        {m.content}
                      </p>
                      {m.webgpu && (
                        <div style={{ marginTop: "6px", fontSize: "10px", color: "#10b981", display: "flex", alignItems: "center", gap: "4px", fontFamily: "'JetBrains Mono', monospace" }}>
                          <span>⚡</span>
                          <span>Local GPU Vision Grounding</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div style={{
                  alignSelf: "flex-start",
                  background: "#0c0c0e",
                  border: "1px solid #27272a",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  fontSize: "12px",
                  color: "#a1a1aa",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="beacon-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00e5ff", display: "inline-block" }} />
                    <span>Synthesizing SAR &amp; Optical multi-sensor fusion...</span>
                  </div>
                  {modelLoadingStatus && (
                    <span style={{ fontSize: "11px", color: "#00e5ff", fontFamily: "'JetBrains Mono', monospace" }}>
                      {modelLoadingStatus}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Quick Action Prompt Pills */}
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
              {[
                "Which city did I select?",
                "Are there any oceans in this city?",
                "Surface Water & Flood Risks",
                "Vegetation & Crops",
                "What does SAR radar show?"
              ].map((sample, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(sample)}
                  disabled={isSending}
                  style={{
                    fontSize: "11px",
                    padding: "4px 10px",
                    borderRadius: "9999px",
                    background: "#18181b",
                    border: "1px solid #27272a",
                    color: "#a1a1aa",
                    cursor: isSending ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease"
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.borderColor = "#3f3f46"; }}
                  onMouseOut={(e) => { e.currentTarget.style.color = "#a1a1aa"; e.currentTarget.style.borderColor = "#27272a"; }}
                >
                  {sample}
                </button>
              ))}
            </div>

            {/* Chat Input Bar */}
            <div style={{ display: "flex", gap: "8px", position: "relative" }}>
              <input
                type="text"
                placeholder={`Ask about ${selectedLocation?.city || "this region"}'s terrain, imagery, or water bodies...`}
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
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #27272a",
                  background: "#0c0c0e",
                  color: "#fafafa",
                  fontSize: "13px",
                  outline: "none",
                  fontFamily: "'Inter', sans-serif"
                }}
                onFocus={(e) => { e.target.style.borderColor = "#3f3f46"; }}
                onBlur={(e) => { e.target.style.borderColor = "#27272a"; }}
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isSending || !inputText.trim()}
                style={{
                  padding: "0 18px",
                  borderRadius: "10px",
                  border: "none",
                  background: isSending || !inputText.trim() ? "#27272a" : "#b5ffe1",
                  color: isSending || !inputText.trim() ? "#71717a" : "#003829",
                  fontWeight: "600",
                  fontSize: "13px",
                  cursor: isSending || !inputText.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                Ask
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
