import { createContext, useContext, useMemo } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';

const GoogleMapsContext = createContext({
  isLoaded: false,
  loadError: undefined,
});

const MAP_LIBRARIES = ['places'];

/**
 * Single Maps script load for the whole dashboard (avoids intermittent blank
 * screens / loader errors when multiple pages each called useJsApiLoader).
 */
export function GoogleMapsProvider({ children }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'livetrack-google-maps',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: MAP_LIBRARIES,
  });

  const value = useMemo(() => ({ isLoaded, loadError }), [isLoaded, loadError]);

  return <GoogleMapsContext.Provider value={value}>{children}</GoogleMapsContext.Provider>;
}

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}
