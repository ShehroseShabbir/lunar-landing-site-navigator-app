import './ui/tokens.css';
import { AppStateProvider } from './state/AppState';
import { SitePicker } from './ui/SitePicker/SitePicker';
import { TimeControl } from './ui/TimeControl/TimeControl';

export default function App() {
  return (
    <AppStateProvider>
      <main>
        <h1>Lunar Landing Site Navigator</h1>
        <p>Sun and Earth against the real horizon at a lunar landing site.</p>
        <SitePicker />
        <TimeControl />
      </main>
    </AppStateProvider>
  );
}
