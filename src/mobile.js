const hasTouchUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobi/i.test(navigator.userAgent)
const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches
const hasTouchHardware = navigator.maxTouchPoints > 0
export const isMobile = isCoarsePointer && (hasTouchUA || hasTouchHardware)
