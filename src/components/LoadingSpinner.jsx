import '../styles/loading.css'

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="spinner"></div>
        <p className="loading-text">{message}</p>
      </div>
    </div>
  )
}

export function LoadingScreen({ message = 'Initializing app...' }) {
  return (
    <div style={styles.screen}>
      <div style={styles.content}>
        <div style={styles.spinner}>
          <div style={styles.spinnerCircle}></div>
        </div>
        <p style={styles.text}>{message}</p>
      </div>
    </div>
  )
}

export function SkeletonLoader({ count = 3 }) {
  return (
    <div style={styles.skeletonContainer}>
      {[...Array(count)].map((_, i) => (
        <div key={i} style={styles.skeletonItem}>
          <div style={styles.skeletonAvatar}></div>
          <div>
            <div style={styles.skeletonLine}></div>
            <div style={styles.skeletonLine} style={{ width: '60%' }}></div>
          </div>
        </div>
      ))}
    </div>
  )
}

const styles = {
  screen: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0a0a14 0%, #111122 100%)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  spinner: {
    position: 'relative',
    width: '50px',
    height: '50px',
  },
  spinnerCircle: {
    width: '100%',
    height: '100%',
    border: '3px solid rgba(27, 60, 83, 0.2)',
    borderTop: '3px solid #234C6A',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  text: {
    color: '#E3E3E3',
    fontSize: '14px',
    textAlign: 'center',
  },
  skeletonContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
  },
  skeletonItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    background: 'rgba(27, 60, 83, 0.1)',
  },
  skeletonAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(90deg, rgba(27, 60, 83, 0.1), rgba(27, 60, 83, 0.2), rgba(27, 60, 83, 0.1))',
    backgroundSize: '200% 100%',
    animation: 'shimmer 2s infinite',
  },
  skeletonLine: {
    height: '8px',
    borderRadius: '4px',
    background: 'linear-gradient(90deg, rgba(27, 60, 83, 0.1), rgba(27, 60, 83, 0.2), rgba(27, 60, 83, 0.1))',
    backgroundSize: '200% 100%',
    animation: 'shimmer 2s infinite',
    marginBottom: '8px',
  },
}
