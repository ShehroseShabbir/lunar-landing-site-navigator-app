import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { EXPLAIN_COPY, type ExplainId } from './Explain';
import './Explain.css';

export interface AccordionItem {
  id: string;
  title: string;
  body: ReactNode;
}

/** The built-in "Why?" copy as accordion items (titles and bodies are EXPLAIN_COPY, unchanged). */
export function explainItems(ids: ExplainId[]): AccordionItem[] {
  return ids.map((id) => ({ id, title: EXPLAIN_COPY[id].title, body: EXPLAIN_COPY[id].body }));
}

/** One-line disclosure list. Each header is a button (Enter/Space); several can be open at once. */
export function ExplainAccordion({ items, label }: { items: AccordionItem[]; label: string }) {
  const uid = useId();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <ul className="why-acc" aria-label={label}>
      {items.map((it) => {
        const isOpen = open.has(it.id);
        const panel = `${uid}-${it.id}`;
        return (
          <li className="why-acc__item" key={it.id}>
            <h4 className="why-acc__h">
              <button type="button" className="why-acc__btn" aria-expanded={isOpen} aria-controls={panel} onClick={() => toggle(it.id)}>
                <span>{it.title}</span>
                <svg className="why-acc__chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
                  <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
            </h4>
            {isOpen && (
              <div className="why-acc__panel" id={panel} role="region" aria-label={it.title}>
                {it.body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
