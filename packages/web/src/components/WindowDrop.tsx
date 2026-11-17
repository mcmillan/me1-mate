import { useSetAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { SizableText, YStack } from 'tamagui';
import { ACCENT } from '../lib/theme.ts';
import { Mono } from './Notice.tsx';
import { OpenFiles, openFilesAtom } from './OpenFiles.tsx';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

const DropIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The whole window is a drop target for `.ME1` and `.meu` files, with an
 * overlay while files are dragged over it. What's dropped goes through the
 * same flow as the Open button (`OpenFiles`, rendered here), which asks before
 * replacing unsaved edits.
 */
export const WindowDrop = () => {
  const open = useSetAtom(openFilesAtom);
  const [over, setOver] = useState(false);

  useEffect(() => {
    // dragenter/dragleave fire for every child crossed, so count them.
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const overHandler = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      // Copy now: the DataTransfer's file list is emptied once the event ends.
      open(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overHandler);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overHandler);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [open]);

  return (
    <>
      <OpenFiles />
      {over && (
        <YStack
          position="fixed"
          t={0}
          l={0}
          r={0}
          b={0}
          z={1000}
          p="3"
          pointerEvents="none"
          aria-hidden
        >
          <YStack
            position="absolute"
            t={0}
            l={0}
            r={0}
            b={0}
            opacity={0.9}
            style={{ background: 'var(--canvas)' }}
          />
          {/* The dashed frame is its own element, so the accent stays off the card's text. */}
          <YStack
            theme={ACCENT}
            position="absolute"
            t={12}
            l={12}
            r={12}
            b={12}
            rounded="xl"
            borderWidth={2}
            borderStyle="dashed"
            borderColor="color-8"
          />
          <YStack position="relative" flex={1} items="center" justify="center" p="4">
            <YStack
              className="panel"
              items="center"
              gap="2"
              px="5"
              py="4"
              maxW="100%"
              rounded="xl"
              borderWidth={1}
            >
              <YStack
                theme={ACCENT}
                w={36}
                h={36}
                rounded="lg"
                items="center"
                justify="center"
                bg="color-3"
                color="color-11"
              >
                <DropIcon />
              </YStack>
              <SizableText size="base" fontWeight="600" text="center">
                Drop to open
              </SizableText>
              <SizableText size="sm" color="color-10" text="center">
                An <Mono>.ME1</Mono>, a <Mono>.meu</Mono>, or both. They’re read here in the
                browser, not uploaded.
              </SizableText>
            </YStack>
          </YStack>
        </YStack>
      )}
    </>
  );
};
