import { useState } from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog';
import { Step1RubricSelection } from './step-1-rubric-selection';
import { Step2Scoring } from './step-2-scoring';
import type { RubricCategoryId } from '~/utils/essay-grading/rubric-categories';

interface GradingDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	documentId: string;
	essayText: string;
	essayHtml: string;
	onGradeCreated: (grade: any) => void;
}

export function GradingDialog({
	open,
	onOpenChange,
	documentId,
	essayText,
	essayHtml,
	onGradeCreated,
}: GradingDialogProps) {
	const [step, setStep] = useState(1);
	const [selectedCategories, setSelectedCategories] = useState<
		RubricCategoryId[]
	>([]);

	const handleNext = (categories: RubricCategoryId[]) => {
		setSelectedCategories(categories);
		setStep(2);
	};

	const handleBack = () => {
		setStep(1);
	};

	const handleSave = (grade: any) => {
		onGradeCreated(grade);
		onOpenChange(false);
		// Reset for next use
		setStep(1);
		setSelectedCategories([]);
	};

	const handleClose = (open: boolean) => {
		if (!open) {
			// Reset state when closing
			setStep(1);
			setSelectedCategories([]);
		}
		onOpenChange(open);
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Grade Essay</DialogTitle>
					<DialogDescription>
						{step === 1
							? 'Select which rubric categories you would like to grade'
							: 'Review AI-generated feedback and adjust as needed'}
					</DialogDescription>
				</DialogHeader>

				<div className="mt-4">
					{step === 1 && <Step1RubricSelection onNext={handleNext} />}

					{step === 2 && (
						<Step2Scoring
							documentId={documentId}
							essayText={essayText}
							essayHtml={essayHtml}
							categories={selectedCategories}
							onBack={handleBack}
							onSave={handleSave}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
