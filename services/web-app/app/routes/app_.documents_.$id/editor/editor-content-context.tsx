import {
	createContext,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from 'react';

type EditorContentGetter = () => { text: string; html: string } | null;

type EditorContentContextValue = {
	getEditorContent: EditorContentGetter;
	registerEditor: (getter: EditorContentGetter) => void;
	unregisterEditor: () => void;
};

const EditorContentContext = createContext<EditorContentContextValue | null>(
	null
);

export const useEditorContent = () => {
	const ctx = useContext(EditorContentContext);
	if (!ctx)
		throw new Error(
			'useEditorContent must be used within EditorContentProvider'
		);
	return ctx;
};

export const EditorContentProvider = ({
	children,
}: {
	children: ReactNode;
}) => {
	const [contentGetter, setContentGetter] = useState<EditorContentGetter | null>(
		null
	);

	const registerEditor = (getter: EditorContentGetter) => {
		setContentGetter(() => getter);
	};

	const unregisterEditor = () => {
		setContentGetter(null);
	};

	const value = useMemo(
		() => ({
			getEditorContent: () => {
				return contentGetter?.() ?? null;
			},
			registerEditor,
			unregisterEditor,
		}),
		[contentGetter]
	);

	return (
		<EditorContentContext.Provider value={value}>
			{children}
		</EditorContentContext.Provider>
	);
};

