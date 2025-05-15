// conflict-dashboard/src/App.jsx
import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const conflictZones = [
  {
    name: "Eastern Ukraine",
    position: [48.3794, 31.1656],
    risk: "High",
    description: "Active conflict zone with ongoing Russian aggression."
  },
  {
    name: "Kaliningrad",
    position: [54.7104, 20.4522],
    risk: "Medium",
    description: "Heavily militarized Russian enclave near NATO borders."
  },
  {
    name: "Transnistria",
    position: [47.0105, 28.8638],
    risk: "Elevated",
    description: "Russian-backed separatist region in Moldova."
  }
];

const getRiskColor = (risk) => {
  switch (risk) {
    case "High": return "red";
    case "Medium": return "orange";
    case "Elevated": return "yellow";
    default: return "gray";
  }
};

function MapContent({ conflictZones, flights, flightPaths }) {
  return (
    <>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution="&copy; OpenStreetMap & Carto contributors"
      />
      {conflictZones.map((zone, index) => (
        <Marker
          position={zone.position}
          key={index}
          icon={L.divIcon({
            className: 'custom-risk-icon',
            html: `<div style='background:${getRiskColor(zone.risk)}; width: 12px; height: 12px; border-radius: 50%;'></div>`
          })}
        >
          <Popup>
            <strong>{zone.name}</strong><br />
            Risk Level: {zone.risk}<br />
            {zone.description}
          </Popup>
        </Marker>
      ))}
      {flights.map((flight, index) => (
        <Marker key={index} position={flight.position}>
          <Popup>
            <strong>{flight.callsign}</strong><br />
            Country: {flight.originCountry}<br />
            Altitude: {flight.altitude}m<br />
            Velocity: {Math.round(flight.velocity)} m/s
          </Popup>
        </Marker>
      ))}
      {Object.entries(flightPaths).map(([callsign, path], idx) => (
        <Polyline key={idx} positions={path} color="blue" />
      ))}
    </>
  );
}

function App() {
  const [news, setNews] = useState([]);
  const [flights, setFlights] = useState([]);
  const [flightPaths, setFlightPaths] = useState({});
  const [alert, setAlert] = useState(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [aiScore, setAiScore] = useState(0);
  const cachedFlights = useRef({ data: [], timestamp: 0 });

  useEffect(() => {
    async function fetchNews() {
      try {
        const res = await fetch("https://gnews.io/api/v4/search?q=ukraine&lang=en&token=demo");
        const data = await res.json();

        if (!data.articles) {
          console.warn("⚠️ GNews API response missing 'articles':", data);
          setNews([
            { title: "Ukraine Conflict: Situation Update", url: "https://news.google.com/" },
            { title: "NATO Aircraft Detected in Baltic Region", url: "https://news.google.com/" }
          ]);
          return;
        }

        setNews(data.articles.slice(0, 5));
      } catch (error) {
        console.error("Failed to fetch fallback news:", error);
        setNews([
          { title: "Fallback: Ukraine Conflict Escalates", url: "https://news.google.com/" },
          { title: "Fallback: NATO on Alert in Eastern Europe", url: "https://news.google.com/" }
        ]);
      }
    }
    fetchNews();
  }, []);

  useEffect(() => {
    async function fetchNatoFlights() {
      const now = Date.now();
      if (now - cachedFlights.current.timestamp < 30000) {
        setFlights(cachedFlights.current.data);
        return;
      }

      const europeBBox = "lamin=35.0&lomin=-10.0&lamax=70.0&lomax=40.0";
      const url = `https://opensky-network.org/api/states/all?${europeBBox}`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        const natoFlights = [];
        const newFlightPaths = { ...flightPaths };
        let kaliningradAlert = null;
        let score = 0;

        if (data.states) {
          for (const flight of data.states) {
            const callsign = flight[1]?.trim();
            if (/^(RCH|NAF|BAF|LAGR|SHELL|RRR|HVM|CNV)/i.test(callsign)) {
              const position = [flight[6], flight[5]];
              natoFlights.push({
                icao24: flight[0],
                callsign,
                originCountry: flight[2],
                position,
                altitude: flight[7],
                velocity: flight[9],
              });

              if (!newFlightPaths[callsign]) newFlightPaths[callsign] = [];
              newFlightPaths[callsign].push(position);

              const [lat, lon] = position;
              if (lat > 53 && lat < 56 && lon > 19 && lon < 22) {
                kaliningradAlert = `⚠️ High-risk NATO flight detected near Kaliningrad: ${callsign}`;
                console.warn(kaliningradAlert);
                score += 20;
              }
            }
          }
        }

        cachedFlights.current = { data: natoFlights, timestamp: now };
        setFlights(natoFlights);
        setFlightPaths(newFlightPaths);
        setAlert(kaliningradAlert);
        setAlertVisible(!!kaliningradAlert);
        setAiScore(Math.min(100, score + natoFlights.length));

        if (kaliningradAlert) {
          const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
          audio.play().catch(() => {});
          setTimeout(() => setAlertVisible(false), 8000);
        }
      } catch (error) {
        console.error("Failed to fetch OpenSky data:", error);
      }
    }

    fetchNatoFlights();
    const interval = setInterval(fetchNatoFlights, 30000);
    return () => clearInterval(interval);
  }, [flightPaths]);

  return (
    <div className="App">
      <div className="sidebar">
        <h2>🛡️ Conflict Status</h2>
        <p><strong>AI Alert Level:</strong> {aiScore} / 100</p>
        <p><strong>Active Flights:</strong> {flights.length}</p>
        {alertVisible && <p className="sidebar-alert">{alert}</p>}
        <hr />
        <h3>📰 Headlines</h3>
        <ul className="sidebar-news">
          {news.map((item, index) => (
            <li key={index}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a></li>
          ))}
        </ul>
      </div>

      <div className="map-section">
        <MapContainer center={[52.52, 13.405]} zoom={5} scrollWheelZoom={true} className="map">
          <MapContent
            conflictZones={conflictZones}
            flights={flights}
            flightPaths={flightPaths}
          />
        </MapContainer>
      </div>
    </div>
  );
}

export default App;
