import { createContext, useContext } from 'react';
export const TalesContext = createContext(null);
export const useTalesHunt = () => useContext(TalesContext);
