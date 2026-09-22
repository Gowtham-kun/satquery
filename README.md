# SatQuery AI (SIH Problem Statement 167)

Synthetic Aperture Radar (SAR) and Optical Satellite Imagery Fusion with an AI Vision-Language Assistant.

SatQuery AI combines all-weather microwave radio waves (Sentinel-1 C-band SAR) with multi-spectral optical reflectance (Sentinel-2 MSI) and vision-language intelligence. It features an interactive map interface, automated landmark scraping via Playwright, and a real-time conversational AI assistant.

---

## Key Features

- **Live STAC Integration**: Queries Copernicus Data Space Ecosystem and Planetary Computer STAC for Sentinel-1 GRD and Sentinel-2 L2A passes.
- **SAR & Optical Fusion**: Computes spatial overlap, temporal alignment, and multi-sensor coverage metrics (penetrating clouds to detect water/floods via radar specular reflection).
- **ISRO Bhuvan GeoJSON Compliance**: Exports OGC FeatureCollections (RFC 7946, EPSG:4326) with metadata formatted for ISRO Bhuvan vector ingestion.
- **Automated Geo-Resolver**: Playwright headless Chromium service reverse-geocoding coordinates to extract nearby seas, river basins, administrative districts, elevation, and terrain profiles.
- **Vision-Language Assistant**: Local GPU-accelerated (`cuda:0` / RTX 4050) conversational reasoning engine delivering direct, conversational English answers.
- **Split-Screen Dashboard**: Interactive Leaflet map with drawing tools, draggable corner handles, quick presets, and conversational chat feed.

---

## Project Structure

```
├── backend/
│   ├── main.py                     # FastAPI application endpoints
│   └── services/
│       ├── satellite.py            # Async STAC query client (Sentinel-1 & Sentinel-2)
│       ├── geojson_pipeline.py     # SAR-Optical fusion & ISRO Bhuvan GeoJSON engine
│       ├── geo_resolver.py         # Subprocess wrapper for Playwright scraper
│       ├── vlm_engine.py           # Multi-sensor vision-language analysis
│       ├── chat_orchestrator.py    # Conversational RAG orchestrator with local Qwen
│       └── rag_service.py          # Ephemeral FAISS in-memory vector index
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Split-screen map & chat UI
│   │   └── index.js                # React 18 entrypoint
│   ├── index.html                  # HTML template with Leaflet
│   ├── package.json                # Frontend dependencies
│   ├── vite.config.js              # Vite configuration
│   └── vercel.json                 # Vercel SPA rewrite configuration
├── scraper/
│   └── geo_scraper.js              # Playwright headless reverse-geocoding & elevation
├── tests/
│   └── test_satquery.py            # Automated test suite
├── requirements.txt                # Backend dependencies
├── vercel.json                     # Monorepo Vercel configuration
└── README.md
```

---

## Local Setup

### 1. Backend

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend will be available at `http://127.0.0.1:8000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at `http://localhost:5173`.

---

## Deploying on Vercel

### Option 1: Root Project (Monorepo)
1. Import the repository in [Vercel](https://vercel.com).
2. Leave the Root Directory as `./`.
3. Vercel will automatically read `vercel.json`, run `cd frontend && npm install && npm run build`, and serve the static SPA from `frontend/dist`.
4. Under **Project Settings > Environment Variables**, add:
   - `VITE_API_BASE`: URL of your deployed backend (e.g. `https://your-backend.railway.app`).

### Option 2: Frontend Directory
1. Import the repository in [Vercel](https://vercel.com).
2. Set the **Root Directory** to `frontend`.
3. Vercel will auto-detect Vite, run `npm run build`, and serve `dist`.
4. Add `VITE_API_BASE` under **Environment Variables**.

---

## API Reference

- `GET /health`: Health status.
- `POST /api/chat`: Natural language geospatial Q&A (`{ "query": str, "bbox": [min_lon, min_lat, max_lon, max_lat], "chat_history": list }`).
- `POST /api/satellite/fetch`: Fetch and fuse live Sentinel-1 & Sentinel-2 metadata.
- `POST /api/export/geojson`: Stream downloadable ISRO Bhuvan vector GeoJSON (`satquery_export.geojson`).
- `POST /api/query`: Structured geospatial RAG query against in-memory FAISS index.
