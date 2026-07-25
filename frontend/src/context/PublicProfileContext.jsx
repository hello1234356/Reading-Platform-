import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import PublicProfileModal from "../components/PublicProfileModal";

const PublicProfileContext = createContext(null);

export function PublicProfileProvider({ children }) {
  const [selectedProfileUserId, setSelectedProfileUserId] =
    useState(null);

  const openProfile = useCallback((userId) => {
    if (!userId) return;
    setSelectedProfileUserId(userId);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedProfileUserId(null);
  }, []);

  const contextValue = useMemo(
    () => ({
      openProfile,
      closeProfile,
      selectedProfileUserId,
    }),
    [openProfile, closeProfile, selectedProfileUserId],
  );

  return (
    <PublicProfileContext.Provider value={contextValue}>
      {children}

      <PublicProfileModal
        userId={selectedProfileUserId}
        onClose={closeProfile}
      />
    </PublicProfileContext.Provider>
  );
}

export function usePublicProfile() {
  const context = useContext(PublicProfileContext);

  if (!context) {
    throw new Error(
      "usePublicProfile must be used inside PublicProfileProvider.",
    );
  }

  return context;
}