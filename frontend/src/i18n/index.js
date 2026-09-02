import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.js";
import zh from "./zh.js";

export const LANGUAGE_STORAGE_KEY = "litshelf-language";
export const SUPPORTED_LANGUAGES = ["en", "zh-CN"];

function storedLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(saved) ? saved : "en";
  } catch {
    return "en";
  }
}

function syncDocumentLanguage(language) {
  document.documentElement.lang = language === "zh-CN" ? "zh-CN" : "en";
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, "zh-CN": { translation: zh } },
  lng: storedLanguage(),
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

syncDocumentLanguage(i18n.language);
i18n.on("languageChanged", (language) => {
  const normalized = language === "zh-CN" ? "zh-CN" : "en";
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized); } catch { /* optional persistence */ }
  syncDocumentLanguage(normalized);
});

export default i18n;
