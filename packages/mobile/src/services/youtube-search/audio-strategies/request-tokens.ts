export function generateCpn(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  let value = '';
  for (let index = 0; index < 16; index++) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

export function generateT(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 12; index++) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}
