import { useAtomValue } from 'jotai';
import { ChannelGrid } from './components/ChannelGrid.tsx';
import { Home } from './components/Home.tsx';
import { Inspector } from './components/Inspector.tsx';
import { KeyGrid } from './components/KeyGrid.tsx';
import { LoadNotice } from './components/LoadNotice.tsx';
import { Toasts } from './components/Toasts.tsx';
import { TopBar } from './components/TopBar.tsx';
import { Tour } from './components/Tour.tsx';
import { WindowDrop } from './components/WindowDrop.tsx';
import { useAutosave } from './lib/session.ts';
import { useShortcuts } from './lib/shortcuts.ts';
import { screenAtom } from './lib/store.ts';

/**
 * The editor is one page: the 16 keys, the selected key's inspector and the
 * 40 channels are all on screen together. The layout is `.workspace` in
 * styles.css.
 */
const Editor = () => (
  <>
    <TopBar />
    <main>
      <div className="notices">
        <LoadNotice />
      </div>
      <div className="workspace">
        <div className="workspace-keys">
          <KeyGrid />
        </div>
        <div className="workspace-inspector">
          <Inspector />
        </div>
        <div className="workspace-channels">
          <ChannelGrid />
        </div>
      </div>
    </main>
    <Tour />
  </>
);

/**
 * Two screens: home, the front door with past sessions and the ways to begin,
 * and the editor with one session open. Files can be dropped on either.
 */
export const App = () => {
  const screen = useAtomValue(screenAtom);
  useAutosave();
  useShortcuts();
  return (
    <>
      <WindowDrop />
      {screen === 'home' ? <Home /> : <Editor />}
      <Toasts />
    </>
  );
};
