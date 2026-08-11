export function CamuzziLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Flame shape - Camuzzi gas flame logo */}
      <path
        d="M100 20C80 50 50 80 50 120C50 155 72 180 100 180C128 180 150 155 150 120C150 80 120 50 100 20Z"
        fill="#0066B3"
      />
      <path
        d="M100 60C88 80 70 100 70 125C70 147 83 163 100 163C117 163 130 147 130 125C130 100 112 80 100 60Z"
        fill="#50FFD4"
      />
      <path
        d="M100 95C94 105 85 115 85 130C85 142 91 150 100 150C109 150 115 142 115 130C115 115 106 105 100 95Z"
        fill="white"
      />
    </svg>
  )
}
