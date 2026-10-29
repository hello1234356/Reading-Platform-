import { useTranslation } from 'react-i18next';
export default function ClubScheduleEditor({ value, onChange }) {
  const { t } = useTranslation();
  function update(index, field, text) { onChange(value.map((stage, i) => i === index ? { ...stage, [field]: text } : stage)); }
  function move(index, direction) { const next = [...value]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; onChange(next); }
  return <div className="schedule-builder cr-schedule-editor">
    {value.map((stage, index) => <fieldset key={stage.id || index}>
      <legend>{t('clubs.week', { week: index + 1 })}</legend>
      <label>{t('clubs.theme')}<input maxLength={100} required value={stage.title} onChange={e => update(index, 'title', e.target.value)} /></label>
      <label>{t('clubs.chapters')}<input maxLength={300} value={stage.chapters} onChange={e => update(index, 'chapters', e.target.value)} /></label>
      <label>{t('clubs.prompt')}<textarea maxLength={2000} rows={2} value={stage.description} onChange={e => update(index, 'description', e.target.value)} /></label>
      <div className="cr-actions"><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('clubRoom.moveUp')}>↑</button><button type="button" disabled={index === value.length - 1} onClick={() => move(index, 1)} aria-label={t('clubRoom.moveDown')}>↓</button><button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))}>{t('common.delete')}</button></div>
    </fieldset>)}
    <button type="button" disabled={value.length >= 52} onClick={() => onChange([...value, { title: '', chapters: '', description: '' }])}>{t('clubs.addWeek')}</button>
  </div>;
}
