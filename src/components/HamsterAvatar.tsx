import { motion } from 'framer-motion'

interface Props {
  color: string
  spinning?: boolean
  size?: number
}

/** A hamster face inside a running wheel. Only the wheel ring spins. */
export function HamsterAvatar({ color, spinning = false, size = 44 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <motion.g
        style={{ transformOrigin: '24px 24px' }}
        animate={spinning ? { rotate: 360 } : { rotate: 0 }}
        transition={spinning ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0.5 }}
      >
        <circle cx="24" cy="24" r="22" fill="rgba(255,255,255,0.7)" stroke={color} strokeWidth="2.5" />
        {[0, 60, 120].map((deg) => (
          <line
            key={deg}
            x1="24"
            y1="3"
            x2="24"
            y2="45"
            stroke={color}
            strokeOpacity="0.35"
            strokeWidth="1.5"
            transform={`rotate(${deg} 24 24)`}
          />
        ))}
      </motion.g>
      <circle cx="15.5" cy="15" r="4.2" fill={color} />
      <circle cx="32.5" cy="15" r="4.2" fill={color} />
      <circle cx="15.5" cy="15" r="2" fill="#fff" fillOpacity="0.7" />
      <circle cx="32.5" cy="15" r="2" fill="#fff" fillOpacity="0.7" />
      <ellipse cx="24" cy="26" rx="11" ry="10" fill={color} />
      <ellipse cx="24" cy="30" rx="6.5" ry="5" fill="#fff" fillOpacity="0.8" />
      <circle cx="19.5" cy="23.5" r="1.7" fill="#122d45" />
      <circle cx="28.5" cy="23.5" r="1.7" fill="#122d45" />
      <ellipse cx="24" cy="27.5" rx="1.6" ry="1.1" fill="#122d45" />
    </svg>
  )
}
