import './ui/tokens.css';
import './App.css';
import { AppStateProvider, useAppState } from './state/AppState';
import { useScenarioResult } from './state/useScenarioResult';
import { SitePicker } from './ui/SitePicker/SitePicker';
import { TimeControl } from './ui/TimeControl/TimeControl';
import { AboutButton } from './ui/About/About';
import { SkyView } from './ui/SkyView/SkyView';
import { MetricsPanel } from './ui/Metrics/MetricsPanel';
import { Timeline } from './ui/Timeline/Timeline';
import { PlaybackControls } from './ui/Playback';
import { ShareControls } from './ui/Share';
import { CompareView, CompareButton, useHashRoute } from './ui/Compare';

function Sky() {
  const { siteGeo, siteName, t } = useAppState();
  const { profile } = useScenarioResult();
  return <SkyView site={siteGeo} siteName={siteName} profile={profile} t={t} />;
}

function Picker() {
  const { terrain } = useScenarioResult();
  return <SitePicker hasTerrain={terrain === 'loaded'} />;
}

function Shell() {
  const route = useHashRoute();
  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Lunar Landing Site Navigator</h1>
          <p>Sun and Earth against the real horizon at a lunar landing site.</p>
        </div>
        <nav aria-label="Views">
          <CompareButton />
          <AboutButton />
        </nav>
      </header>
      {route === 'compare' ? (
        <main className="app-main app-compare">
          <CompareView />
        </main>
      ) : (
        <main className="app-main">
          <section className="app-controls" aria-label="Site and time">
            <Picker />
            <TimeControl />
            <div className="app-toolbar">
              <PlaybackControls />
              <ShareControls />
            </div>
          </section>
          <section className="app-sky" aria-label="Sky">
            <Sky />
          </section>
          <section className="app-metrics" aria-label="Now at this site">
            <MetricsPanel />
          </section>
          <section className="app-timeline" aria-label="Next 30 days">
            <Timeline />
          </section>
        </main>
      )}
      <footer className="app-footer">
        <p>Times are UTC. Not affiliated with or endorsed by NASA. Data credits and limits: About the data.</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
