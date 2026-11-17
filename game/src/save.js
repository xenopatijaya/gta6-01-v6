// save.js — localStorage saves: cash, missions, position and health.
// Autosaves after every completed job and every 30 seconds of play.

const KEY = 'portoalba_save_v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(G) {
  try {
    const p = G.player.inCar ? G.player.inCar.pos : G.player.pos;
    const data = {
      version: 1,
      cash: Math.floor(G.cash),
      missionsCompleted: G.missions.completed,
      missionIndex: G.missions.index,
      totalEarned: G.missions.totalEarned,
      health: Math.round(G.player.health),
      pos: { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 },
      playSeconds: Math.round(G.playSeconds || 0),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function applySave(G, data) {
  G.cash = data.cash;
  G.missions.completed = data.missionsCompleted || 0;
  G.missions.index = data.missionIndex || 0;
  G.missions.totalEarned = data.totalEarned || 0;
  G.player.health = data.health || 100;
  if (data.pos) {
    G.player.pos.set(data.pos.x, 0, data.pos.z);
    G.player.group.position.copy(G.player.pos);
  }
  G.playSeconds = data.playSeconds || 0;
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}
