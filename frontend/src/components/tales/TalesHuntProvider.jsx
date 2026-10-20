import { useEffect, useReducer, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CREATIVE_SLUGS } from '../../lib/creativeEventsModel';
import { TALES_HUNT_ENABLED, emptyHunt, huntReducer, readHunt, saveHunt } from '../../lib/talesHunt';
import { TalesContext } from './context';
import TalesTracker from './TalesTracker';
import './tales.css';

export default function TalesHuntProvider({ children }) {
  const { pathname } = useLocation();
  const showHunt = TALES_HUNT_ENABLED && !CREATIVE_SLUGS.some(slug => pathname === `/events/${slug}`);
  const [state, dispatch] = useReducer(huntReducer, undefined, () => {
    if (!TALES_HUNT_ENABLED) return emptyHunt();
    try { return readHunt(window.localStorage); } catch { return emptyHunt(); }
  });
  const [flight, setFlight] = useState(null);
  const tray = useRef(null);
  useEffect(() => {
    if (!TALES_HUNT_ENABLED) return;
    try { saveHunt(window.localStorage, state); } catch { /* Storage may be blocked. */ }
  }, [state]);
  useEffect(() => {
    if (!flight) return;
    const timer = setTimeout(() => setFlight(null), 950);
    return () => clearTimeout(timer);
  }, [flight]);
  function collectLetter(letter, element) {
    if (state.collectedLetters.includes(letter)) return;
    const source = element.getBoundingClientRect();
    const target = tray.current?.getBoundingClientRect();
    if (target) setFlight({ letter, x: source.left, y: source.top, dx: target.left + target.width / 2 - source.left, dy: target.top - source.top, id: performance.now() });
    dispatch({ type: 'collect', letter });
  }
  return <TalesContext.Provider value={{ enabled: showHunt, state, dispatch, collectLetter, tray }}>
    {children}
    {showHunt && <TalesTracker />}
    {showHunt && flight && <span key={flight.id} aria-hidden="true" className="tales-flight" style={{ left: flight.x, top: flight.y, '--dx': `${flight.dx}px`, '--dy': `${flight.dy}px` }}>{flight.letter}<i>✧</i></span>}
  </TalesContext.Provider>;
}
