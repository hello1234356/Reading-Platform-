import { createContext, useContext } from 'react';
export const EventsAccessContext = createContext(null);
export function useEventsAccess() { return useContext(EventsAccessContext); }
