import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HomepageSpotlightSlide } from "./HomepageSpotlightCarousel";
import {
  deleteHomepageBanner,
  getAllHomepageBanners,
  removeHomepageBannerImage,
  reorderHomepageBanners,
  saveHomepageBanner,
  uploadHomepageBannerImage,
  validateHomepageBannerImage,
} from "../lib/homepageBannerApi";

const emptyBanner = {
  id: "",
  eyebrow: "",
  headline: "",
  body: "",
  imageUrl: "",
  imagePath: "",
  imagePositionX: 50,
  imagePositionY: 50,
  imageZoom: 1,
  mobileImageUrl: "",
  mobileImagePath: "",
  mobileImagePositionX: null,
  mobileImagePositionY: null,
  textAlignment: "left",
  textVerticalPosition: "center",
  fontFamily: "lit_serif",
  textSize: "large",
  textColor: "cream",
  customTextColor: "#fffaf1",
  overlayStrength: "medium",
  ctaLabel: "",
  ctaUrl: "",
  sortOrder: 0,
  status: "draft",
  startsAt: "",
  endsAt: "",
};

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function editorBanner(banner) {
  return {
    ...emptyBanner,
    ...banner,
    startsAt: toLocalDateTime(banner?.startsAt),
    endsAt: toLocalDateTime(banner?.endsAt),
  };
}

function getBannerStatus(banner) {
  if (banner.status === "draft") return "Draft";
  const now = Date.now();
  if (banner.startsAt && new Date(banner.startsAt).getTime() > now) return "Scheduled";
  if (banner.endsAt && new Date(banner.endsAt).getTime() <= now) return "Expired";
  return "Published";
}

function formatRange(banner) {
  const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  if (!banner.startsAt && !banner.endsAt) return "No date limit";
  const start = banner.startsAt ? formatter.format(new Date(banner.startsAt)) : "Now";
  const end = banner.endsAt ? formatter.format(new Date(banner.endsAt)) : "Ongoing";
  return `${start} – ${end}`;
}

function validateBanner(banner, imageFile) {
  if (!banner.imageUrl && !imageFile) return "Choose a background image.";
  if (banner.textColor === "custom" && !/^#[0-9a-f]{6}$/i.test(banner.customTextColor)) {
    return "Choose a valid custom text color.";
  }
  if (Boolean(banner.ctaLabel.trim()) !== Boolean(banner.ctaUrl.trim())) {
    return "Add both a CTA label and destination, or leave both blank.";
  }
  if (banner.ctaUrl && !banner.ctaUrl.startsWith("/") && !/^https?:\/\//i.test(banner.ctaUrl)) {
    return "CTA destinations must be an internal path beginning with / or a full HTTP(S) URL.";
  }
  if (banner.startsAt && banner.endsAt && new Date(banner.endsAt) <= new Date(banner.startsAt)) {
    return "Show until must be later than show from.";
  }
  if (Number(banner.imageZoom) < 1 || Number(banner.imageZoom) > 2.5) {
    return "Image zoom must be between 1.00× and 2.50×.";
  }
  return "";
}

function Field({ label, hint, children, wide = false }) {
  return (
    <label className={wide ? "homepage-banner-field wide" : "homepage-banner-field"}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function BannerEditor({ initialBanner, nextOrder, onSaved, onCancel }) {
  const { t } = useTranslation();
  const [banner, setBanner] = useState(() => editorBanner(initialBanner || { sortOrder: nextOrder }));
  const [imageFile, setImageFile] = useState(null);
  const [localImageUrl, setLocalImageUrl] = useState("");
  const [mobileImageFile, setMobileImageFile] = useState(null);
  const [localMobileImageUrl, setLocalMobileImageUrl] = useState("");
  const [imageWarning, setImageWarning] = useState("");
  const [mobileImageWarning, setMobileImageWarning] = useState("");
  const [previewMode, setPreviewMode] = useState("desktop");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const originalSnapshot = useMemo(() => JSON.stringify(editorBanner(initialBanner || { sortOrder: nextOrder })), [initialBanner, nextOrder]);
  const dirty = imageFile || mobileImageFile || JSON.stringify(banner) !== originalSnapshot;

  useEffect(() => () => {
    if (localImageUrl) URL.revokeObjectURL(localImageUrl);
  }, [localImageUrl]);

  useEffect(() => () => {
    if (localMobileImageUrl) URL.revokeObjectURL(localMobileImageUrl);
  }, [localMobileImageUrl]);

  function update(field, value) {
    setBanner((current) => ({ ...current, [field]: value }));
  }

  function cancel() {
    if (dirty && !window.confirm("Discard your unsaved banner changes?")) return;
    onCancel();
  }

  function chooseImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      validateHomepageBannerImage(file);
      setError("");
      setImageFile(file);
      const objectUrl = URL.createObjectURL(file);
      setLocalImageUrl(objectUrl);
      const image = new Image();
      image.onload = () => {
        setImageWarning(image.naturalWidth < 1600 || image.naturalHeight < 500
          ? `This image is ${image.naturalWidth} × ${image.naturalHeight}px and may look soft. Around 2400 × 800px is recommended.`
          : "");
      };
      image.src = objectUrl;
    } catch (nextError) {
      setError(nextError.message);
      event.target.value = "";
    }
  }

  function chooseMobileImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      validateHomepageBannerImage(file);
      setError("");
      setMobileImageFile(file);
      const objectUrl = URL.createObjectURL(file);
      setLocalMobileImageUrl(objectUrl);
      const image = new Image();
      image.onload = () => {
        setMobileImageWarning(image.naturalWidth < image.naturalHeight
          ? "This image is portrait. Use a landscape mobile banner, ideally around 1200 × 900px."
          : "");
      };
      image.src = objectUrl;
    } catch (nextError) {
      setError(nextError.message);
      event.target.value = "";
    }
  }

  function clearMobileImage() {
    setMobileImageFile(null);
    setLocalMobileImageUrl("");
    setMobileImageWarning("");
    update("mobileImageUrl", "");
    update("mobileImagePath", "");
  }

  async function submit(event) {
    event.preventDefault();
    const validationError = validateBanner(banner, imageFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    let uploaded = null;
    let uploadedMobile = null;
    try {
      if (imageFile) uploaded = await uploadHomepageBannerImage(imageFile);
      if (mobileImageFile) uploadedMobile = await uploadHomepageBannerImage(mobileImageFile);
      const saved = await saveHomepageBanner({
        ...banner,
        ...(uploaded || {}),
        ...(uploadedMobile ? {
          mobileImageUrl: uploadedMobile.imageUrl,
          mobileImagePath: uploadedMobile.imagePath,
        } : {}),
        startsAt: banner.startsAt ? new Date(banner.startsAt).toISOString() : "",
        endsAt: banner.endsAt ? new Date(banner.endsAt).toISOString() : "",
      });
      if (uploaded && initialBanner?.imagePath) {
        try {
          await removeHomepageBannerImage(initialBanner.imagePath);
        } catch (cleanupError) {
          console.warn("The old banner image could not be removed:", cleanupError);
        }
      }
      if ((uploadedMobile || !banner.mobileImageUrl) && initialBanner?.mobileImagePath) {
        try {
          await removeHomepageBannerImage(initialBanner.mobileImagePath);
        } catch (cleanupError) {
          console.warn("The old mobile banner image could not be removed:", cleanupError);
        }
      }
      onSaved(saved);
    } catch (saveError) {
      if (uploaded?.imagePath) {
        try { await removeHomepageBannerImage(uploaded.imagePath); } catch (cleanupError) {
          console.warn("The unused banner upload could not be removed:", cleanupError);
        }
      }
      if (uploadedMobile?.imagePath) {
        try { await removeHomepageBannerImage(uploadedMobile.imagePath); } catch (cleanupError) {
          console.warn("The unused mobile banner upload could not be removed:", cleanupError);
        }
      }
      setError(saveError.message || "Could not save this homepage banner.");
    } finally {
      setSaving(false);
    }
  }

  const preview = {
    ...banner,
    imageUrl: localImageUrl || banner.imageUrl,
    mobileImageUrl: localMobileImageUrl || banner.mobileImageUrl,
  };

  return (
    <form className="homepage-banner-editor" onSubmit={submit}>
      <div className="homepage-banner-editor-heading">
        <div>
          <p className="eyebrow">{t("banners.spotlight")}</p>
          <h2>{banner.id ? t("banners.edit") : t("banners.create")}</h2>
        </div>
        <button className="ghost-button" type="button" onClick={cancel}>{t("banners.back")}</button>
      </div>

      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      <div className="homepage-banner-editor-layout">
        <div className="homepage-banner-controls">
          <section className="homepage-banner-fieldset">
            <h3>{t("banners.desktopBackground")}</h3>
            <Field label={banner.imageUrl || localImageUrl ? t("banners.replaceImage") : t("banners.backgroundImage")} wide hint="JPG, PNG, or WebP up to 10 MB. Around 2400 × 800px works best.">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
            </Field>
            {imageWarning ? <p className="homepage-banner-warning">{imageWarning}</p> : null}
            <Field label={`Horizontal focal point (${banner.imagePositionX}%)`}>
              <input type="range" min="0" max="100" value={banner.imagePositionX} onChange={(event) => update("imagePositionX", event.target.value)} />
            </Field>
            <Field label={`Vertical focal point (${banner.imagePositionY}%)`}>
              <input type="range" min="0" max="100" value={banner.imagePositionY} onChange={(event) => update("imagePositionY", event.target.value)} />
            </Field>
            <Field label={`Image zoom (${Number(banner.imageZoom).toFixed(2)}×)`} wide>
              <input type="range" min="1" max="2.5" step="0.05" value={banner.imageZoom} onChange={(event) => update("imageZoom", event.target.value)} />
            </Field>
            <h3>{t("banners.mobileBackground")} <small>({t("banners.optional")})</small></h3>
            <Field label={banner.mobileImageUrl || localMobileImageUrl ? t("banners.replaceMobile") : t("banners.mobileImage")} wide hint="Optional landscape image, ideally around 1200 × 900px. Without one, LitShelf crops the desktop image.">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseMobileImage} />
            </Field>
            {banner.mobileImageUrl || localMobileImageUrl ? (
              <button className="ghost-button homepage-banner-remove-mobile" type="button" onClick={clearMobileImage}>{t("banners.useDesktop")}</button>
            ) : null}
            {mobileImageWarning ? <p className="homepage-banner-warning">{mobileImageWarning}</p> : null}
            <Field label={`Mobile horizontal focal point (${banner.mobileImagePositionX ?? banner.imagePositionX}%)`}>
              <input type="range" min="0" max="100" value={banner.mobileImagePositionX ?? banner.imagePositionX} onChange={(event) => update("mobileImagePositionX", event.target.value)} />
            </Field>
            <Field label={`Mobile vertical focal point (${banner.mobileImagePositionY ?? banner.imagePositionY}%)`}>
              <input type="range" min="0" max="100" value={banner.mobileImagePositionY ?? banner.imagePositionY} onChange={(event) => update("mobileImagePositionY", event.target.value)} />
            </Field>
          </section>

          <section className="homepage-banner-fieldset">
            <h3>{t("banners.text")}</h3>
            <Field label={t("banners.eyebrow")}><input value={banner.eyebrow} maxLength="80" onChange={(event) => update("eyebrow", event.target.value)} /></Field>
            <Field label={t("banners.headline")} wide><textarea rows="3" value={banner.headline} maxLength="180" onChange={(event) => update("headline", event.target.value)} /></Field>
            <Field label={t("banners.body")} wide><textarea rows="3" value={banner.body} maxLength="360" onChange={(event) => update("body", event.target.value)} /></Field>
            <Field label={t("banners.horizontal")}><select value={banner.textAlignment} onChange={(event) => update("textAlignment", event.target.value)}><option value="left">{t("banners.left")}</option><option value="center">{t("banners.center")}</option><option value="right">{t("banners.right")}</option></select></Field>
            <Field label={t("banners.vertical")}><select value={banner.textVerticalPosition} onChange={(event) => update("textVerticalPosition", event.target.value)}><option value="top">{t("banners.top")}</option><option value="center">{t("banners.center")}</option><option value="bottom">{t("banners.bottom")}</option></select></Field>
            <Field label={t("banners.font")}><select value={banner.fontFamily} onChange={(event) => update("fontFamily", event.target.value)}><option value="lit_serif">LitShelf Serif</option><option value="lit_sans">LitShelf Display Sans</option><option value="editorial_serif">Editorial Serif</option><option value="classic_serif">Classic Serif</option><option value="clean_sans">Clean Sans</option></select></Field>
            <Field label={t("banners.textSize")}><select value={banner.textSize} onChange={(event) => update("textSize", event.target.value)}><option value="small">{t("banners.small")}</option><option value="medium">{t("banners.medium")}</option><option value="large">{t("banners.large")}</option><option value="huge">{t("banners.huge")}</option></select></Field>
            <Field label={t("banners.textColor")}><select value={banner.textColor} onChange={(event) => update("textColor", event.target.value)}><option value="cream">{t("banners.cream")}</option><option value="white">{t("banners.white")}</option><option value="brown">{t("banners.brown")}</option><option value="black">{t("banners.black")}</option><option value="custom">{t("banners.custom")}</option></select></Field>
            {banner.textColor === "custom" ? <Field label={t("banners.customColor")}><input type="color" value={banner.customTextColor} onChange={(event) => update("customTextColor", event.target.value)} /></Field> : null}
            <Field label={t("banners.overlay")}><select value={banner.overlayStrength} onChange={(event) => update("overlayStrength", event.target.value)}><option value="none">{t("banners.none")}</option><option value="light">{t("banners.light")}</option><option value="medium">{t("banners.medium")}</option><option value="strong">{t("banners.strong")}</option></select></Field>
          </section>

          <section className="homepage-banner-fieldset">
            <h3>{t("banners.publishing")}</h3>
            <Field label={t("banners.buttonLabel")}><input value={banner.ctaLabel} maxLength="60" onChange={(event) => update("ctaLabel", event.target.value)} /></Field>
            <Field label={t("banners.destination")} hint="Use /discover, /profile, /clubs, /admin, or a full https:// URL."><input value={banner.ctaUrl} placeholder="/discover" onChange={(event) => update("ctaUrl", event.target.value)} /></Field>
            <Field label={t("banners.status")}><select value={banner.status} onChange={(event) => update("status", event.target.value)}><option value="draft">{t("banners.draft")}</option><option value="published">{t("banners.published")}</option></select></Field>
            <Field label={t("banners.showFrom")}><input type="datetime-local" value={banner.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></Field>
            <Field label={t("banners.showUntil")}><input type="datetime-local" value={banner.endsAt} onChange={(event) => update("endsAt", event.target.value)} /></Field>
          </section>
        </div>

        <aside className="homepage-banner-preview-panel">
          <div className="homepage-banner-preview-toolbar">
            <strong>{t("banners.livePreview")}</strong>
            <div role="group" aria-label={t("banners.previewSize")}>
              <button type="button" className={previewMode === "desktop" ? "active" : ""} onClick={() => setPreviewMode("desktop")}>{t("banners.desktop")}</button>
              <button type="button" className={previewMode === "mobile" ? "active" : ""} onClick={() => setPreviewMode("mobile")}>{t("banners.mobile")}</button>
            </div>
          </div>
          <div className={`homepage-banner-preview ${previewMode}`}>
            <HomepageSpotlightSlide banner={preview} previewMode={previewMode} />
            <div className="homepage-spotlight-pagination homepage-banner-preview-pagination" aria-hidden="true">
              <button className="active" type="button" tabIndex="-1" />
              <button type="button" tabIndex="-1" />
            </div>
          </div>
        </aside>
      </div>

      <div className="admin-actions homepage-banner-save-actions">
        <button className="primary-button" type="submit" disabled={saving}>{saving ? t("profile.saving") : t("banners.save")}</button>
        <button className="ghost-button" type="button" disabled={saving} onClick={cancel}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

function HomepageBannerAdmin() {
  const { t } = useTranslation();
  const [banners, setBanners] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  async function load() {
    setStatus("loading");
    setMessage("");
    try {
      setBanners(await getAllHomepageBanners());
      setStatus("ready");
    } catch (error) {
      setMessage(error.message || "Could not load homepage banners.");
      setStatus("error");
    }
  }

  useEffect(() => {
    let cancelled = false;
    getAllHomepageBanners()
      .then((items) => {
        if (!cancelled) {
          setBanners(items);
          setStatus("ready");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error.message || "Could not load homepage banners.");
          setStatus("error");
        }
      });
    return () => { cancelled = true; };
  }, []);

  async function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= banners.length || savingOrder) return;
    const next = [...banners];
    [next[index], next[target]] = [next[target], next[index]];
    setBanners(next);
    setSavingOrder(true);
    setMessage("");
    try {
      await reorderHomepageBanners(next);
      await load();
    } catch (error) {
      setMessage(error.message || "Could not save the banner order.");
      await load();
    } finally {
      setSavingOrder(false);
    }
  }

  async function remove(banner) {
    if (!window.confirm(`Delete “${banner.headline || banner.eyebrow || "this banner"}”? This cannot be undone.`)) return;
    setMessage("");
    try {
      await deleteHomepageBanner(banner);
      await load();
    } catch (error) {
      setMessage(error.message || "Could not delete this banner.");
    }
  }

  if (creating || editing) {
    return (
      <BannerEditor
        initialBanner={editing}
        nextOrder={banners.length}
        onCancel={() => { setCreating(false); setEditing(null); }}
        onSaved={async () => { setCreating(false); setEditing(null); await load(); }}
      />
    );
  }

  return (
    <section className="admin-panel homepage-banner-admin" aria-label={t("banners.adminAria")}>
      <div className="homepage-banner-list-heading">
        <div>
          <p className="eyebrow">{t("banners.page")}</p>
          <h2>{t("admin.banners")}</h2>
          <p className="admin-muted">{t("banners.adminHelp")}</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setCreating(true)}>{t("banners.create")}</button>
      </div>
      {message ? <p className="admin-error" role="alert">{message}</p> : null}
      {status === "loading" ? <p className="admin-empty">{t("banners.loading")}</p> : null}
      {status === "ready" && banners.length === 0 ? <p className="admin-empty">{t("banners.empty")}</p> : null}
      <div className="homepage-banner-list">
        {banners.map((banner, index) => (
          <article className="homepage-banner-row" key={banner.id}>
            <div className="homepage-banner-thumbnail">
              <img src={banner.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
            </div>
            <div className="homepage-banner-row-copy">
              <div><span className={`admin-status ${getBannerStatus(banner).toLowerCase()}`}>{getBannerStatus(banner)}</span><small>{t("banners.order", { order: index + 1 })}</small></div>
              <h3>{banner.headline || banner.eyebrow || t("banners.imageOnly")}</h3>
              <p>{formatRange(banner)}</p>
            </div>
            <div className="homepage-banner-row-actions">
              <div className="homepage-banner-order-actions" aria-label={`Reorder ${banner.headline || "banner"}`}>
                <button type="button" disabled={index === 0 || savingOrder} aria-label={t("banners.moveUp")} onClick={() => move(index, -1)}>↑</button>
                <button type="button" disabled={index === banners.length - 1 || savingOrder} aria-label={t("banners.moveDown")} onClick={() => move(index, 1)}>↓</button>
              </div>
              <button className="ghost-button" type="button" onClick={() => setEditing(banner)}>{t("common.edit")}</button>
              <button className="homepage-banner-delete" type="button" onClick={() => remove(banner)}>{t("common.delete")}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default HomepageBannerAdmin;
