import { getPublicDisplayName } from "./identity";

export function getUserDisplayHandle(_user, profile) {
  return getPublicDisplayName(profile);
}
