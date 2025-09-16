export interface Character {
  name: string;
  position: string;
  personality: string;
  isVillain: boolean;
  status: 'active' | 'voted_out';
  imageUrl: string | null;
  isPlayer?: boolean;
  votes?: number;
}

export interface Message {
  sender: 'system' | string;
  text: string;
  isSpecial?: boolean;
  isPrivate?: boolean;
  imageUrl?: string | null;
}

export type GameState = 'welcome' | 'setting_up' | 'briefing' | 'discussion' | 'voting' | 'reveal' | 'game_over_win' | 'game_over_loss';