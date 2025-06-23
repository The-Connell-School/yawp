import { useState, useEffect } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';

export function useSortableList({
  items: initialItems,
  onReorder,
  idKey = 'id',
}: {
  items: any[];
  onReorder: (newItems: any[]) => void;
  idKey?: string;
}) {
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((item) => item[idKey] === active.id);
        const newIndex = prev.findIndex((item) => item[idKey] === over?.id);
        const newItems = arrayMove(prev, oldIndex, newIndex);
        onReorder(newItems);
        return newItems;
      });
    }
  };

  return { items, setItems, sensors, handleDragEnd };
}
