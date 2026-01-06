import { QuickEntry } from '@/components/QuickEntry';

export default function HomePage() {
  return (
    <>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
        }}>
          Notion記帳
        </h1>
        <p style={{ 
          fontSize: '0.875rem', 
          color: 'var(--text-secondary)',
          marginTop: '4px',
        }}>
          快速記錄收支
        </p>
      </header>

      <QuickEntry />
    </>
  );
}
