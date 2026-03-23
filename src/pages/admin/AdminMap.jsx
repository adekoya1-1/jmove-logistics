import { useState, useEffect, useRef } from 'react';
import { driversAPI } from '../../api/client.js';
import { useAuth } from '../../App.jsx';
import io from 'socket.io-client';
import './AdminMap.css';

export default function AdminMap() {
  const { } = useAuth();
  const [drivers,  setDrivers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const mapRef  = useRef(null);
  const mapObj  = useRef(null);
  const markers = useRef({});

  const loadDrivers = () => driversAPI.map()
    .then(r => setDrivers(r.data))
    .catch(console.error)
    .finally(() => setLoading(false));

  useEffect(() => {
    loadDrivers();
    const interval = setInterval(loadDrivers, 15000);
    return () => clearInterval(interval);
  }, []);

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    if (!window.google) return;
    mapObj.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 6.5244, lng: 3.3792 }, zoom: 11,
      styles: [{ elementType:'geometry', stylers:[{ color:'#0F1923' }] }, { featureType:'road', elementType:'geometry', stylers:[{ color:'#1A2E3E' }] }, { featureType:'water', elementType:'geometry', stylers:[{ color:'#17263c' }] }, { featureType:'poi', stylers:[{ visibility:'off' }] }],
      disableDefaultUI: false, mapTypeControl: false, streetViewControl: false,
    });
  }, []);

  // Update markers
  useEffect(() => {
    if (!mapObj.current || !window.google) return;
    const seen = new Set();
    drivers.forEach(d => {
      if (!d.currentLat || !d.currentLng) return;
      const pos = { lat: parseFloat(d.currentLat), lng: parseFloat(d.currentLng) };
      const color = d.status === 'busy' ? '#F4A012' : '#10b981';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="${color}" stroke="white" stroke-width="2"/><text x="18" y="23" text-anchor="middle" font-size="14">${d.status==='busy'?'🚗':'●'}</text></svg>`;
      const icon = { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new window.google.maps.Size(36,36), anchor: new window.google.maps.Point(18,18) };
      if (markers.current[d._id]) {
        markers.current[d._id].setPosition(pos);
        markers.current[d._id].setIcon(icon);
      } else {
        const m = new window.google.maps.Marker({ position: pos, map: mapObj.current, title: `${d.firstName} ${d.lastName}`, icon });
        const iw = new window.google.maps.InfoWindow({ content: `<div style="color:#0F1923;padding:4px 8px;font-size:13px"><strong>${d.firstName} ${d.lastName}</strong><br/>${d.status}${d.orderId?'<br/>On delivery':''}</div>` });
        m.addListener('click', () => iw.open(mapObj.current, m));
        markers.current[d._id] = m;
      }
      seen.add(d._id);
    });
    Object.keys(markers.current).forEach(id => {
      if (!seen.has(id)) { markers.current[id].setMap(null); delete markers.current[id]; }
    });
  }, [drivers]);

  const active    = drivers.filter(d => d.status === 'busy');
  const available = drivers.filter(d => d.status === 'available');

  return (
    <div className="admin-map-page">
      <div className="map-page-header">
        <div><h1 className="page-title">Live Map</h1><p className="page-subtitle">Real-time driver positions</p></div>
        <div className="map-legend">
          <div className="legend-item"><span className="legend-dot brand" />On delivery ({active.length})</div>
          <div className="legend-item"><span className="legend-dot green" />Available ({available.length})</div>
          <button className="btn-secondary" style={{ fontSize:13, padding:'7px 14px' }} onClick={loadDrivers}>↻ Refresh</button>
        </div>
      </div>

      <div className="map-layout">
        <div className="card map-container-card">
          <div ref={mapRef} className="map-canvas">
            {!import.meta.env.VITE_GOOGLE_MAPS_KEY && (
              <div className="map-placeholder"><p>🗺 Map requires VITE_GOOGLE_MAPS_KEY</p></div>
            )}
          </div>
        </div>
        <div className="card map-sidebar">
          <p className="map-sidebar-title">Active Drivers <span className="map-count">{drivers.length}</span></p>
          {loading ? <div className="spinner" style={{ margin:'20px auto', display:'block' }} /> :
          drivers.length === 0 ? <p className="text-muted" style={{ textAlign:'center', padding:'30px 0', fontSize:13 }}>No drivers online</p> :
          <div className="map-driver-list">
            {drivers.map(d => (
              <div key={d._id} className="map-driver-item">
                <div className="map-driver-avatar">{d.firstName?.[0]}{d.lastName?.[0]}</div>
                <div className="map-driver-info">
                  <p className="map-driver-name">{d.firstName} {d.lastName}</p>
                  <p className="map-driver-sub" style={{ textTransform:'capitalize' }}>{d.vehicleType}</p>
                </div>
                <span className={`badge badge-${d.status}`} style={{ fontSize:10 }}>{d.status}</span>
              </div>
            ))}
          </div>}
        </div>
      </div>
    </div>
  );
}
