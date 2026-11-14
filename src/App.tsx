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

function Sky() {
  const { siteGeo, siteName, t } = useAppState();
  const { profile } = useScenarioResult();
  return <SkyView site={siteGeo} siteName={siteName} profile={profile} t={t} />;
}

export default function App() {
  return (
    <AppStateProvider>
      <div className="app">
        <header className="app-header">
          <div>
            <h1>Lunar Landing Site Navigator</h1>
            <p>Sun and Earth against the real horizon at a lunar landing site.</p>
          </div>
          <nav aria-label="Views">
            <AboutButton />
          </nav>
        </header>
        <main className="app-main" style={{ display: 'contents' }}>
          <section className="app-controls" aria-label="Site and time">
            <SitePicker />
            <TimeControl />
            <div className="app-toolbar">
              <PlaybackControls />
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
        <footer className="app-footer">
          <p>Times are UTC. Not affiliated with or endorsed by NASA. Data credits and limits: About the data.</p>
        </footer>
      </div>
    </AppStateProvider>
  );
}
