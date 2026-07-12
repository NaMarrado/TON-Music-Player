import { useCallback, useRef, useState } from 'react';

export function useSidebarDragState(onImportPath: (path: string) => Promise<void>) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current += 1;
    if (event.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);

    const file = event.dataTransfer.files[0];
    if (!file) return;

    const filePath = (file as File & { path?: string }).path;
    if (!filePath) return;

    await onImportPath(filePath);
  }, [onImportPath]);

  return {
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    isDragOver,
  };
}
