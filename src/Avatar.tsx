const COLORS = ['#6d4aff', '#d6393f', '#2fb67c', '#e9a020', '#3f8ef0', '#c25b9e', '#0f9d9a', '#7a5af8'];
export default function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return <span className="avatar" style={{ background: COLORS[h % COLORS.length], width: size, height: size, fontSize: size * 0.46 }}>{(name[0] ?? '?').toUpperCase()}</span>;
}
