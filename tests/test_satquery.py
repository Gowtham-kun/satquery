import asyncio
from httpx import AsyncClient, ASGITransport
from backend.main import app
from backend.services.geojson_pipeline import (
    BoundingBox,
    FusionRecord,
    build_bhuvan_geojson_collection,
    serialize_geojson_bytes
)
from backend.services.rag_service import EphemeralGeoIndex, build_corpus_from_geojson, execute_geospatial_rag
from backend.services.geo_resolver import resolve_geographic_context
from backend.services.imagery_provider import search_imagery, proxy_cog_bytes

def test_pydantic_models():
    bbox = BoundingBox(min_lon=80.0, min_lat=15.0, max_lon=81.0, max_lat=16.0)
    assert bbox.to_list() == [80.0, 15.0, 81.0, 16.0]
    poly = bbox.to_polygon_geom()
    assert poly.area > 0

    record = FusionRecord(
        fusion_id="TEST_FUSION_001",
        sar_scene_id="S1A_IW_GRDH",
        optical_scene_id="S2A_MSIL2A",
        temporal_delta_hours=12.5,
        spatial_overlap_ratio=0.85,
        optical_cloud_cover=10.0,
        optical_cloud_penalty=0.1,
        sar_all_weather_validity=True,
        dual_mode_coverage_status="OPTIMAL_DUAL_PASS",
        polarizations=["VV", "VH"],
        geometry={"type": "Polygon", "coordinates": [[[80, 15], [81, 15], [81, 16], [80, 16], [80, 15]]]},
        bbox=[80.0, 15.0, 81.0, 16.0],
        bhuvan_metadata={"bhuvan_layer_id": "SATQUERY_SAR_OPTICAL_FUSION"}
    )
    fc = build_bhuvan_geojson_collection([record], bbox)
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 1
    assert fc["features"][0]["properties"]["dual_mode_coverage_status"] == "OPTIMAL_DUAL_PASS"
    raw_bytes = serialize_geojson_bytes(fc)
    assert len(raw_bytes) > 0

def test_rag_ephemeral_index():
    async def _run():
        fake_geojson = {
            "type": "FeatureCollection",
            "bbox": [80.0, 15.0, 81.0, 16.0],
            "features": [
                {
                    "type": "Feature",
                    "id": "FUSION_TEST_01",
                    "bbox": [80.0, 15.0, 81.0, 16.0],
                    "geometry": {"type": "Polygon", "coordinates": [[[80, 15], [81, 15], [81, 16], [80, 16], [80, 15]]]},
                    "properties": {
                        "fusion_id": "FUSION_TEST_01",
                        "sar_scene_id": "S1A_IW_GRDH_20240110",
                        "optical_scene_id": "S2A_MSIL2A_20240111",
                        "sar_platform": "Sentinel-1A",
                        "optical_platform": "Sentinel-2A",
                        "sar_datetime": "2024-01-10T01:00:00Z",
                        "optical_datetime": "2024-01-11T05:30:00Z",
                        "polarizations": ["VV", "VH"],
                        "orbit_direction": "DESCENDING",
                        "optical_cloud_cover": 85.0,
                        "optical_cloud_penalty": 0.85,
                        "temporal_delta_hours": 28.5,
                        "spatial_overlap_ratio": 0.92,
                        "dual_mode_coverage_status": "SAR_PRIMARY_OPTICAL_CLOUDY"
                    }
                }
            ]
        }
        docs, meta = build_corpus_from_geojson(fake_geojson)
        assert len(docs) == 1
        index = EphemeralGeoIndex(docs, meta)
        results = index.retrieve("flood water radar backscatter under heavy cloud", top_k=1)
        assert len(results) == 1
        assert "FUSION_TEST_01" in results[0][1]["fusion_id"]

        res = await execute_geospatial_rag("Assess flood extent under dense cloud cover", fake_geojson)
        assert "S1A_IW_GRDH_20240110" in res["referenced_scenes"]
        assert len(res["answer"]) > 50
    asyncio.run(_run())

def test_fastapi_endpoints():
    async def _run():
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r_health = await client.get("/health")
            assert r_health.status_code == 200
            assert r_health.json()["status"] == "ok"

            fetch_payload = {
                "bbox": [77.5, 12.8, 77.8, 13.1],
                "start_date": "2024-01-01",
                "end_date": "2024-01-10"
            }
            r_fetch = await client.post("/api/satellite/fetch", json=fetch_payload, timeout=35.0)
            assert r_fetch.status_code == 200
            data = r_fetch.json()
            assert data["status"] == "success"
            fc = data["geojson"]
            assert fc["type"] == "FeatureCollection"

            r_export = await client.post("/api/export/geojson", json=fc)
            assert r_export.status_code == 200
            assert "application/geo+json" in r_export.headers.get("content-type", "")

            query_payload = {
                "query": "Assess cloud occlusion vs radar backscatter",
                "geojson_context": fc
            }
            r_query = await client.post("/api/query", json=query_payload, timeout=35.0)
            assert r_query.status_code == 200
            q_res = r_query.json()
            assert "answer" in q_res
            assert "referenced_scenes" in q_res
    asyncio.run(_run())

def test_conversational_chat():
    async def _run():
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            bbox = [81.5, 16.5, 82.5, 17.5]
            questions = [
                "Which sea or city is close to this point?",
                "What is the terrain and vegetation like here?",
                "Are there flood risks detected?"
            ]
            history = []
            for q in questions:
                res = await client.post("/api/chat", json={"query": q, "bbox": bbox, "chat_history": history}, timeout=35.0)
                assert res.status_code == 200
                data = res.json()
                reply = data["reply"]
                assert len(reply) > 40
                assert "{" not in reply and "}" not in reply
                history.append({"role": "user", "content": q})
                history.append({"role": "assistant", "content": reply})
    asyncio.run(_run())

def test_imagery_search_and_proxy():
    async def _run():
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            bbox = [78.3, 17.3, 78.6, 17.5]
            res = await client.post("/api/imagery/search", json={"bbox": bbox}, timeout=35.0)
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert "optical" in data
            assert "sar" in data
            if data.get("optical") and data["optical"].get("asset_urls", {}).get("B04"):
                b04_url = data["optical"]["asset_urls"]["B04"]
                proxy_res = await client.get("/api/imagery/proxy", params={"url": b04_url}, headers={"Range": "bytes=0-255"}, timeout=30.0)
                assert proxy_res.status_code in (200, 206)
                assert len(proxy_res.content) > 0
    asyncio.run(_run())
