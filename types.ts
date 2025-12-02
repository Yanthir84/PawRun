export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export enum Lane {
  LEFT = 0,
  CENTER = 1,
  RIGHT = 2
}

export enum EntityType {
  OBSTACLE_LOW = 'OBSTACLE_LOW',   // Jump over
  OBSTACLE_HIGH = 'OBSTACLE_HIGH', // Duck under
  COIN = 'COIN'                    // Collect
}

export interface GameEntity {
  id: number;
  lane: Lane;
  z: number; // 0 to 100 (100 is player position, 0 is horizon)
  type: EntityType;
}

export interface Mission {
  title: string;
  description: string;
}
