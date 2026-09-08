import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTalesHunt } from './context';
export default function TalesCollectible({ letter, focusReveal = false, placement = 'inline', revealOnScroll = false }) {
  const hunt = useTalesHunt();
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!revealOnScroll || !hunt?.enabled) return;
    const checkScroll = () => {
      if (window.scrollY >= window.innerHeight * 0.75) {
        setScrolled(true);
        window.removeEventListener('scroll', checkScroll);
      }
    };
    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    return () => window.removeEventListener('scroll', checkScroll);
  }, [revealOnScroll, hunt?.enabled]);
  if ((revealOnScroll && !scrolled) || !hunt?.enabled || hunt.state.collectedLetters.includes(letter)) return null;
  return <button type="button" className={`tales-egg${focusReveal ? ' tales-focus-egg' : ''} tales-placement-${placement}`} aria-label={t('hunt.collect')} onClick={event => hunt.collectLetter(letter, event.currentTarget)}><span aria-hidden="true">{letter}</span></button>;
}
