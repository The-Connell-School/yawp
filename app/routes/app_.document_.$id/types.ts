export enum Action {
	TutorResponse = 'tutor-response',
	IncrementInstruction = 'increment-instruction',
	CreateDocumentComment = 'create-document-comment',
	DeleteDocumentComment = 'delete-document-comment',
	CreateDocumentCommentResponse = 'create-document-comment-response',
}
export type ActionParams = { formData: FormData; userId: string }
