const maxAge = 7 * 24 * 60 * 60;

const setCookie = (name, value) => {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
};

const getCookie = (name) => {
  const key = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(key));
  return cookie ? decodeURIComponent(cookie.slice(key.length)) : "";
};

export const persistRoomIdentity = (roomId, userId) => {
  setCookie("pair_roomId", roomId);
  setCookie(`pair_userId_${roomId}`, userId);
};

export const getOrCreateRoomUserId = (roomId) => {
  const existing = getCookie(`pair_userId_${roomId}`);
  if (existing) {
    setCookie("pair_roomId", roomId);
    return existing;
  }
  const userId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  persistRoomIdentity(roomId, userId);
  return userId;
};
