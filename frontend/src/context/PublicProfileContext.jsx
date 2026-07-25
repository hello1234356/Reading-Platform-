import {
  useCallback,
  useMemo,
  useState,
} from "react";
import PublicProfileModal from "../components/PublicProfileModal";
import { PublicProfileContext } from "./publicProfileContextValue";

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
