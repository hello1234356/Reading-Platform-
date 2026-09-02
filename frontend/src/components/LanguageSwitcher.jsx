import { useTranslation } from "react-i18next";

function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en";

  return (
    <div className="language-switcher" role="group" aria-label={t("language.label")}>
      <button type="button" className={current === "en" ? "active" : ""}
        aria-pressed={current === "en"} aria-label={t("language.english")}
        onClick={() => i18n.changeLanguage("en")}>EN</button>
      <span aria-hidden="true">/</span>
      <button type="button" className={current === "zh-CN" ? "active" : ""}
        aria-pressed={current === "zh-CN"} aria-label={t("language.chinese")}
        onClick={() => i18n.changeLanguage("zh-CN")}>中文</button>
    </div>
  );
}

export default LanguageSwitcher;
