import React, { useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

// --- Data Setup ---
const conflictZones = [
  {
    name: "Eastern Ukraine",
    position: [48.3794, 31.1656],
    risk: "High",
    troops: 15000,
    description: "Active conflict zone with ongoing Russian aggression."
  },
  {
    name: "Kaliningrad",
    position: [54.7104, 20.4522],
    risk: "Medium",
    troops: 4000,
    description: "Heavily militarized Russian enclave near NATO borders."
  },
  {
    name: "Transnistria",
    position: [47.0105, 28.8638],
    risk: "Elevated",
    troops: 1200,
    description: "Russian-backed separatist region in Moldova."
  }
];

// --- Utility Functions ---
const getRiskColor = (risk) => ({
  "High": "red",
  "Medium": "orange",
  "Elevated": "yellow"
}[risk] || "gray");

const getFlightColor = (callsign) => {
  if (/^(RCH|NAF|BAF|LAGR|SHELL|RRR|HVM|CNV|QID|REACH|USA|SPAR|ROM|HUN|SNYPR)/i.test(callsign)) return "lime";
  if (/^(RUS|RED|RA|TUP|YAK)/i.test(callsign)) return "red";
  return "white";
};

const isNato = cs => /^(RCH|NAF|BAF|LAGR|SHELL|RRR|HVM|CNV|QID|REACH|USA|SPAR|ROM|HUN|SNYPR)/i.test(cs);
const isRussia = cs => /^(RUS|RED|RA|TUP|YAK)/i.test(cs);

// --- Main Map Content ---
const MapContent = React.memo(({ conflictZones, flights, flightPaths, showNato, showRussia, showWeather, showSatellite, highlightedZones }) => (
  <>
    <TileLayer
      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      attribution="&copy; OpenStreetMap & Carto contributors"
    />
    {showWeather && (
      <TileLayer
        url={`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${process.env.REACT_APP_OPENWEATHERMAP_API_KEY}`}
        attribution="Weather data © OpenWeatherMap"
      />
    )}
    {showSatellite && (
      <TileLayer
        url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2020-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg"
        attribution="NASA GIBS"
      />
    )}
    {/* Conflict Zones */}
    {conflictZones.map((zone, i) => (
      <React.Fragment key={`zone-${i}`}>
        <Marker
          position={zone.position}
          icon={L.divIcon({
            className: 'custom-risk-icon',
            html: `<div style='background:${getRiskColor(zone.risk)}; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 10px ${getRiskColor(zone.risk)}88; animation: pulse 2s infinite;'></div>`
          })}
        >
          <Popup>
            <strong>{zone.name}</strong><br />
            Risk Level: {zone.risk}<br />
            Estimated Troops: {zone.troops.toLocaleString()}<br />
            {zone.description}
          </Popup>
        </Marker>
        <Circle
          center={zone.position}
          radius={30000}
          pathOptions={{
            color: getRiskColor(zone.risk),
            fillOpacity: 0.05,
            weight: 2,
            dashArray: highlightedZones.includes(zone.name) ? '5,5' : undefined,
            className: highlightedZones.includes(zone.name) ? 'zone-highlight' : undefined
          }}
        />
      </React.Fragment>
    ))}
    {/* Flights */}
    {flights.filter(f => (showNato && isNato(f.callsign)) || (showRussia && isRussia(f.callsign)))
      .map((flight, idx) => (
        <Marker
          key={idx}
          position={flight.position}
          icon={L.divIcon({
            className: 'flight-icon',
            html: `<div style='background:${getFlightColor(flight.callsign)}; width: 10px; height: 10px; border-radius: 50%;'></div>`
          })}
        >
          <Popup>
            <strong>{flight.callsign}</strong><br />
            Country: {flight.originCountry}<br />
            Altitude: {flight.altitude}m<br />
            Velocity: {Math.round(flight.velocity)} m/s
          </Popup>
        </Marker>
      ))
    }
    {/* Flight Paths */}
    {Object.entries(flightPaths).map(([callsign, path], idx) =>
      ((showNato && isNato(callsign)) || (showRussia && isRussia(callsign)))
        ? <Polyline key={idx} positions={path} color={getFlightColor(callsign)} />
        : null
    )}
  </>
));

// --- Wrapper for Map + Panel ---
function AppWrapper(props) {
  return (
    <MapContainer center={[52.52, 13.405]} zoom={5} scrollWheelZoom className="map">
      <MapContent {...props} />
    </MapContainer>
  );
}

// --- Main Dashboard App ---
function App() {
  const [flights, setFlights] = useState([]);
  const [flightPaths, setFlightPaths] = useState({});
  const [showNato, setShowNato] = useState(true);
  const [showRussia, setShowRussia] = useState(true);
  const [showWeather, setShowWeather] = useState(false);
  const [showSatellite, setShowSatellite] = useState(false);
  const [highlightedZones, setHighlightedZones] = useState([]);
  const [showRadio, setShowRadio] = useState(false);
  const [news, setNews] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [alertLevel, setAlertLevel] = useState(0);
  const [loadingFlights, setLoadingFlights] = useState(true);

  const cachedFlights = useRef({ data: [], timestamp: 0 });

  // === Fetch Flights ===
  const fetchFlights = useCallback(async () => {
    const now = Date.now();
    if (now - cachedFlights.current.timestamp < 30000) {
      setFlights(cachedFlights.current.data);
      setLastUpdated(new Date().toLocaleTimeString());
      setLoadingFlights(false);
      return;
    }
    try {
      setLoadingFlights(true);
      const url = "http://localhost:5000/api/flights";
      const authHeader = "Basic " + btoa(`${process.env.REACT_APP_OPENSKY_USER}:${process.env.REACT_APP_OPENSKY_PASS}`);
      const response = await fetch(url, { headers: { Authorization: authHeader } });
      const data = await response.json();
      const trackedFlights = [];
      const paths = { ...flightPaths };

      if (data.states) {
        for (const f of data.states) {
          const callsign = f[1]?.trim();
          if (!callsign) continue;
          const position = [f[6], f[5]];
          if (isNato(callsign) || isRussia(callsign)) {
            trackedFlights.push({
              icao24: f[0],
              callsign,
              originCountry: f[2],
              position,
              altitude: f[7],
              velocity: f[9],
            });
            if (!paths[callsign]) paths[callsign] = [];
            paths[callsign].push(position);
          }
        }
      }
      cachedFlights.current = { data: trackedFlights, timestamp: now };
      setFlights(trackedFlights);
      setFlightPaths(paths);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Flight fetch failed:", err);
    } finally {
      setLoadingFlights(false);
    }
  // eslint-disable-next-line
  }, [flightPaths]);

  useEffect(() => {
    fetchFlights();
    const interval = setInterval(fetchFlights, 900000);
    return () => clearInterval(interval);
  }, [fetchFlights]);

  // === Fetch News ===
  useEffect(() => {
    async function fetchNews() {
      try {
        const response = await fetch('https://gnews.io/api/v4/search?q=ukraine+conflict&lang=en&max=10&apikey=d15435981f78f19499693079c3cea81a');
        const data = await response.json();
        setNews(data.articles || []);
      } catch (err) {
        console.error("News fetch failed:", err);
        setNews([]);
      }
    }
    fetchNews();
  }, []);

  // === Dynamic Alert Level ===
  useEffect(() => {
    let alert = 0;
    for (const zone of conflictZones) {
      if (zone.risk === "High") alert += 20;
      if (zone.risk === "Elevated") alert += 10;
      if (zone.risk === "Medium") alert += 5;
    }
    alert += flights.length * 2;
    if (alert > 100) alert = 100;
    setAlertLevel(alert);
  }, [flights]);

  // --- UI Render ---
  return (
    <div className="dashboard">
      <aside className="sidebar">
        <h2>🛡️ Conflict Status</h2>
        <p><strong>AI Alert Level:</strong> {alertLevel} / 100</p>
        <p><strong>Active Flights:</strong> {loadingFlights ? "Loading..." : flights.length}</p>
        <p><strong>Last Updated:</strong> {lastUpdated || "Fetching..."}</p>
        <hr />
        <h3>📰 Headlines</h3>
        <ul className="sidebar-news">
          {news.length === 0 ? <li>Loading news...</li> :
            news.map((article, i) => (
              <li key={i}>
                <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a>
              </li>
            ))}
        </ul>
        <hr />
        <h3>🪖 Troop Estimates</h3>
        <ul className="sidebar-news">
          {conflictZones.map((zone, index) => (
            <li key={index}>
              <strong>{zone.name}</strong>: {zone.troops.toLocaleString()} troops
            </li>
          ))}
        </ul>
      </aside>
      <main className="main-panel">
        <section className="control-panel">
          <h3>🧭 Control Panel</h3>
          <label>
            <input
              type="checkbox"
              checked={showNato}
              onChange={() => setShowNato(v => !v)}
              aria-checked={showNato}
            /> Show NATO Flights
          </label><br />
          <label>
            <input
              type="checkbox"
              checked={showRussia}
              onChange={() => setShowRussia(v => !v)}
              aria-checked={showRussia}
            /> Show Russian Flights
          </label><br />
          <label>
            <input
              type="checkbox"
              checked={showWeather}
              onChange={() => setShowWeather(v => !v)}
              aria-checked={showWeather}
            /> Show Weather Overlay
          </label><br />
          <label>
            <input
              type="checkbox"
              checked={showSatellite}
              onChange={() => setShowSatellite(v => !v)}
              aria-checked={showSatellite}
            /> Show Satellite View
          </label><br />
          <label>
            <input
              type="checkbox"
              checked={showRadio}
              onChange={() => setShowRadio(v => !v)}
              aria-checked={showRadio}
            /> Show Radio Stream
          </label>
        </section>
        <AppWrapper
          flights={flights}
          flightPaths={flightPaths}
          showNato={showNato}
          showRussia={showRussia}
          showWeather={showWeather}
          showSatellite={showSatellite}
          highlightedZones={highlightedZones}
        />
      </main>
      {showRadio && (
        <div className="radio-panel">
          <h4>📻 Live Radio Stream</h4>
          <iframe
            src="https://www.broadcastify.com/listen/feed/3896/web"
            width="100%"
            height="100"
            allow="autoplay"
            title="LiveATC"
            style={{ border: "none" }}
          />
        </div>
      )}
    </div>
  );
}

export default App;
