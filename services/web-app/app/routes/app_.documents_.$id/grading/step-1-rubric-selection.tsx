import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Separator } from '~/components/ui/separator';
import {
	RUBRIC_CATEGORIES,
	RUBRIC_CATEGORY_IDS,
	type RubricCategoryId,
} from '~/utils/essay-grading/rubric-categories';

interface Step1Props {
	onNext: (categories: RubricCategoryId[]) => void;
}

export function Step1RubricSelection({ onNext }: Step1Props) {
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);

		// Check if "Use Full Rubric" is selected
		if (formData.get('useFullRubric') === 'on') {
			onNext([...RUBRIC_CATEGORY_IDS]);
			return;
		}

		// Otherwise, collect selected categories
		const selectedCategories: RubricCategoryId[] = [];
		RUBRIC_CATEGORY_IDS.forEach((categoryId) => {
			if (formData.get(categoryId) === 'on') {
				selectedCategories.push(categoryId);
			}
		});

		// Validate at least one category is selected
		if (selectedCategories.length === 0) {
			alert('Please select at least one category to grade');
			return;
		}

		onNext(selectedCategories);
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<div className="space-y-4">
				<div>
					<h3 className="text-lg font-semibold">Select Rubric Categories</h3>
					<p className="text-sm text-muted-foreground">
						Choose which aspects of the essay you'd like to grade
					</p>
				</div>

				<div className="space-y-4">
					{RUBRIC_CATEGORY_IDS.map((categoryId) => {
						const category = RUBRIC_CATEGORIES[categoryId];
						return (
							<div key={categoryId} className="flex items-start space-x-3">
								<Checkbox id={categoryId} name={categoryId} className="mt-1" />
								<div className="flex-1">
									<label
										htmlFor={categoryId}
										className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									>
										{category.label}
									</label>
									<p className="text-sm text-muted-foreground mt-1">
										{category.description}
									</p>
								</div>
								<div
									className={`w-3 h-3 rounded-full ${category.bgClass} ${category.borderClass} border-2 mt-1`}
								/>
							</div>
						);
					})}
				</div>

				<Separator />

				<div className="flex items-start space-x-3 p-4 bg-muted/50 rounded-lg">
					<Checkbox id="useFullRubric" name="useFullRubric" className="mt-1" />
					<div className="flex-1">
						<label
							htmlFor="useFullRubric"
							className="text-sm font-medium leading-none cursor-pointer"
						>
							Use Full Rubric
						</label>
						<p className="text-sm text-muted-foreground mt-1">
							Grade all five categories
						</p>
					</div>
				</div>
			</div>

			<div className="flex justify-end">
				<Button type="submit">Next: Review AI Feedback</Button>
			</div>
		</form>
	);
}
