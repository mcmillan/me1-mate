import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { ChannelGrid } from './components/ChannelGrid.tsx';
import { Home } from './components/Home.tsx';
import { Inspector } from './components/Inspector.tsx';
import { KeyGrid } from './components/KeyGrid.tsx';
import { KeySheet } from './components/KeySheet.tsx';
import { LoadNotice } from './components/LoadNotice.tsx';
import { tabId } from './components/ScreenTabs.tsx';
import { Toasts } from './components/Toasts.tsx';
import { TopBar } from './components/TopBar.tsx';
import { Tour } from './components/Tour.tsx';
import { WindowDrop } from './components/WindowDrop.tsx';
import { usePhone } from './lib/layout.ts';
import { useAutosave } from './lib/session.ts';
import { useShortcuts } from './lib/shortcuts.ts';
import { keySheetOpenAtom, phoneScreenAtom, screenAtom, selectedKeyAtom } from './lib/store.ts';

/**
 * The one-page editor: the 16 keys, the selected key's inspector and the 40
 * channels are all on screen together. The layout is `.workspace` in
 * styles.css.
 */
const OnePage = () => (
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
);

/**
 * The phone layout (`lib/layout.ts`), the same parts arranged for a small
 * screen: the key grid is the home screen, and a key opens in its sheet
 * (`KeySheet`: the inspector with the channel picker); the top bar's Keys |
 * Channels switch shows the channel grid instead, for naming channels and
 * linking pairs. Nothing else.
 */
const Phone = () => {
  const screen = useAtomValue(phoneScreenAtom);
  const setSelected = useSetAtom(selectedKeyAtom);
  const setSheetOpen = useSetAtom(keySheetOpenAtom);
  const open = useCallback(
    (index: number) => {
      setSelected(index);
      setSheetOpen(true);
    },
    [setSelected, setSheetOpen],
  );
  return (
    <div className="workspace" data-layout="phone">
      {screen === 'keys' ? (
        <div className="workspace-keys" role="tabpanel" aria-labelledby={tabId('keys')}>
          <KeyGrid onOpen={open} />
        </div>
      ) : (
        <div className="workspace-channels" role="tabpanel" aria-labelledby={tabId('channels')}>
          <ChannelGrid variant="names" onOpenKey={open} />
        </div>
      )}
      <KeySheet />
    </div>
  );
};

/** The editor: the top bar over the one page, or over the phone layout's screens. */
const Editor = () => {
  const phone = usePhone();
  return (
    <>
      <TopBar />
      <main>
        <div className="notices">
          <LoadNotice />
        </div>
        {phone ? <Phone /> : <OnePage />}
      </main>
      <Tour />
    </>
  );
};

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
