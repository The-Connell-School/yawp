import { useState, useEffect } from 'react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { Label } from '~/components/ui/label';
import { Badge } from '~/components/ui/badge';
import { Loader2 } from 'lucide-react';
import {
	RUBRIC_CATEGORIES,
	SCORE_LABELS,
	type RubricCategoryId,
} from '~/utils/essay-grading/rubric-categories';
import type { AIGradingResponse } from '~/utils/schemas/essay-grade';
import { toast } from 'sonner';
import { generateAllHighlights } from '~/utils/essay-grading/highlight-generator';

interface Step2Props {
	documentId: string;
	essayText: string;
	essayHtml: string;
	categories: RubricCategoryId[];
	onBack: () => void;
	onSave: (grade: any) => void;
}

export function Step2Scoring({
	documentId,
	essayText,
	essayHtml,
	categories,
	onBack,
	onSave,
}: Step2Props) {
	const [aiFeedback, setAiFeedback] = useState<AIGradingResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Form state
	const [scores, setScores] = useState<Record<string, number>>({});
	const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
	const [overallFeedback, setOverallFeedback] = useState('');

	// Generate AI feedback on mount
	useEffect(() => {
		async function generateFeedback() {
			setIsLoading(true);
			setError(null);

			try {
				const response = await fetch('/api/domain/grade-essay', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						documentId,
						essayText,
						essayHtml,
						categories,
					}),
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.error || 'Failed to generate feedback');
				}

				const data = await response.json();
				setAiFeedback(data);

				// Pre-fill form with AI suggestions
				const initialScores: Record<string, number> = {};
				const initialFeedbacks: Record<string, string> = {};

				categories.forEach((category) => {
					if (data.categoryFeedback[category]) {
						initialScores[category] = data.categoryFeedback[category].score;
						initialFeedbacks[category] = data.categoryFeedback[category].feedback;
					}
				});

				setScores(initialScores);
				setFeedbacks(initialFeedbacks);
				setOverallFeedback(data.overallFeedback);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'An error occurred');
				toast.error('Failed to generate AI feedback');
			} finally {
				setIsLoading(false);
			}
		}

		generateFeedback();
	}, [documentId, essayText, essayHtml, categories]);

	const handleSave = async () => {
		setIsSaving(true);

		try {
			// Build category scores array
			const categoryScores = categories.map((category) => ({
				category,
				score: scores[category],
				feedback: feedbacks[category],
			}));

			// Generate highlights
			const highlights = generateAllHighlights(
				essayText,
				aiFeedback!.categoryFeedback,
				'temp-id'
			);

			// Save grade
			const response = await fetch('/api/model/essay-grade', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					documentId,
					graderType: 'teacher',
					essayHtml,
					essayText,
					categoryScores,
					highlights,
					overallFeedback,
				}),
			});

			if (!response.ok) {
				throw new Error('Failed to save grade');
			}

			const grade = await response.json();
			toast.success('Grade saved successfully!');
			onSave(grade);
		} catch (err) {
			toast.error('Failed to save grade');
			console.error(err);
		} finally {
			setIsSaving(false);
		}
	};

	if (isLoading) {
		return (
			<div className="flex flex-col items-center justify-center py-12">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
				<p className="mt-4 text-sm text-muted-foreground">
					Generating AI feedback... This may take a moment.
				</p>
				<p className="mt-2 text-xs text-muted-foreground">
					Analyzing essay for {categories.length} categor
					{categories.length === 1 ? 'y' : 'ies'}
				</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="text-center py-12">
				<p className="text-destructive mb-4">{error}</p>
				<Button onClick={onBack} variant="outline">
					Go Back
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-semibold">Review and Adjust Scores</h3>
				<p className="text-sm text-muted-foreground">
					AI has generated suggested scores and feedback. You can edit them before
					saving.
				</p>
			</div>

			{/* Category Scores */}
			<div className="space-y-6">
				{categories.map((category) => {
					const categoryConfig = RUBRIC_CATEGORIES[category];

					return (
						<div key={category} className="space-y-3 p-4 border rounded-lg">
							<div className="flex items-center gap-2">
								<Badge className={categoryConfig.bgClass}>
									{categoryConfig.label}
								</Badge>
							</div>

							<div className="space-y-2">
								<Label>Score (1-4)</Label>
								<RadioGroup
									value={scores[category]?.toString()}
									onValueChange={(value) =>
										setScores({ ...scores, [category]: parseInt(value) })
									}
									className="flex flex-wrap gap-4"
								>
									{[1, 2, 3, 4].map((score) => (
										<div key={score} className="flex items-center space-x-2">
											<RadioGroupItem
												value={score.toString()}
												id={`${category}-${score}`}
											/>
											<Label
												htmlFor={`${category}-${score}`}
												className="font-normal cursor-pointer"
											>
												{score} - {SCORE_LABELS[score as keyof typeof SCORE_LABELS]}
											</Label>
										</div>
									))}
								</RadioGroup>
							</div>

							<div className="space-y-2">
								<Label>Feedback</Label>
								<Textarea
									value={feedbacks[category] || ''}
									onChange={(e) =>
										setFeedbacks({ ...feedbacks, [category]: e.target.value })
									}
									rows={4}
									placeholder="Category-specific feedback..."
								/>
							</div>
						</div>
					);
				})}
			</div>

			{/* Overall Feedback */}
			<div className="space-y-2">
				<Label>Overall Feedback</Label>
				<Textarea
					value={overallFeedback}
					onChange={(e) => setOverallFeedback(e.target.value)}
					rows={4}
					placeholder="General comments about the essay..."
				/>
			</div>

			{/* Actions */}
			<div className="flex justify-between">
				<Button onClick={onBack} variant="outline" type="button">
					Back
				</Button>
				<Button onClick={handleSave} disabled={isSaving} type="button">
					{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					Save Grade
				</Button>
			</div>
		</div>
	);
}
