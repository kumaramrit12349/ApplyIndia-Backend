export interface IScraperConfig {
  pk: string;
  sk: string;
  type: string;
  key: string;
  name: string;
  listingUrl: string;
  defaultCategory: string;
  defaultState: string;
  isActive: boolean;
  created_at?: number;
  modified_at?: number;
  created_by?: string;
  is_archived?: boolean;
}
