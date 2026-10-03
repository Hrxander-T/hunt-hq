export type Status = 'planned' | 'hunting' | 'caught';
export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type IvOp = 'eq' | 'min' | 'max';
export interface IvReq { op: IvOp; v: number }
export type IvReqs = Partial<Record<StatKey, IvReq>>;
export interface Hunt {
  id: string; pokemon_id: number; name: string; types: string[]; shiny: boolean;
  natures: string[]; abilities: string[]; iv_reqs: IvReqs; notes: string | null;
  priority: number; status: Status; hunter_id: string | null; added_by: string | null; created_at: string;
}
export interface Profile { id: string; name: string; emoji: string }
