import React, { useState, useEffect, useRef } from "react";
import L from "leaflet";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const PRESET_REGIONS = [
  { name: "Godavari Delta / Bay of Bengal", bbox: [81.5, 16.3, 82.5, 17.3] },
  { name: "Mumbai Coast / Arabian Sea", bbox: [72.7, 18.8, 73.2, 19.3] },
  { name: "Sundarbans Delta / Kolkata", bbox: [88.2, 21.8, 89.2, 22.6] },
  { name: "Kaveri Basin / Tamil Nadu", bbox: [79.2, 10.7, 79.9, 11.4] },
  { name: "Brahmaputra / Assam Plains", bbox: [91.5, 26.0, 92.5, 26.8] }
];

export default function App() {
  const [minLon, setMinLon] = useState(81.5);
  const [minLat, setMinLat] = useState(16.5);
  const [maxLon, setMaxLon] = useState(82.5);
  const [maxLat, setMaxLat] = useState(17.5);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Welcome to SatQuery AI (SIH Problem Statement 167). I combine Optical sensors (Sentinel-2) and Radio Wave SAR sensors (Sentinel-1) with Vision-Language intelligence. Click or drag on the map to choose any region, then ask me anything about the terrain, nearby seas/cities, vegetation, or flood risks!"
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

  useEffect(() => {
    isDrawingModeRef.current = isDrawingMode;
  }, [isDrawingMode]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current).setView([(minLat + maxLat) / 2, (minLon + maxLon) / 2], 8);
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
      const latSpan = Math.abs(maxLat - minLat) || 0.8;
      const lonSpan = Math.abs(maxLon - minLon) || 0.8;
      const cLat = e.latlng.lat;
      const cLon = e.latlng.lng;
      setMinLon(parseFloat((cLon - lonSpan / 2).toFixed(4)));
      setMaxLon(parseFloat((cLon + lonSpan / 2).toFixed(4)));
      setMinLat(parseFloat((cLat - latSpan / 2).toFixed(4)));
      setMaxLat(parseFloat((cLat + latSpan / 2).toFixed(4)));
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (rectLayerRef.current && mapInstanceRef.current) {
      const bounds = [[minLat, minLon], [maxLat, maxLon]];
      rectLayerRef.current.setBounds(bounds);
      if (nwMarkerRef.current) nwMarkerRef.current.setLatLng([maxLat, minLon]);
      if (seMarkerRef.current) seMarkerRef.current.setLatLng([minLat, maxLon]);
    }
  }, [minLon, minLat, maxLon, maxLat]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

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
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          bbox: [minLon, minLat, maxLon, maxLat],
          chat_history: newHistory.map(m => ({ role: m.role, content: m.content }))
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages([...newHistory, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMessages([
        ...newHistory,
        { role: "assistant", content: `Error processing query: ${err.message}` }
      ]);
    } finally {
      setIsSending(false);
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
    } catch (err) {}
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", fontFamily: "sans-serif" }}>
      <div style={{ flex: "0 0 60%", display: "flex", flexDirection: "column", borderRight: "2px solid #ccc", padding: "12px", boxSizing: "border-box" }}>
        <header style={{ marginBottom: "6px" }}>
          <h2 style={{ margin: "0 0 2px 0" }}>SatQuery AI: Optical & SAR Fusion (SIH 167)</h2>
          <span style={{ fontSize: "12px", color: "#555" }}>
            Click anywhere on the map to center the area, toggle <strong>Draw Mode</strong> to drag a new box, or use presets.
          </span>
        </header>

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

        <div id="map" ref={mapRef} style={{ flex: 1, minHeight: "360px", border: "1px solid #aaa", borderRadius: "4px", cursor: isDrawingMode ? "crosshair" : "default" }} />

        <div style={{ marginTop: "8px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleFetchTelemetry} disabled={isFetchingTelemetry} style={{ padding: "6px 12px", cursor: "pointer" }}>
            {isFetchingTelemetry ? "Fetching Telemetry..." : "Fetch Satellite Footprints"}
          </button>
          <button onClick={handleDownloadGeoJSON} disabled={!activeGeoJSON} style={{ padding: "6px 12px", cursor: activeGeoJSON ? "pointer" : "not-allowed" }}>
            Download Bhuvan GeoJSON
          </button>
          {telemetrySummary && <span style={{ fontSize: "12px", color: "#333" }}>{telemetrySummary}</span>}
        </div>
      </div>

      <div style={{ flex: "0 0 40%", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box", backgroundColor: "#f9f9f9" }}>
        <div style={{ padding: "12px", borderBottom: "1px solid #ddd", backgroundColor: "#fff" }}>
          <h3 style={{ margin: "0 0 4px 0" }}>Vision-Language Assistant (VLM + SAR)</h3>
          <div style={{ fontSize: "12px", color: "#555" }}>
            Selected Bounding Box: <strong>[{minLon.toFixed(2)}, {minLat.toFixed(2)}, {maxLon.toFixed(2)}, {maxLat.toFixed(2)}]</strong>
          </div>
          <div style={{ fontSize: "11px", color: "#007700", marginTop: "2px" }}>
            Active Sensors: Optical (Sentinel-2 MSI) + Radio Wave Radar (Sentinel-1 SAR C-band)
          </div>
        </div>

        <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                backgroundColor: m.role === "user" ? "#0066cc" : "#ffffff",
                color: m.role === "user" ? "#ffffff" : "#111111",
                padding: "10px 14px",
                borderRadius: m.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                fontSize: "14px",
                lineHeight: "1.45"
              }}
            >
              <div style={{ fontSize: "11px", marginBottom: "4px", opacity: 0.8, fontWeight: "bold" }}>
                {m.role === "user" ? "You" : "SatQuery AI (VLM + Telemetry)"}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
            </div>
          ))}
          {isSending && (
            <div style={{ alignSelf: "flex-start", backgroundColor: "#fff", padding: "8px 12px", borderRadius: "14px", fontSize: "13px", color: "#777" }}>
              Querying Sentinel-1 SAR & Sentinel-2 Optical sensors and generating dynamic VLM answer...
            </div>
          )}
        </div>

        <div style={{ padding: "8px 12px", borderTop: "1px solid #eee", backgroundColor: "#fff", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          <button
            onClick={() => handleSendMessage("Which sea or city is close to this point?")}
            disabled={isSending}
            style={{ fontSize: "11px", padding: "4px 8px", cursor: "pointer", borderRadius: "12px", border: "1px solid #ccc", background: "#f0f0f0" }}
          >
            Which sea or city is close?
          </button>
          <button
            onClick={() => handleSendMessage("What is the terrain and vegetation like here based on optical and radar sensors?")}
            disabled={isSending}
            style={{ fontSize: "11px", padding: "4px 8px", cursor: "pointer", borderRadius: "12px", border: "1px solid #ccc", background: "#f0f0f0" }}
          >
            Terrain & vegetation?
          </button>
          <button
            onClick={() => handleSendMessage("Are there flood risks detected using SAR radar backscatter?")}
            disabled={isSending}
            style={{ fontSize: "11px", padding: "4px 8px", cursor: "pointer", borderRadius: "12px", border: "1px solid #ccc", background: "#f0f0f0" }}
          >
            Flood risks via SAR?
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          style={{ display: "flex", padding: "10px 12px", borderTop: "1px solid #ddd", backgroundColor: "#fff", gap: "8px" }}
        >
          <input
            type="text"
            placeholder="Ask anything about the selected area..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSending}
            style={{ flex: 1, padding: "8px 12px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
          />
          <button
            type="submit"
            disabled={isSending || !inputText.trim()}
            style={{ padding: "8px 16px", backgroundColor: "#0066cc", color: "#fff", border: "none", borderRadius: "4px", cursor: isSending ? "not-allowed" : "pointer" }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
