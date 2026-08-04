import { useRef, useState } from 'react';

type Props = { onDrop: (from: number, to: number) => void };

export const useDragAndDrop = ({ onDrop }: Props) => {
  const dragOverItemIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const onDragStart = (index: number) => () => {
    dragOverItemIndex.current = index;
  };

  const onDragOver = (index: number) => (e: any) => {
    e.preventDefault();
    if (index !== overIndex) {
      setOverIndex(index);
    }
  };

  const onDragLeave = () => {
    setOverIndex(null);
  };

  const handleDrop = (index: number) => (e: any) => {
    e.preventDefault();
    if (dragOverItemIndex.current === null) return;
    onDrop(dragOverItemIndex.current, index);
    setOverIndex(null);
  };

  return (index: number) => ({
    onDrop: handleDrop(index),
    onDragOver: onDragOver(index),
    onDragStart: onDragStart(index),
    onDragLeave,
  });
};
