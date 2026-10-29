import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PREVIEW_LENGTH = 240;

export default function ClubNotice({ notice, authorName }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  // Existing notices store plain text. A heading on its own first line can
  // serve as the title without changing the stored announcement.
  const lines = String(notice.body || '').split(/\r?\n/);
  const hasHeading = !notice.title && lines[0].trim() && lines.slice(1).join('\n').trim();
  const title = notice.title || (hasHeading ? lines.shift().trim() : '');
  const body = lines.join('\n').trim();
  const characters = Array.from(body);
  const isLong = characters.length > PREVIEW_LENGTH;

  return <article className="cr-announcement">
    {title && <h4>{title}</h4>}
    {body && <p id={bodyId}>{isLong && !expanded ? `${characters.slice(0, PREVIEW_LENGTH).join('').trimEnd()}…` : body}</p>}
    {isLong && <button type="button" className="cr-notice-more" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(value => !value)}>
      {t(expanded ? 'clubRoom.showLess' : 'clubRoom.showMore')}
    </button>}
    <small>{authorName} · <time dateTime={notice.created_at}>{new Date(notice.created_at).toLocaleDateString(i18n.language)}</time></small>
  </article>;
}
