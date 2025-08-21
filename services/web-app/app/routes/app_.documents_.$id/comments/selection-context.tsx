import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type CommentsSelectionContextValue = {
  activeCommentId: string | null;
  setActiveCommentId: (id: string | null) => void;
  hoveredCommentId: string | null;
  setHoveredCommentId: (id: string | null) => void;
};

const CommentsSelectionContext =
  createContext<CommentsSelectionContextValue | null>(null);

export const useCommentsSelection = () => {
  const ctx = useContext(CommentsSelectionContext);
  if (!ctx)
    throw new Error(
      'useCommentsSelection must be used within CommentsSelectionProvider'
    );
  return ctx;
};

export const CommentsSelectionProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      activeCommentId,
      setActiveCommentId,
      hoveredCommentId,
      setHoveredCommentId,
    }),
    [activeCommentId, hoveredCommentId]
  );

  return (
    <CommentsSelectionContext.Provider value={value}>
      {children}
    </CommentsSelectionContext.Provider>
  );
};
