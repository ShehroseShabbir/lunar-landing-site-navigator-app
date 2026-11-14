import { useId, useMemo, useState } from 'react';
import { filterSites, groupSites, SITES } from '../../data/sites';
import { useAppState } from '../../state/AppState';
import { formatCoords, parseLat, parseLon } from '../../state/coords';
import { WhyTerrain } from '../Explain/tour';
import { COPY } from '../Panel/copy';
import './SitePicker.css';

const CUSTOM = '__custom__';

interface Props {
  /** True when a terrain horizon profile exists for the active site (S3). Defaults to smooth-Moon. */
  hasTerrain?: boolean;
}

function ErrorText({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="site-picker__error">
      <span aria-hidden="true">{'⚠ '}</span>
      {message}
    </p>
  );
}

export function SitePicker({ hasTerrain = false }: Props) {
  const { site, isCustom, siteGeo, selectSite, setCustom } = useAppState();
  const uid = useId();
  const [query, setQuery] = useState('');
  const [customOpen, setCustomOpen] = useState(isCustom);
  const [latDraft, setLatDraft] = useState(isCustom ? String(siteGeo.latDeg) : '');
  const [lonDraft, setLonDraft] = useState(isCustom ? String(siteGeo.lonDeg) : '');
  const [latErr, setLatErr] = useState<string | null>(null);
  const [lonErr, setLonErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const hits = filterSites(SITES, query);
    // Keep the active site in the list so the select never shows a site that is not selected.
    if (site && !hits.some((s) => s.id === site.id)) hits.push(site);
    return groupSites(hits);
  }, [query, site]);
  const matchCount = useMemo(() => filterSites(SITES, query).length, [query]);

  const showCustom = customOpen || isCustom;
  const selectValue = showCustom ? CUSTOM : (site?.id ?? '');

  function apply(lat: string, lon: string, showErrors: 'both' | 'lat' | 'lon') {
    const la = parseLat(lat);
    const lo = parseLon(lon);
    if (showErrors !== 'lon') setLatErr(la.ok ? null : la.message);
    if (showErrors !== 'lat') setLonErr(lo.ok ? null : lo.message);
    if (la.ok && lo.ok) setCustom(la.value, lo.value);
  }

  function onSelect(value: string) {
    if (value === CUSTOM) {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setLatErr(null);
    setLonErr(null);
    selectSite(value);
  }

  const W = COPY.where;
  const horizonText = isCustom || !hasTerrain ? W.smooth : W.terrain;
  const selectId = `${uid}-site`;
  const searchId = `${uid}-search`;
  const latId = `${uid}-lat`;
  const lonId = `${uid}-lon`;

  return (
    <section className="site-picker" aria-label={W.group}>
      <div className="site-picker__field">
        <label htmlFor={selectId} className="site-picker__label">
          {W.label}
          <span className="sr-only">{W.labelSr}</span>
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          autoComplete="off"
          aria-label={W.search}
          placeholder={W.searchPlaceholder}
          aria-describedby={`${searchId}-status`}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span id={`${searchId}-status`} role="status" className="site-picker__hint">
          {query.trim() === '' ? '' : matchCount === 0 ? W.noMatch : W.matching(matchCount)}
        </span>
        <select id={selectId} value={selectValue} onChange={(e) => onSelect(e.target.value)}>
          {filtered.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {g.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM}>{W.custom}</option>
        </select>
      </div>

      {showCustom && (
        <div className="site-picker__row">
          <div className="site-picker__field">
            <label htmlFor={latId}>{W.lat}</label>
            <input
              id={latId}
              type="text"
              value={latDraft}
              aria-invalid={latErr ? true : undefined}
              aria-describedby={`${latId}-hint${latErr ? ` ${latId}-err` : ''}`}
              onChange={(e) => setLatDraft(e.target.value)}
              onBlur={() => apply(latDraft, lonDraft, 'lat')}
              onKeyDown={(e) => e.key === 'Enter' && apply(latDraft, lonDraft, 'both')}
            />
            <span id={`${latId}-hint`} className="site-picker__hint">
              {W.latHint}
            </span>
            {latErr && <ErrorText id={`${latId}-err`} message={latErr} />}
          </div>
          <div className="site-picker__field">
            <label htmlFor={lonId}>{W.lon}</label>
            <input
              id={lonId}
              type="text"
              value={lonDraft}
              aria-invalid={lonErr ? true : undefined}
              aria-describedby={`${lonId}-hint${lonErr ? ` ${lonId}-err` : ''}`}
              onChange={(e) => setLonDraft(e.target.value)}
              onBlur={() => apply(latDraft, lonDraft, 'lon')}
              onKeyDown={(e) => e.key === 'Enter' && apply(latDraft, lonDraft, 'both')}
            />
            <span id={`${lonId}-hint`} className="site-picker__hint">
              {W.lonHint}
            </span>
            {lonErr && <ErrorText id={`${lonId}-err`} message={lonErr} />}
          </div>
        </div>
      )}

      <p className="site-picker__summary">
        <span className="site-picker__meta">
          {formatCoords(siteGeo.latDeg, siteGeo.lonDeg)}
          {!isCustom && site?.region ? ` · ${site.region}` : ''}
        </span>
        <WhyTerrain />
      </p>
      {(site || isCustom) && (
        <details className="site-picker__more">
          <summary>{W.aboutSite}</summary>
          <p className="site-picker__note">{horizonText}.</p>
          {site && (
            <p className="site-picker__note">
              {site.note}. {site.mission}
              {site.agency === '-' ? '' : ` (${site.agency})`}.{' '}
              <a href={site.sourceUrl} target="_blank" rel="noopener noreferrer">
                {W.source}
                <span className="sr-only">{W.sourceSr(site.name)}</span>
              </a>
            </p>
          )}
          {isCustom && <p className="site-picker__note">{W.customNote}</p>}
        </details>
      )}
    </section>
  );
}
