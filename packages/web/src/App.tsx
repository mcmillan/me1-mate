import { ChannelGrid } from './components/ChannelGrid.tsx';
import { Inspector } from './components/Inspector.tsx';
import { Intro } from './components/Intro.tsx';
import { KeyGrid } from './components/KeyGrid.tsx';
import { Toasts } from './components/Toasts.tsx';
import { TopBar } from './components/TopBar.tsx';
import { WindowDrop } from './components/WindowDrop.tsx';
import { useAutosave, useRestoreOnLoad } from './lib/session.ts';
import { useShortcuts } from './lib/shortcuts.ts';

/**
 * One page: the 16 keys, the selected key's inspector and the 40 channels are
 * all on screen together. The layout is `.workspace` in styles.css.
 */
export const App = () => {
  useRestoreOnLoad();
  useAutosave();
  useShortcuts();
  return (
    <>
      <WindowDrop />
      <TopBar />
      <main>
        <div className="notices">
          <Intro />
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
      <Toasts />
    </>
  );
};
