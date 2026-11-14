import { useState } from 'react';
import './ui/tokens.css';
import './App.css';
import { AppStateProvider, useAppState } from './state/AppState';
import { Shell, Breadcrumb, TopActions, Drawer, useShell } from './ui/Shell';
import { Hero3D } from './ui/Hero3D';
import { SitePanel, PanelTabs, AnswerStrip } from './ui/Panel';
import { PlannerDetails, usePanelTab } from './ui/Details';
import { PlannerRows } from './ui/Metrics';
import { TimeSteps } from './ui/TimeControl';
import { TimeDock } from './ui/Timeline';
import { SkyView } from './ui/SkyView/SkyView';
import { CompareView, useCompareDrawer } from './ui/Compare';
import { ShareControls } from './ui/Share';
import { TourButton } from './ui/Explain/tour';
import { EventsTab } from './ui/Events';
import { Space3D, SpaceButton, useSpaceStage } from './ui/Space3D';
import { useScenarioResult } from './state/useScenarioResult';

function FullSky() {
  const { siteGeo, siteName, t } = useAppState();
  const { profile } = useScenarioResult();
  return <SkyView site={siteGeo} siteName={siteName} profile={profile} t={t} mode="full" />;
}

function Stage({ onCaption }: { onCaption: (c: string | null) => void }) {
  const { isPhone, panelWidth, snap } = useShell();
  // Phone: the stage already ends at the sheet's top edge (the sheet publishes its real height as
  // --sheet-h for peek, half and full), so only a small margin is needed whatever the snap.
  const safeArea = isPhone
    ? { top: 48, bottom: snap === 'full' ? 0 : 12 }
    : { left: panelWidth, top: 48, bottom: 132 };
  const { siteGeo, siteName, t } = useAppState();
  const { stage, showSpace, showSurface, returnedFromSpace } = useSpaceStage();
  return (
    <div data-tour="sky" className="tour-anchor tour-anchor--stage">
      {stage === 'space' ? (
        <Space3D site={siteGeo} siteName={siteName} t={t} onZoomIn={showSurface} safeArea={safeArea} autoFocus />
      ) : (
        <Hero3D
          safeArea={safeArea}
          onCaption={onCaption}
          renderPanorama={() => <FullSky />}
          onZoomOutBeyond={showSpace}
          controlsExtra={<SpaceButton onClick={showSpace} autoFocus={returnedFromSpace} />}
        />
      )}
    </div>
  );
}

function Panel({ caption, onCompare }: { caption: string | null; onCompare: () => void }) {
  const [tab, setTab] = usePanelTab();
  const { isPhone, setCollapsed } = useShell();
  return (
    <PanelTabs
      tab={tab === 'planner' ? 'details' : tab}
      onTabChange={(next) => setTab(next === 'details' ? 'planner' : next)}
      onCollapse={isPhone ? undefined : () => setCollapsed(true)}
      site={<SitePanel caption={caption ?? undefined} onCompare={onCompare} />}
      details={<PlannerDetails plannerRows={<PlannerRows />} timeSteps={<TimeSteps />} />}
      events={<EventsTab onOpenCompare={onCompare} />}
    />
  );
}

function DockWithAnswers() {
  const { isPhone, snap } = useShell();
  return (
    <>
      {isPhone && snap !== 'full' && <AnswerStrip />}
      <TimeDock />
    </>
  );
}

function Layout() {
  const { siteName } = useAppState();
  const [tab] = usePanelTab();
  const [caption, setCaption] = useState<string | null>(null);
  const compare = useCompareDrawer();
  return (
    <Shell
      wide={tab !== 'site'}
      stage={<Stage onCaption={setCaption} />}
      breadcrumb={<Breadcrumb siteName={siteName} />}
      actions={<TopActions tour={<TourButton />} share={<ShareControls />} />}
      panel={<Panel caption={caption} onCompare={() => compare.setOpen(true)} />}
      dock={<DockWithAnswers />}
      drawers={
        <Drawer open={compare.open} onClose={() => compare.setOpen(false)} title="Compare dates or sites" width={600}>
          <CompareView />
        </Drawer>
      }
    />
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Layout />
    </AppStateProvider>
  );
}
