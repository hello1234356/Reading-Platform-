import { useContext } from "react";
import { PublicProfileContext } from "./publicProfileContextValue";

export function usePublicProfile() {
  const context = useContext(PublicProfileContext);

  if (!context) {
    throw new Error(
      "usePublicProfile must be used inside PublicProfileProvider.",
    );
  }

  return context;
}
