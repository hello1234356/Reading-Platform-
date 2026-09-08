import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTalesHunt } from './context';

export default function TalesTracker() {
  const { state, dispatch, tray } = useTalesHunt();
  const { t } = useTranslation();
  const full = state.arrangement.length === 5;
  const [open, setOpen] = useState(full);
  const [previousFull, setPreviousFull] = useState(full);
  const [selected, setSelected] = useState(null);
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  // Open once on the transition to five letters, without reopening after dismissal.
  if (full !== previousFull) {
    setPreviousFull(full);
    if (full) setOpen(true);
  }
  function swap(from, to) { dispatch({ type: 'swap', from, to }); setSelected(null); }
  function tap(index) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (selected === null) setSelected(index);
    else if (selected === index) setSelected(null);
    else swap(selected, index);
  }
  return <aside className="tales-dock" aria-label={t('hunt.title')}>
    <div className="tales-dock-inner">
      {open && <section id="tales-panel" className="tales-panel" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); tray.current?.focus(); } }}>
        <h2>{t(full ? 'hunt.all' : 'hunt.title')}</h2>
        {full ? <>
          <p>{t('hunt.solvePrompt')}</p><p className="tales-help">{t('hunt.swap')}</p>
          <div className="tales-puzzle">
            {state.arrangement.map((letter, index) => <button type="button" key={letter} data-tales-index={index} className="tales-tile" aria-label={t('hunt.tile', { letter, position: index + 1 })} aria-pressed={selected === index} onClick={() => tap(index)}
              onPointerDown={event => { if (event.button !== 0) return; suppressClick.current = false; gesture.current = { index, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={event => { const start = gesture.current; if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) { start.moved = true; setSelected(start.index); event.currentTarget.style.transform = `translate(${event.clientX - start.x}px, ${event.clientY - start.y}px)`; event.currentTarget.style.zIndex = 1; } }}
              onPointerUp={event => { event.currentTarget.style.transform = ''; event.currentTarget.style.zIndex = ''; const start = gesture.current; gesture.current = null; if (!start?.moved) return; suppressClick.current = true; event.currentTarget.style.pointerEvents = 'none'; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-tales-index]'); event.currentTarget.style.pointerEvents = ''; if (target) swap(start.index, Number(target.dataset.talesIndex)); else setSelected(null); }}
              onPointerCancel={event => { event.currentTarget.style.transform = ''; event.currentTarget.style.zIndex = ''; gesture.current = null; setSelected(null); }}
            >{letter}</button>)}
          </div>
          <div className="tales-prize-note">
            <p>{t('hunt.teamsPrize')}</p>
            <ul className="tales-prize-contacts">
              {['carrie.wang_28@tsinglan.org', 'jenna.yuan_28@tsinglan.org', 'yiru.yang_27@tsinglan.org'].map(email => <li key={email}><span>{email}</span></li>)}
            </ul>
          </div>
          <button type="button" onClick={() => setOpen(false)}>{t('hunt.continue')}</button>
        </> : <><p>{t('hunt.intro')}</p><ul>{['talk', 'reply', 'personal', 'editors', 'book'].map(hint => <li key={hint}>{t(`hunt.${hint}`)}</li>)}</ul></>}
        {import.meta.env.DEV && <button type="button" className="tales-reset" onClick={() => { dispatch({ type: 'reset' }); setSelected(null); }}>{t('hunt.reset')}</button>}
      </section>}
      <button type="button" ref={tray} className="tales-summary" aria-expanded={open} aria-controls="tales-panel" onClick={() => setOpen(value => !value)}>
        <span>{t(full ? 'hunt.unscramble' : 'hunt.find')}</span>
        <span className="tales-tray" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span className="tales-mini" key={`${index}-${state.arrangement[index] || ''}`}>{state.arrangement[index] || ' '}</span>)}</span>
        <span className="tales-sr">{t('hunt.progress', { count: state.collectedLetters.length })}</span>
      </button>
      <span className="tales-sr" role="status">{t(full ? 'hunt.solvePrompt' : 'hunt.progress', { count: state.collectedLetters.length })}</span>
    </div>
  </aside>;
}
