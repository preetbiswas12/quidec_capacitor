import '../styles/bottom-sheet.css'
import { useEffect, useRef } from 'react'

export default function BottomSheet({ isOpen, onClose, title, children, height = '60vh' }) {
  const sheetRef = useRef(null)
  const overlayRef = useRef(null)
  const startYRef = useRef(0)
  const currentYRef = useRef(0)

  useEffect(() => {
    if (!isOpen) return

    // Prevent body scroll when sheet is open
    document.body.style.overflow = 'hidden'

    const handleTouchStart = (e) => {
      startYRef.current = e.touches[0].clientY
      currentYRef.current = 0
    }

    const handleTouchMove = (e) => {
      if (!sheetRef.current) return
      const delta = e.touches[0].clientY - startYRef.current
      if (delta > 0) {
        currentYRef.current = delta
        sheetRef.current.style.transform = `translateY(${delta}px)`
      }
    }

    const handleTouchEnd = () => {
      if (currentYRef.current > 100) {
        onClose()
      } else {
        sheetRef.current.style.transform = 'translateY(0)'
        currentYRef.current = 0
      }
    }

    const sheet = sheetRef.current
    if (sheet) {
      sheet.addEventListener('touchstart', handleTouchStart)
      sheet.addEventListener('touchmove', handleTouchMove)
      sheet.addEventListener('touchend', handleTouchEnd)
    }

    return () => {
      if (sheet) {
        sheet.removeEventListener('touchstart', handleTouchStart)
        sheet.removeEventListener('touchmove', handleTouchMove)
        sheet.removeEventListener('touchend', handleTouchEnd)
      }
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="bottom-sheet-container">
      <div
        ref={overlayRef}
        className="bottom-sheet-overlay"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className="bottom-sheet"
        style={{ maxHeight: height }}
      >
        <div className="bottom-sheet-handle"></div>
        {title && <h3 className="bottom-sheet-title">{title}</h3>}
        <div className="bottom-sheet-content">
          {children}
        </div>
      </div>
    </div>
  )
}
