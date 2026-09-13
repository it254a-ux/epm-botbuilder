
export default function ViewportScaler({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100%', overflowX: 'hidden' }}>
      {children}
    </div>
  );
}
