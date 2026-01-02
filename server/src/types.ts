export type Category =
  | "Current News and Events"
  | "History"
  | "Geography"
  | "Entertainment"
  | "Sports"
  | "Science"
  | "Business"
  | "Pop Culture";

export interface Question {
  id: string;
  category: Category;
  prompt: string;
  choices: string[];
}

export interface StoredQuestion extends Question {
  correctIndex: number;
  explanation?: string;
  fingerprint: string;
  source?: string;
}

export interface Game {
  id: string;
  selectedCategories: Category[];
  questions: StoredQuestion[];
  usedFingerprints: string[];
  createdAt: string;
}
