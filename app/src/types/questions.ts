// Purpose: Define shared question payload shapes for the Questions screen routing and rendering.
// Persists: No persistence.
// Security Risks: None.
export type QuestionOptionDefinition = {
  id: string;
  labelKey: string;
};

export type QuestionDefinition = {
  id: string;
  key?: string;
  slug?: string;
  labelKey: string;
  options: QuestionOptionDefinition[];
};
