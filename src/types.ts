export type Status = 'planned' | 'hunting' | 'caught';
export interface Hunt {
  id: string; pokemon_id: number; name: string; types: string[]; shiny: boolean;
  nature: string | null; ability: string | null; ivs: string | null; ball: string | null; notes: string | null;
  priority: number; status: Status; attempts: number; hunter_id: string | null; added_by: string | null; created_at: string;
}
export interface Profile { id: string; name: string; emoji: string }
export interface Activity { id: number; user_id: string | null; text: string; created_at: string }
