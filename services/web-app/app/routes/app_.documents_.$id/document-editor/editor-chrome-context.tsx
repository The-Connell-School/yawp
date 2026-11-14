import { createContext, useContext } from 'react';

type Chrome = {
  contentRoot: HTMLElement | null;
  scrollRoot: HTMLElement | null;
};

const EditorChromeContext = createContext<Chrome>({
  contentRoot: null,
  scrollRoot: null,
});

export function EditorChromeProvider({
  value,
  children,
}: {
  value: Chrome;
  children: React.ReactNode;
}) {
  return (
    <EditorChromeContext.Provider value={value}>
      {children}
    </EditorChromeContext.Provider>
  );
}

export function useEditorChrome() {
  return useContext(EditorChromeContext);
}